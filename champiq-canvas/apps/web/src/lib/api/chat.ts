// champiq-canvas/apps/web/src/lib/api/chat.ts
import { req } from './req'
import type { ChatMessage, WorkflowPatch } from '@/types'
export type { ChatMessage, WorkflowPatch }

export const chatHistory = (sessionId = 'default') =>
  req<ChatMessage[]>(`/api/chat/history?session_id=${encodeURIComponent(sessionId)}`)
export const chatMessage = (sessionId: string, content: string, currentWorkflow?: Record<string, unknown>) =>
  req<ChatMessage>('/api/chat/message', {
    method: 'POST', body: JSON.stringify({ session_id: sessionId, content, current_workflow: currentWorkflow })
  })
