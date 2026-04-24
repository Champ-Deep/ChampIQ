import { Command } from 'commander';
import { ConfigStore } from '../../config/ConfigStore.js';
import { ChampGraph } from '../../graph/ChampGraph.js';

export function statusCommand(): Command {
  return new Command('status')
    .description('Get the status of a specific call')
    .argument('<callId>', 'The champiq call ID (e.g. call_abc123)')
    .action(async (callId: string) => {
      const config = ConfigStore.loadOrEmpty();
      const graph = new ChampGraph(config.redis.url, config.redis.ttl_days);
      await graph.connect();

      try {
        const node = await graph.getCall(callId);
        if (!node) {
          console.error(`\x1b[31mError:\x1b[0m Call "${callId}" not found in ChampGraph`);
          process.exit(1);
        }

        console.log(`\x1b[1mCall\x1b[0m ${node.callId}`);
        console.log(`  Status:         ${colorStatus(node.status)}`);
        console.log(`  Outcome:        ${node.outcome}`);
        console.log(`  Provider:       ${node.provider}`);
        console.log(`  To:             ${node.toNumber}`);
        console.log(`  Lead:           ${node.leadName || '-'}`);
        console.log(`  Company:        ${node.company || '-'}`);
        console.log(`  ConversationId: ${node.conversationId}`);
        console.log(`  Created:        ${node.timestamps.created}`);
        if (node.timestamps.completed) {
          console.log(`  Completed:      ${node.timestamps.completed}`);
        }
        if (node.durationSeconds) {
          console.log(`  Duration:       ${node.durationSeconds}s`);
        }
        if (node.flowId) {
          console.log(`  Flow:           ${node.flowId}`);
        }
        if (node.prevCallId) {
          console.log(`  Prev call:      ${node.prevCallId}`);
        }
        if (node.nextCallId) {
          console.log(`  Next call:      ${node.nextCallId}`);
        }
        console.log(`  Canvas synced:  ${node.canvasSynced ? 'yes' : 'no'}`);
      } finally {
        await graph.disconnect();
      }
    });
}

function colorStatus(status: string): string {
  const colors: Record<string, string> = {
    initiated: '\x1b[34m',
    in_progress: '\x1b[33m',
    completed: '\x1b[32m',
    failed: '\x1b[31m',
    pending: '\x1b[90m',
  };
  const c = colors[status] ?? '';
  return `${c}${status}\x1b[0m`;
}
