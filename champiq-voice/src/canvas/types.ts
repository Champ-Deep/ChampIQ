import { CallNode, CanvasEventType } from '../graph/types.js';

export interface CanvasEvent {
  event: CanvasEventType;
  callId: string;
  flowId?: string;
  canvasNodeId?: string;
  timestamp: string;       // ISO
  payload: CallNode;
  prevContext?: CallNode;  // previous call node for chain continuity
}
