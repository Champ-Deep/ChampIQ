import Redis from 'ioredis';
import { CallNode, CallStatus, CallOutcome, CanvasEventType, ContactHistory, FlowContext } from './types.js';
import { Message } from '../providers/types.js';

const PREFIX = 'champgraph';

function callKey(callId: string) { return `${PREFIX}:call:${callId}`; }
function convKey(conversationId: string) { return `${PREFIX}:conv:${conversationId}`; }
function contactKey(contactId: string) { return `${PREFIX}:contact:${contactId}`; }
function flowKey(flowId: string) { return `${PREFIX}:flow:${flowId}:calls`; }
function agentKey(agentId: string) { return `${PREFIX}:agent:${agentId}:calls`; }

export class ChampGraph {
  private redis: Redis;
  private ttl: number; // seconds

  constructor(redisUrl: string, ttlDays: number = 30) {
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times) => Math.min(times * 200, 5000),
      lazyConnect: true,
    });
    this.ttl = ttlDays * 86400;

    this.redis.on('error', (err) => {
      console.error('[champgraph] Redis error:', err.message);
    });
  }

  async connect(): Promise<void> {
    await this.redis.connect();
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }

  // ── Write ──────────────────────────────────────────────────────────────────

  async saveCall(node: CallNode): Promise<void> {
    const score = Date.now();
    const json = JSON.stringify(node);

    const pipeline = this.redis.pipeline();

    // Primary record
    pipeline.setex(callKey(node.callId), this.ttl, json);

    // conversationId → callId lookup
    pipeline.setex(convKey(node.conversationId), this.ttl, node.callId);

    // Contact sorted set (score = ms timestamp so ZREVRANGE gives newest first)
    pipeline.zadd(contactKey(node.contactId), score, node.callId);
    pipeline.expire(contactKey(node.contactId), this.ttl);

    // Flow index
    if (node.flowId) {
      pipeline.zadd(flowKey(node.flowId), score, node.callId);
      pipeline.expire(flowKey(node.flowId), this.ttl);
    }

    // Agent index
    if (node.agentId) {
      pipeline.zadd(agentKey(node.agentId), score, node.callId);
      pipeline.expire(agentKey(node.agentId), this.ttl);
    }

    await pipeline.exec();
  }

  async updateCall(
    callId: string,
    patch: Partial<Omit<CallNode, 'callId' | 'timestamps'>> & { timestamps?: Partial<CallNode['timestamps']> },
  ): Promise<CallNode | null> {
    const existing = await this.getCall(callId);
    if (!existing) return null;

    const updated: CallNode = {
      ...existing,
      ...patch,
      timestamps: { ...existing.timestamps, ...patch.timestamps },
      dynamicVars: { ...existing.dynamicVars, ...patch.dynamicVars },
      canvasEventsSent: patch.canvasEventsSent
        ? [...new Set([...existing.canvasEventsSent, ...patch.canvasEventsSent])]
        : existing.canvasEventsSent,
    };

    await this.redis.setex(callKey(callId), this.ttl, JSON.stringify(updated));
    return updated;
  }

  async linkNext(prevCallId: string, nextCallId: string): Promise<void> {
    const prev = await this.getCall(prevCallId);
    if (prev) {
      await this.updateCall(prevCallId, { nextCallId });
    }
    const next = await this.getCall(nextCallId);
    if (next) {
      await this.updateCall(nextCallId, { prevCallId });
    }
  }

  // ── Read ───────────────────────────────────────────────────────────────────

  async getCall(callId: string): Promise<CallNode | null> {
    const raw = await this.redis.get(callKey(callId));
    return raw ? (JSON.parse(raw) as CallNode) : null;
  }

  async getCallByConversationId(conversationId: string): Promise<CallNode | null> {
    const callId = await this.redis.get(convKey(conversationId));
    if (!callId) return null;
    return this.getCall(callId);
  }

  async getContactHistory(contactId: string, limit = 20): Promise<ContactHistory> {
    // Newest first
    const callIds = await this.redis.zrevrange(contactKey(contactId), 0, limit - 1);
    const calls = await this.batchGetCalls(callIds);
    return { contactId, calls };
  }

  async getFlowCalls(flowId: string, limit = 100): Promise<FlowContext> {
    const callIds = await this.redis.zrevrange(flowKey(flowId), 0, limit - 1);
    const calls = await this.batchGetCalls(callIds);
    return { flowId, calls };
  }

  async getAgentCalls(agentId: string, limit = 100): Promise<CallNode[]> {
    const callIds = await this.redis.zrevrange(agentKey(agentId), 0, limit - 1);
    return this.batchGetCalls(callIds);
  }

  /** Get the most recent completed call for a contact (for prev-context injection) */
  async getLastCompletedCall(contactId: string): Promise<CallNode | null> {
    const callIds = await this.redis.zrevrange(contactKey(contactId), 0, 20);
    for (const id of callIds) {
      const node = await this.getCall(id);
      if (node && node.status === 'completed') return node;
    }
    return null;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async batchGetCalls(callIds: string[]): Promise<CallNode[]> {
    if (callIds.length === 0) return [];
    const pipeline = this.redis.pipeline();
    for (const id of callIds) pipeline.get(callKey(id));
    const results = await pipeline.exec();
    const nodes: CallNode[] = [];
    if (results) {
      for (const [, raw] of results) {
        if (raw && typeof raw === 'string') {
          nodes.push(JSON.parse(raw) as CallNode);
        }
      }
    }
    return nodes;
  }

  // ── Typed update helpers (used by orchestrator) ────────────────────────────

  async setStatus(callId: string, status: CallStatus): Promise<void> {
    await this.updateCall(callId, { status });
  }

  async setTranscript(callId: string, transcript: Message[], durationSeconds?: number, recordingUrl?: string): Promise<void> {
    const completedAt = new Date().toISOString();
    await this.updateCall(callId, {
      transcript,
      durationSeconds,
      recordingUrl,
      timestamps: { completed: completedAt },
    });
  }

  async setSummary(callId: string, summary: string): Promise<void> {
    await this.updateCall(callId, { summary });
  }

  async setOutcome(callId: string, outcome: CallOutcome): Promise<void> {
    await this.updateCall(callId, { outcome });
  }

  async markCanvasEventSent(callId: string, eventType: CanvasEventType): Promise<void> {
    const node = await this.getCall(callId);
    if (!node) return;
    const events = [...new Set([...node.canvasEventsSent, eventType])];
    await this.updateCall(callId, { canvasEventsSent: events as CanvasEventType[], canvasSynced: true });
  }
}
