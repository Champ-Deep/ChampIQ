import { CallNode } from './types.js';

/** Build a human-readable summary of prior calls for context injection */
export function buildPrevContextVars(prevCall: CallNode): Record<string, string> {
  const vars: Record<string, string> = {};

  if (prevCall.summary) {
    vars['prev_summary'] = prevCall.summary;
  } else if (prevCall.transcript.length > 0) {
    // Fallback: last 3 transcript messages as context
    const snippet = prevCall.transcript
      .slice(-3)
      .map(m => `${m.speaker === 'agent' ? 'Agent' : 'Prospect'}: ${m.text}`)
      .join('\n');
    vars['prev_summary'] = snippet;
  }

  if (prevCall.outcome && prevCall.outcome !== 'unknown') {
    vars['prev_outcome'] = prevCall.outcome;
  }

  if (prevCall.timestamps.completed) {
    vars['prev_call_date'] = new Date(prevCall.timestamps.completed).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  vars['prev_call_id'] = prevCall.callId;

  return vars;
}

/** Filter calls to only those with transcripts */
export function withTranscripts(calls: CallNode[]): CallNode[] {
  return calls.filter(c => c.transcript.length > 0);
}

/** Format a call node as a one-line summary for table display */
export function formatCallSummary(node: CallNode): string {
  const date = node.timestamps.created.slice(0, 19).replace('T', ' ');
  const duration = node.durationSeconds ? `${node.durationSeconds}s` : '-';
  return `${node.callId} | ${date} | ${node.status} | ${node.outcome} | ${duration} | ${node.toNumber}`;
}
