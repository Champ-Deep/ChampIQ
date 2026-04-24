import { Message } from '../../providers/types.js';

export function printTranscript(messages: Message[]): void {
  if (messages.length === 0) {
    console.log('  (no transcript available)');
    return;
  }
  for (const m of messages) {
    const label = m.speaker === 'agent' ? '\x1b[36mAgent\x1b[0m' : '\x1b[33mProspect\x1b[0m';
    const ts = m.timestamp ? `\x1b[90m[${m.timestamp.slice(11, 19)}]\x1b[0m ` : '';
    console.log(`  ${ts}${label}: ${m.text}`);
  }
}
