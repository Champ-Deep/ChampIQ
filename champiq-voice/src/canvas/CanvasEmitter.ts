import crypto from 'crypto';
import { CanvasConfig } from '../config/schema.js';
import { ChampGraph } from '../graph/ChampGraph.js';
import { CanvasEvent } from './types.js';
import { CanvasEventType } from '../graph/types.js';

function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

async function postWithRetry(
  url: string,
  body: string,
  headers: Record<string, string>,
  maxAttempts = 3,
): Promise<void> {
  const delays = [1000, 3000, 9000]; // exponential backoff
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(url, { method: 'POST', headers, body });
      if (res.ok) return;
      const text = await res.text();
      console.error(`[canvas] emit failed (${res.status}): ${text}`);
    } catch (err) {
      console.error(`[canvas] emit error (attempt ${attempt + 1}):`, (err as Error).message);
    }
    if (attempt < maxAttempts - 1) {
      await new Promise(r => setTimeout(r, delays[attempt]));
    }
  }
  throw new Error(`Canvas emit failed after ${maxAttempts} attempts`);
}

export class CanvasEmitter {
  constructor(
    private cfg: CanvasConfig | undefined,
    private graph: ChampGraph,
  ) {}

  async emit(event: CanvasEvent): Promise<void> {
    if (!this.cfg?.webhook_url) {
      return; // Canvas not configured — skip silently
    }

    const body = JSON.stringify(event);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.cfg.webhook_secret) {
      headers['X-Champiq-Signature'] = sign(body, this.cfg.webhook_secret);
    }

    try {
      await postWithRetry(this.cfg.webhook_url, body, headers);
      await this.graph.markCanvasEventSent(event.callId, event.event as CanvasEventType);
      console.log(`[canvas] emitted ${event.event} for call ${event.callId}`);
    } catch (err) {
      console.error(`[canvas] failed to emit ${event.event}:`, (err as Error).message);
      // Don't re-throw — a canvas emit failure should not break the webhook response
    }
  }
}
