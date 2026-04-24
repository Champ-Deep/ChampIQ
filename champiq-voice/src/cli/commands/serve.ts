import { Command } from 'commander';
import { ConfigStore } from '../../config/ConfigStore.js';
import { ChampGraph } from '../../graph/ChampGraph.js';
import { createApp } from '../../server/app.js';

export function serveCommand(): Command {
  return new Command('serve')
    .description('Start the ChampIQ Voice Gateway HTTP server')
    .option('-p, --port <port>', 'Port to listen on (overrides config)', parseInt)
    .action(async (opts: { port?: number }) => {
      const config = ConfigStore.loadOrEmpty();
      const port = opts.port ?? config.gateway.port;

      const graph = new ChampGraph(config.redis.url, config.redis.ttl_days);
      await graph.connect();
      console.log(`[gateway] Connected to Redis`);

      const app = createApp(config, graph);

      const server = app.listen(port, () => {
        console.log(`\x1b[32m✓\x1b[0m ChampIQ Voice Gateway running on port ${port}`);
        console.log(`  POST /v1/calls        → initiate call`);
        console.log(`  GET  /v1/calls/:id    → get call node`);
        console.log(`  GET  /v1/calls        → list calls (?contact= or ?flow=)`);
        console.log(`  POST /v1/webhook      → inbound provider webhook`);
        console.log(`  GET  /health          → health check`);
        if (config.gateway.api_key) {
          console.log(`\n  Auth: X-Api-Key header required`);
        }
        if (config.canvas?.webhook_url) {
          console.log(`  Canvas: ${config.canvas.webhook_url}`);
        }
      });

      const shutdown = async () => {
        console.log('\n[gateway] Shutting down...');
        server.close();
        await graph.disconnect();
        process.exit(0);
      };

      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
    });
}
