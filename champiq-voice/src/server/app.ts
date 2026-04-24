import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { Config } from '../config/schema.js';
import { ChampGraph } from '../graph/ChampGraph.js';
import { CallOrchestrator } from '../orchestrator/CallOrchestrator.js';
import { ProviderRegistry } from '../providers/registry.js';
import { apiKeyAuth } from './middleware/auth.js';
import { healthRouter } from './routes/health.js';
import { callsRouter } from './routes/calls.js';
import { webhookRouter } from './routes/webhook.js';

export function createApp(config: Config, graph: ChampGraph): express.Application {
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(morgan('dev'));
  // Raw body needed for HMAC verification on webhook route
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  const orchestrator = new CallOrchestrator(config, graph);
  const registry = new ProviderRegistry(config);
  const auth = apiKeyAuth(config.gateway.api_key);

  app.use('/', healthRouter(config));
  app.use('/v1/calls', auth, callsRouter(orchestrator));
  app.use('/v1/webhook', webhookRouter(config, registry, orchestrator));
  // Alias so any webhook registered at the bare domain root still works
  app.use('/webhook', webhookRouter(config, registry, orchestrator));

  // 404 for everything else
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}
