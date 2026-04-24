import crypto from 'crypto';
import { Message, WebhookPayload } from '../types.js';
import { ELWebhookPayload } from './types.js';

const STATUS_MAP: Record<string, string> = {
  'ringing': 'in_progress',
  'in-progress': 'in_progress',
  'in_progress': 'in_progress',
  'completed': 'completed',
  'done': 'completed',
  'failed': 'failed',
  'busy': 'failed',
  'no-answer': 'failed',
  'no_answer': 'failed',
  'canceled': 'failed',
};

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function parseElevenLabsWebhook(
  body: ELWebhookPayload,
  signature: string,
  secret?: string,
): WebhookPayload {
  if (secret && signature) {
    const rawBody = JSON.stringify(body);
    if (!verifySignature(rawBody, signature, secret)) {
      throw new Error('Invalid webhook signature');
    }
  }

  const d = body.data;
  const startSecs = d.metadata?.start_time_unix_secs ?? 0;

  // champiq callId is stored in the agent's data_collection_results or injected as dynamic var
  // We use conversation_id as fallback — the orchestrator maps conv→call via ChampGraph
  const callId = d.analysis?.data_collection_results?.['leadId']?.value ?? '';

  const messages: Message[] = (d.transcript ?? []).map(t => ({
    speaker: t.role === 'agent' ? 'agent' : 'lead',
    text: t.message,
    timestamp: startSecs
      ? new Date((startSecs + t.time_in_call_secs) * 1000).toISOString()
      : new Date().toISOString(),
  }));

  return {
    callId,
    conversationId: d.conversation_id,
    transcript: messages,
    status: STATUS_MAP[d.status?.toLowerCase()] ?? 'completed',
    durationSeconds: d.metadata?.call_duration_secs,
    recordingUrl: d.metadata?.recording_url,
  };
}
