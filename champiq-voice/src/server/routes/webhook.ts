import { Router, Request, Response } from 'express';
import { Config } from '../../config/schema.js';
import { ProviderRegistry } from '../../providers/registry.js';
import { CallOrchestrator } from '../../orchestrator/CallOrchestrator.js';

export function webhookRouter(
  config: Config,
  registry: ProviderRegistry,
  orchestrator: CallOrchestrator,
): Router {
  const router = Router();

  // POST /v1/webhook — receives post-call data from voice providers
  // Query param ?provider=elevenlabs selects the parser (defaults to configured default)
  router.post('/', async (req: Request, res: Response) => {
    const providerName =
      (req.query['provider'] as string) ?? config.gateway.default_provider;
    const signature =
      (req.headers['x-webhook-signature'] as string) ??
      (req.headers['x-elevenlabs-signature'] as string) ??
      '';

    // Acknowledge immediately — processing is async
    res.status(200).json({ received: true });

    try {
      const provider = registry.get(providerName);
      const payload = provider.parseWebhook(req.body, signature);
      await orchestrator.processWebhook(payload);
    } catch (err) {
      // Already responded 200 — log the failure for visibility
      console.error('[webhook] processing error:', (err as Error).message);
    }
  });

  return router;
}
