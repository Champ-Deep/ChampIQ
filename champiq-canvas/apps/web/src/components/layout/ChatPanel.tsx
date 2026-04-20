import { useEffect, useRef, useState } from 'react'
import { Send, Sparkles, Bot, User, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { applyWorkflowPatch } from '@/lib/applyPatch'
import { useCanvasStore } from '@/store/canvasStore'
import type { ChatMessage } from '@/types'

const SESSION_ID = 'default'

const SUGGESTIONS = [
  'Enrich every new lead in ChampGraph, then start a Champmail sequence if the role is CXO.',
  'When a Champmail reply comes in, classify it with an LLM and pause the sequence if positive.',
  'Every morning at 8am, fetch prospects who replied in the last 24h and send a personal follow-up.',
  'Track these LinkedIn pages in Pulse; when a new post appears, schedule a comment and queue a Champmail touch.',
]

function parseAssistant(raw: string): { explanation: string; patchApplied?: { added: number; removed: number; updated: number } } {
  const text = raw.trim()
  const attempt = (() => {
    try {
      return JSON.parse(text)
    } catch {
      const match = text.match(/\{[\s\S]*\}$/)
      if (match) {
        try { return JSON.parse(match[0]) } catch { return null }
      }
      return null
    }
  })()
  if (attempt && typeof attempt === 'object' && 'explanation' in attempt) {
    const explanation = String((attempt as { explanation: string }).explanation ?? '')
    let patchApplied
    if ((attempt as { patch?: unknown }).patch) {
      patchApplied = applyWorkflowPatch((attempt as { patch: Parameters<typeof applyWorkflowPatch>[0] }).patch)
    }
    return { explanation, patchApplied }
  }
  return { explanation: raw }
}

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.chatHistory(SESSION_ID).then(setMessages).catch(() => setMessages([]))
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, pending])

  async function send(content: string) {
    const trimmed = content.trim()
    if (!trimmed || pending) return
    setErr(null)
    setPending(true)
    const optimistic: ChatMessage = {
      id: Date.now(),
      session_id: SESSION_ID,
      role: 'user',
      content: trimmed,
      created_at: new Date().toISOString(),
      workflow_patch: null,
    }
    setMessages((prev) => [...prev, optimistic])
    setDraft('')
    try {
      const { nodes, edges } = useCanvasStore.getState()
      const reply = await api.chatMessage(SESSION_ID, trimmed, { nodes, edges })
      setMessages((prev) => [...prev, reply])
      const { explanation, patchApplied } = parseAssistant(reply.content)
      if (patchApplied) {
        useCanvasStore.getState().addLog({
          nodeId: 'chat',
          nodeName: 'Assistant',
          status: 'success',
          message: `${explanation.slice(0, 80)} — +${patchApplied.added} / −${patchApplied.removed} / ~${patchApplied.updated}`,
        })
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Chat failed')
    } finally {
      setPending(false)
    }
  }

  return (
    <aside
      className="w-80 shrink-0 flex flex-col"
      style={{ background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border)' }}
      aria-label="Workflow chat assistant"
    >
      <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <Sparkles size={16} style={{ color: '#A855F7' }} />
        <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Workflow Assistant</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {messages.length === 0 && !pending && (
          <div className="space-y-2">
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              Describe what you want. I'll build or edit the workflow on your canvas.
            </p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="w-full text-left text-xs p-2 rounded-md hover:opacity-90 transition-opacity"
                style={{ border: '1px solid var(--border)', color: 'var(--text-2)', background: 'var(--bg-base)' }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m) => (
          <MessageBubble key={m.id} m={m} />
        ))}

        {pending && (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-3)' }}>
            <Loader2 size={14} className="animate-spin" /> Assistant is thinking…
          </div>
        )}

        {err && (
          <div className="text-xs p-2 rounded-md" style={{ background: '#7f1d1d33', color: '#fca5a5' }}>
            {err}
          </div>
        )}
      </div>

      <div className="p-2" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(draft)
              }
            }}
            placeholder="Describe a workflow..."
            rows={2}
            className="flex-1 text-sm p-2 rounded-md resize-none focus:outline-none"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
            aria-label="Chat input"
          />
          <button
            onClick={() => send(draft)}
            disabled={pending || !draft.trim()}
            className="p-2 rounded-md disabled:opacity-40"
            style={{ background: '#A855F7', color: 'white' }}
            aria-label="Send message"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </aside>
  )
}

function MessageBubble({ m }: { m: ChatMessage }) {
  const isUser = m.role === 'user'
  const { explanation } = !isUser ? parseAssistant(m.content) : { explanation: m.content }
  return (
    <div className="flex gap-2 items-start">
      <span
        className="shrink-0 w-6 h-6 rounded-full grid place-items-center"
        style={{
          background: isUser ? 'var(--border)' : '#A855F733',
          color: isUser ? 'var(--text-2)' : '#A855F7',
        }}
      >
        {isUser ? <User size={13} /> : <Bot size={13} />}
      </span>
      <div
        className="text-xs whitespace-pre-wrap flex-1 p-2 rounded-md"
        style={{
          background: isUser ? 'transparent' : 'var(--bg-base)',
          border: isUser ? 'none' : '1px solid var(--border)',
          color: 'var(--text-1)',
        }}
      >
        {explanation}
      </div>
    </div>
  )
}

export { parseAssistant }
