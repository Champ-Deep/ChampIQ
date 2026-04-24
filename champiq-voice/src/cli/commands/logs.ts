import { Command } from 'commander';
import { ConfigStore } from '../../config/ConfigStore.js';
import { ChampGraph } from '../../graph/ChampGraph.js';
import { printTranscript } from '../formatters/transcript.js';
import { printCallTable } from '../formatters/table.js';

export function logsCommand(): Command {
  return new Command('logs')
    .description('View call logs and transcripts from ChampGraph')
    .argument('[callId]', 'Specific call ID to show transcript for')
    .option('--contact <phone>', 'Show all calls for a contact phone number')
    .option('--flow <flowId>', 'Show all calls in a ChampIQ flow')
    .option('--agent <agentId>', 'Show all calls for an agent')
    .option('-t, --transcript', 'Include transcript when listing multiple calls')
    .action(async (callId: string | undefined, opts: {
      contact?: string;
      flow?: string;
      agent?: string;
      transcript?: boolean;
    }) => {
      const config = ConfigStore.loadOrEmpty();
      const graph = new ChampGraph(config.redis.url, config.redis.ttl_days);
      await graph.connect();

      try {
        if (callId) {
          const node = await graph.getCall(callId);
          if (!node) {
            console.error(`\x1b[31mError:\x1b[0m Call "${callId}" not found`);
            process.exit(1);
          }
          console.log(`\x1b[1mTranscript for ${callId}\x1b[0m`);
          console.log(`  Status: ${node.status} | Outcome: ${node.outcome} | Duration: ${node.durationSeconds ?? '-'}s`);
          console.log();
          printTranscript(node.transcript);
          if (node.summary) {
            console.log(`\n\x1b[1mSummary:\x1b[0m ${node.summary}`);
          }
          return;
        }

        if (opts.contact) {
          const history = await graph.getContactHistory(opts.contact);
          console.log(`\x1b[1mCalls for contact ${opts.contact}\x1b[0m\n`);
          printCallTable(history.calls);
          if (opts.transcript) {
            for (const c of history.calls) {
              console.log(`\n\x1b[1m${c.callId}\x1b[0m`);
              printTranscript(c.transcript);
            }
          }
          return;
        }

        if (opts.flow) {
          const ctx = await graph.getFlowCalls(opts.flow);
          console.log(`\x1b[1mCalls in flow ${opts.flow}\x1b[0m\n`);
          printCallTable(ctx.calls);
          return;
        }

        if (opts.agent) {
          const calls = await graph.getAgentCalls(opts.agent);
          console.log(`\x1b[1mCalls by agent ${opts.agent}\x1b[0m\n`);
          printCallTable(calls);
          return;
        }

        console.log('Usage: champiq-voice logs <callId>');
        console.log('       champiq-voice logs --contact +15551234567');
        console.log('       champiq-voice logs --flow flow_abc123');
        console.log('       champiq-voice logs --agent agent_xyz');
      } finally {
        await graph.disconnect();
      }
    });
}
