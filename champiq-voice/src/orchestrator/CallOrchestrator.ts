import { v4 as uuidv4 } from 'uuid';
import { Config } from '../config/schema.js';
import { ProviderRegistry } from '../providers/registry.js';
import { CallParams, WebhookPayload } from '../providers/types.js';
import { ChampGraph } from '../graph/ChampGraph.js';
import { buildPrevContextVars } from '../graph/queries.js';
import { CallNode, CallOutcome, CallStatus } from '../graph/types.js';
import { CanvasEmitter } from '../canvas/CanvasEmitter.js';

export interface InitiateCallOptions {
  toNumber: string;
  leadName?: string;
  company?: string;
  email?: string;
  script?: string;
  flowId?: string;
  canvasNodeId?: string;
  provider?: string;
  agentId?: string;
  dynamicVars?: Record<string, string>;
  // Per-call credential overrides forwarded from ChampIQ Canvas credential store
  elevenlabsApiKey?: string;
  elevenlabsPhoneNumberId?: string;
}

export interface InitiateCallResult {
  callId: string;
  conversationId: string;
  status: CallStatus;
}

export class CallOrchestrator {
  private registry: ProviderRegistry;
  private graph: ChampGraph;
  private emitter: CanvasEmitter;
  private config: Config;

  constructor(config: Config, graph: ChampGraph) {
    this.config = config;
    this.registry = new ProviderRegistry(config);
    this.graph = graph;
    this.emitter = new CanvasEmitter(config.canvas, graph);
  }

  async initiateCall(opts: InitiateCallOptions): Promise<InitiateCallResult> {
    const providerName = opts.provider ?? this.config.gateway.default_provider;
    const provider = this.registry.get(providerName);

    const contactId = opts.toNumber; // normalized phone = contact identity
    const callId = `call_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();

    // Build dynamic vars
    const dynamicVars: Record<string, string> = { ...(opts.dynamicVars ?? {}), leadId: callId };

    // Inject previous call context if configured
    let prevCallId: string | undefined;
    if (this.config.graph.inject_prev_context) {
      const prevCall = await this.graph.getLastCompletedCall(contactId);
      if (prevCall) {
        prevCallId = prevCall.callId;
        const prevVars = buildPrevContextVars(prevCall);
        Object.assign(dynamicVars, prevVars);
        console.log(`[orchestrator] injecting prev context from ${prevCall.callId}`);
      }
    }

    const params: CallParams = {
      toNumber: opts.toNumber,
      leadName: opts.leadName ?? '',
      company: opts.company ?? '',
      email: opts.email ?? '',
      script: opts.script,
      dynamicVars,
      elevenlabsApiKey: opts.elevenlabsApiKey,
      elevenlabsAgentId: opts.agentId,
      elevenlabsPhoneNumberId: opts.elevenlabsPhoneNumberId,
    };

    // Initiate call with provider
    const result = await provider.initiateCall(params);

    // Resolve agentId for the CallNode record (per-call > config default)
    const agentId = opts.agentId ?? (this.config.providers.elevenlabs?.agent_id ?? '');

    // Build initial CallNode
    const node: CallNode = {
      callId,
      conversationId: result.conversationId,
      contactId,
      flowId: opts.flowId,
      canvasNodeId: opts.canvasNodeId,
      prevCallId,
      provider: providerName,
      agentId,
      toNumber: opts.toNumber,
      leadName: opts.leadName ?? '',
      company: opts.company ?? '',
      email: opts.email ?? '',
      script: opts.script,
      dynamicVars,
      status: 'initiated',
      timestamps: { created: now },
      transcript: [],
      outcome: 'unknown',
      canvasSynced: false,
      canvasEventsSent: [],
    };

    await this.graph.saveCall(node);

    // If there's a previous call, link nextCallId retroactively
    if (prevCallId) {
      await this.graph.updateCall(prevCallId, { nextCallId: callId });
    }

    // Emit call.initiated to Canvas
    await this.emitter.emit({
      event: 'call.initiated',
      callId,
      flowId: opts.flowId,
      canvasNodeId: opts.canvasNodeId,
      timestamp: now,
      payload: node,
    });

    console.log(`[orchestrator] call initiated: ${callId} → conv ${result.conversationId}`);
    return { callId, conversationId: result.conversationId, status: 'initiated' };
  }

  async processWebhook(webhookPayload: WebhookPayload): Promise<void> {
    const { conversationId, transcript, status, durationSeconds, recordingUrl } = webhookPayload;

    // Resolve callId via conversationId lookup in ChampGraph
    let node = await this.graph.getCallByConversationId(conversationId);

    // Fallback: if provider embedded callId in the webhook
    if (!node && webhookPayload.callId) {
      node = await this.graph.getCall(webhookPayload.callId);
    }

    if (!node) {
      console.warn(`[orchestrator] webhook for unknown conversation: ${conversationId}`);
      return;
    }

    const callId = node.callId;
    const finalStatus: CallStatus = status === 'completed' ? 'completed' : 'failed';
    const completedAt = new Date().toISOString();

    // Update graph
    const updated = await this.graph.updateCall(callId, {
      status: finalStatus,
      transcript,
      durationSeconds,
      recordingUrl,
      timestamps: { completed: completedAt },
    });

    if (!updated) return;

    // Determine outcome from analysis data (if available in dynamicVars)
    const outcome = (updated.dynamicVars['outcome'] as CallOutcome) ?? 'unknown';
    if (outcome !== 'unknown') {
      await this.graph.setOutcome(callId, outcome);
    }

    const eventType = finalStatus === 'completed' ? 'call.completed' : 'call.failed';

    // Load previous call for context in canvas event
    let prevContext: CallNode | undefined;
    if (updated.prevCallId) {
      prevContext = (await this.graph.getCall(updated.prevCallId)) ?? undefined;
    }

    // Emit to Canvas
    await this.emitter.emit({
      event: eventType,
      callId,
      flowId: updated.flowId,
      canvasNodeId: updated.canvasNodeId,
      timestamp: completedAt,
      payload: updated,
      prevContext,
    });

    // If transcript present, emit transcript.ready as well
    if (transcript.length > 0) {
      await this.emitter.emit({
        event: 'transcript.ready',
        callId,
        flowId: updated.flowId,
        canvasNodeId: updated.canvasNodeId,
        timestamp: completedAt,
        payload: updated,
        prevContext,
      });
    }

    console.log(`[orchestrator] webhook processed: ${callId} → ${finalStatus}`);
  }

  async getCall(callId: string): Promise<CallNode | null> {
    return this.graph.getCall(callId);
  }

  async listContactCalls(contactId: string): Promise<CallNode[]> {
    const history = await this.graph.getContactHistory(contactId);
    return history.calls;
  }

  async listFlowCalls(flowId: string): Promise<CallNode[]> {
    const ctx = await this.graph.getFlowCalls(flowId);
    return ctx.calls;
  }
}
