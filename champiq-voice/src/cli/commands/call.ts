import { Command } from 'commander';
import { ConfigStore } from '../../config/ConfigStore.js';
import { ChampGraph } from '../../graph/ChampGraph.js';
import { CallOrchestrator } from '../../orchestrator/CallOrchestrator.js';

export function callCommand(): Command {
  return new Command('call')
    .description('Initiate an outbound AI call')
    .argument('<phone>', 'Destination phone number in E.164 format (e.g. +15551234567)')
    .option('-n, --name <name>', 'Prospect name')
    .option('-c, --company <company>', 'Company name')
    .option('-e, --email <email>', 'Email address')
    .option('-s, --script <script>', 'Custom script override')
    .option('-f, --flow-id <flowId>', 'ChampIQ Canvas flow ID')
    .option('--node-id <nodeId>', 'ChampIQ Canvas node ID')
    .option('-p, --provider <provider>', 'Voice provider override (default: elevenlabs)')
    .option('-a, --agent-id <agentId>', 'Agent ID override')
    .option('-v, --var <pairs...>', 'Dynamic variables as key=value pairs')
    .option('-w, --wait', 'Wait for transcript (polls until call completes)')
    .action(async (phone: string, opts: {
      name?: string;
      company?: string;
      email?: string;
      script?: string;
      flowId?: string;
      nodeId?: string;
      provider?: string;
      agentId?: string;
      var?: string[];
      wait?: boolean;
    }) => {
      const config = ConfigStore.loadOrEmpty();
      const graph = new ChampGraph(config.redis.url, config.redis.ttl_days);
      await graph.connect();

      try {
        const dynamicVars: Record<string, string> = {};
        for (const pair of opts.var ?? []) {
          const [k, ...rest] = pair.split('=');
          if (k) dynamicVars[k] = rest.join('=');
        }

        const orchestrator = new CallOrchestrator(config, graph);

        console.log(`\x1b[34m→\x1b[0m Initiating call to ${phone}...`);

        const result = await orchestrator.initiateCall({
          toNumber: phone,
          leadName: opts.name,
          company: opts.company,
          email: opts.email,
          script: opts.script,
          flowId: opts.flowId,
          canvasNodeId: opts.nodeId,
          provider: opts.provider,
          agentId: opts.agentId,
          dynamicVars,
        });

        console.log(`\x1b[32m✓\x1b[0m Call initiated`);
        console.log(`  callId:         ${result.callId}`);
        console.log(`  conversationId: ${result.conversationId}`);
        console.log(`  status:         ${result.status}`);

        if (opts.wait) {
          console.log(`\n  Waiting for call to complete (Ctrl+C to abort)...`);
          await pollForCompletion(graph, result.callId);
        }
      } finally {
        await graph.disconnect();
      }
    });
}

async function pollForCompletion(graph: ChampGraph, callId: string): Promise<void> {
  const { printTranscript } = await import('../formatters/transcript.js');
  const interval = 5000;
  let dots = 0;

  while (true) {
    await new Promise(r => setTimeout(r, interval));
    const node = await graph.getCall(callId);
    if (!node) break;

    process.stdout.write(`\r  Status: ${node.status}${'.'.repeat(++dots % 4).padEnd(3)}`);

    if (node.status === 'completed' || node.status === 'failed') {
      console.log(`\n\n\x1b[32m✓\x1b[0m Call ${node.status}`);
      if (node.transcript.length > 0) {
        console.log('\nTranscript:');
        printTranscript(node.transcript);
      }
      if (node.summary) {
        console.log(`\nSummary: ${node.summary}`);
      }
      break;
    }
  }
}
