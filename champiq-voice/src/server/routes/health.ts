import { Router } from 'express';
import { Config } from '../../config/schema.js';

export function healthRouter(config?: Config): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'champiq-voice-gateway', timestamp: new Date().toISOString() });
  });

  // Returns the public webhook URL to paste into ElevenLabs post-call webhook settings.
  // PUBLIC_GATEWAY_URL env var sets the base; falls back to the request origin.
  router.get('/v1/info', (req, res) => {
    const base = (
      config?.gateway?.public_url ||
      `${req.protocol}://${req.get('host')}`
    ).replace(/\/$/, '');
    res.json({
      webhook_url: `${base}/v1/webhook`,
      canvas_webhook_url: config?.canvas?.webhook_url ?? null,
    });
  });

  return router;
}
