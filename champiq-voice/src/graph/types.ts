import { Message } from '../providers/types.js';

export type CallStatus =
  | 'pending'
  | 'initiated'
  | 'in_progress'
  | 'completed'
  | 'failed';

export type CallOutcome =
  | 'qualified'
  | 'not_qualified'
  | 'callback'
  | 'voicemail'
  | 'no_answer'
  | 'unknown';

export type CanvasEventType =
  | 'call.initiated'
  | 'call.completed'
  | 'call.failed'
  | 'transcript.ready';

export interface CallTimestamps {
  created: string;       // ISO — when champiq-voice call was run
  connected?: string;    // ISO — when call was answered
  completed?: string;    // ISO — when call ended
}

export interface CallNode {
  // Identity
  callId: string;
  conversationId: string;

  // Graph linkage
  contactId: string;       // normalized E.164 phone number
  flowId?: string;
  canvasNodeId?: string;
  prevCallId?: string;     // prior call in chain for this contact
  nextCallId?: string;     // retroactively set when next call is made

  // Provider
  provider: string;
  agentId: string;

  // Contact info
  toNumber: string;
  leadName: string;
  company: string;
  email: string;
  script?: string;
  dynamicVars: Record<string, string>;

  // State
  status: CallStatus;
  timestamps: CallTimestamps;

  // Content
  transcript: Message[];
  summary?: string;
  outcome: CallOutcome;
  durationSeconds?: number;
  recordingUrl?: string;

  // Canvas sync tracking
  canvasSynced: boolean;
  canvasEventsSent: CanvasEventType[];
}

export interface ContactHistory {
  contactId: string;
  calls: CallNode[];
}

export interface FlowContext {
  flowId: string;
  calls: CallNode[];
}
