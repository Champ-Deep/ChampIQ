import { ElevenLabsConfig } from '../../config/schema.js';
import { CallParams, IVoiceProvider, Message, ProviderCallResult, WebhookPayload } from '../types.js';
import { ELOutboundCallRequest, ELOutboundCallResponse, ELTranscriptResponse, ELWebhookPayload } from './types.js';
import { parseElevenLabsWebhook } from './webhook.js';

const EL_BASE = 'https://api.elevenlabs.io/v1';

export class ElevenLabsProvider implements IVoiceProvider {
  readonly name = 'elevenlabs';

  constructor(private cfg: ElevenLabsConfig) {}

  async initiateCall(params: CallParams): Promise<ProviderCallResult> {
    const apiKey = params.elevenlabsApiKey ?? this.cfg.api_key;
    const agentId = params.elevenlabsAgentId ?? this.cfg.agent_id;
    const phoneNumberId = params.elevenlabsPhoneNumberId ?? this.cfg.phone_number_id;

    if (!apiKey) throw new Error('ElevenLabs API key is required (set in ChampVoice credentials or ELEVENLABS_API_KEY)');
    if (!agentId) throw new Error('ElevenLabs agent ID is required (set in ChampVoice credentials or ELEVENLABS_AGENT_ID)');
    if (!phoneNumberId) throw new Error('ElevenLabs phone number ID is required (set in ChampVoice credentials or ELEVENLABS_PHONE_NUMBER_ID)');

    const dynamicVars: Record<string, string> = {
      lead_name: params.leadName,
      company: params.company,
      email: params.email,
      ...params.dynamicVars,
    };
    if (params.script) dynamicVars['script'] = params.script;
    if (params.prevSummary) dynamicVars['prev_summary'] = params.prevSummary;
    if (params.prevOutcome) dynamicVars['prev_outcome'] = params.prevOutcome;
    if (params.prevCallDate) dynamicVars['prev_call_date'] = params.prevCallDate;

    const body: ELOutboundCallRequest = {
      agent_id: agentId,
      agent_phone_number_id: phoneNumberId,
      to_number: params.toNumber,
      conversation_initiation_client_data: {
        type: 'conversation_initiation_client_data',
        dynamic_variables: dynamicVars,
      },
    };

    const res = await fetch(`${EL_BASE}/convai/twilio/outbound-call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json() as ELOutboundCallResponse;

    if (!res.ok) {
      throw new Error(`ElevenLabs API error ${res.status}: ${JSON.stringify(data)}`);
    }

    return {
      conversationId: data.conversation_id,
      providerRaw: data as Record<string, unknown>,
    };
  }

  async getTranscript(conversationId: string): Promise<Message[]> {
    const res = await fetch(`${EL_BASE}/convai/conversations/${conversationId}`, {
      headers: { 'xi-api-key': this.cfg.api_key },
    });

    if (!res.ok) {
      throw new Error(`ElevenLabs transcript fetch error ${res.status}`);
    }

    const data = await res.json() as ELTranscriptResponse;

    const startSecs = data.metadata?.start_time_unix_secs ?? 0;

    return (data.transcript ?? []).map(t => ({
      speaker: t.role === 'agent' ? 'agent' : 'lead',
      text: t.message,
      timestamp: startSecs
        ? new Date((startSecs + t.time_in_call_secs) * 1000).toISOString()
        : new Date().toISOString(),
    }));
  }

  async cancelCall(_conversationId: string): Promise<void> {
    // ElevenLabs does not yet expose a cancel endpoint for in-flight calls
    throw new Error('ElevenLabs does not support call cancellation via API');
  }

  parseWebhook(body: unknown, signature: string, secret?: string): WebhookPayload {
    return parseElevenLabsWebhook(body as ELWebhookPayload, signature, secret ?? this.cfg.webhook_secret);
  }
}
