import { useEffect, useRef, useState } from 'react'
import { Send, Sparkles, Bot, User, Loader2, Paperclip, X, Key, ChevronDown, ChevronUp } from '@/lib/icons'
import { api } from '@/lib/api'
import { applyWorkflowPatch } from '@/lib/applyPatch'
import { useCanvasStore } from '@/store/canvasStore'
import { saveCurrentCanvas } from '@/hooks/usePersistence'
import type { ChatMessage } from '@/types'

const SESSION_ID = 'default'

const SUGGESTIONS = [
  'Build a workflow: upload contacts CSV → enroll each in a Champmail sequence',
  'When a Champmail reply comes in, classify it with an LLM and pause the sequence if positive.',
  'Every morning at 8am, fetch new prospects from ChampGraph and start a sequence.',
  'A/B test two subject lines: split my list in half and send variant A to one half, B to the other.',
  'Parallel outreach: hit prospects on email AND LinkedIn at the same time.',
]

export function parseAssistant(raw: string): { explanation: string; patch?: unknown } {
  const text = raw.trim()

  // First try: the whole text is JSON
  const attempt = (() => {
    try { return JSON.parse(text) } catch { /* fall through */ }
    // Second try: extract last {...} block (handles leading prose)
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      try { return JSON.parse(match[0]) } catch { return null }
    }
    return null
  })()

  if (attempt && typeof attempt === 'object' && 'explanation' in attempt) {
    return {
      explanation: String((attempt as Record<string, unknown>).explanation ?? ''),
      patch: (attempt as Record<string, unknown>).patch,
    }
  }
  return { explanation: raw }
}

// ── Credential manager modal ────────────────────────────────────────────────

interface CredentialRow {
  id: number
  name: string
  type: string
  created_at: string
}

function CredentialManager({ onClose }: { onClose: () => void }) {
  const [creds, setCreds] = useState<CredentialRow[]>([])
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: 'champmail-admin', type: 'champmail', email: '', password: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    api.listCredentials().then((rows) => setCreds(rows as unknown as CredentialRow[])).catch(() => {})
  }, [])

  async function save() {
    if (!form.email || !form.password) { setErr('Email and password are required.'); return }
    setSaving(true); setErr(null)
    try {
      await api.createCredential(form.name, form.type, { email: form.email, password: form.password })
      const rows = await api.listCredentials()
      setCreds(rows as unknown as CredentialRow[])
      setAdding(false)
      setForm({ name: 'champmail-admin', type: 'champmail', email: '', password: '' })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function deleteCred(id: number) {
    await api.deleteCredential(id)
    setCreds((prev) => prev.filter((c) => c.id !== id))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="w-96 rounded-xl p-5 flex flex-col gap-4"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>Credentials</span>
          <button onClick={onClose} style={{ color: 'var(--text-3)' }}><X size={16} /></button>
        </div>

        {creds.length === 0 && (
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>No credentials saved yet.</p>
        )}
        {creds.map((c) => (
          <div key={c.id} className="flex items-center justify-between text-xs px-3 py-2 rounded-md"
            style={{ background: 'var(--bg-base)', color: 'var(--text-1)' }}>
            <span><strong>{c.name}</strong> <span style={{ color: 'var(--text-3)' }}>({c.type})</span></span>
            <button onClick={() => deleteCred(c.id)} style={{ color: '#f87171' }}>Delete</button>
          </div>
        ))}

        {adding ? (
          <div className="flex flex-col gap-2">
            <label className="text-xs" style={{ color: 'var(--text-2)' }}>Credential name</label>
            <input className="text-xs p-2 rounded-md focus:outline-none"
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
              value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <label className="text-xs" style={{ color: 'var(--text-2)' }}>Type</label>
            <select className="text-xs p-2 rounded-md focus:outline-none"
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
              value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              <option value="champmail">champmail</option>
              <option value="http_bearer">http_bearer</option>
              <option value="http_basic">http_basic</option>
            </select>
            <label className="text-xs" style={{ color: 'var(--text-2)' }}>ChampMail Admin Email</label>
            <input type="email" className="text-xs p-2 rounded-md focus:outline-none"
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
              placeholder="admin@yourcompany.com"
              value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            <label className="text-xs" style={{ color: 'var(--text-2)' }}>ChampMail Admin Password</label>
            <input type="password" className="text-xs p-2 rounded-md focus:outline-none"
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
              placeholder="••••••••"
              value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
            {err && <p className="text-xs" style={{ color: '#f87171' }}>{err}</p>}
            <div className="flex gap-2">
              <button onClick={save} disabled={saving}
                className="flex-1 py-1.5 rounded text-sm font-medium disabled:opacity-50"
                style={{ background: '#A855F7', color: 'white' }}>
                {saving ? 'Saving…' : 'Save Credential'}
              </button>
              <button onClick={() => setAdding(false)}
                className="flex-1 py-1.5 rounded text-sm"
                style={{ border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)}
            className="py-1.5 rounded text-sm"
            style={{ border: '1px solid var(--border)', color: 'var(--text-2)' }}>
            + Add ChampMail Credential
          </button>
        )}
      </div>
    </div>
  )
}

// ── Upload result banner ────────────────────────────────────────────────────

interface UploadResult {
  records: Record<string, string>[]
  count: number
  columns: string[]
}

// ── Main ChatPanel ──────────────────────────────────────────────────────────

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [showCreds, setShowCreds] = useState(false)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [uploading, setUploading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.chatHistory(SESSION_ID).then(setMessages).catch(() => setMessages([]))
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, pending])

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setErr(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/uploads/prospects', { method: 'POST', body: formData })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Upload failed: ${text}`)
      }
      const result: UploadResult = await res.json()
      setUploadResult(result)
      // Inject records into the canvas as a Manual Trigger node with the data
      const { nodes } = useCanvasStore.getState()
      const existingTrigger = nodes.find((n) => (n.data?.kind as string)?.startsWith('trigger.manual'))
      if (existingTrigger) {
        useCanvasStore.getState().updateNodeConfig(existingTrigger.id, {
          ...(existingTrigger.data.config as Record<string, unknown>),
          items: result.records,
        })
      } else {
        applyWorkflowPatch({
          add_nodes: [{
            id: `trigger.manual-upload-${Date.now()}`,
            type: 'toolNode',
            position: { x: 80, y: 80 },
            data: {
              kind: 'trigger.manual',
              label: `Manual Trigger (${result.count} contacts)`,
              config: { items: result.records },
            },
          }],
          add_edges: [],
          remove_node_ids: [],
          update_nodes: [],
        })
      }

      // Auto-configure any loop node on the canvas to use the uploaded items
      const loopNode = useCanvasStore.getState().nodes.find((n) => n.data?.kind === 'loop')
      if (loopNode) {
        useCanvasStore.getState().updateNodeConfig(loopNode.id, {
          items: '{{ prev.payload.items }}',
          concurrency: 1,
          each: {},
        })
      }

      // Auto-configure champvoice node — no contact fields in config, they flow from item
      const champvoiceNode = useCanvasStore.getState().nodes.find((n) => n.data?.kind === 'champvoice')
      if (champvoiceNode) {
        const existingConfig = (champvoiceNode.data.config as Record<string, unknown>) || {}
        useCanvasStore.getState().updateNodeConfig(champvoiceNode.id, {
          ...existingConfig,
          inputs: {},  // contact fields come from item.* automatically via loop fan-out
        })
      }

      // Save immediately — don't wait for debounce so Run All gets correct configs
      saveCurrentCanvas()

      useCanvasStore.getState().addLog({
        nodeId: 'upload',
        nodeName: 'File Upload',
        status: 'success',
        message: `Loaded ${result.count} records from ${file.name} — columns: ${result.columns.slice(0, 5).join(', ')}`,
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

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

      // Apply patch immediately from the send() path (MessageBubble handles history re-render)
      const { explanation, patch } = parseAssistant(reply.content)
      if (patch) {
        const applied = applyWorkflowPatch(patch as Parameters<typeof applyWorkflowPatch>[0])
        // Auto-select the last newly added node so the right panel opens for it
        if (applied.addedIds.length > 0) {
          useCanvasStore.getState().setSelectedNode(applied.addedIds[applied.addedIds.length - 1])
        }
        useCanvasStore.getState().addLog({
          nodeId: 'chat',
          nodeName: 'Assistant',
          status: 'success',
          message: `${explanation.slice(0, 100)} — +${applied.added} nodes / −${applied.removed} / ~${applied.updated} updated`,
        })
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Chat failed')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      {showCreds && <CredentialManager onClose={() => setShowCreds(false)} />}
      <aside
        className="w-80 shrink-0 flex flex-col"
        style={{ background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border)' }}
        aria-label="Workflow chat assistant"
      >
        {/* Header */}
        <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <Sparkles size={16} style={{ color: '#A855F7' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Workflow Assistant</span>
          </div>
          <button
            onClick={() => setShowCreds(true)}
            className="p-1 rounded hover:opacity-70 flex items-center gap-1 text-xs"
            style={{ color: 'var(--text-3)', border: '1px solid var(--border)' }}
            title="Manage credentials (ChampMail login, etc.)"
          >
            <Key size={12} /> Credentials
          </button>
        </div>

        {/* Upload result banner */}
        {uploadResult && (
          <div className="mx-3 mt-2 p-2 rounded-md text-xs flex items-start justify-between gap-2"
            style={{ background: '#14532d33', border: '1px solid #16a34a55', color: '#4ade80' }}>
            <div>
              <strong>{uploadResult.count} contacts loaded</strong>
              <div style={{ color: 'var(--text-3)', marginTop: 2 }}>
                Columns: {uploadResult.columns.slice(0, 4).join(', ')}{uploadResult.columns.length > 4 ? '…' : ''}
              </div>
            </div>
            <button onClick={() => setUploadResult(null)} style={{ color: 'var(--text-3)', flexShrink: 0 }}>
              <X size={12} />
            </button>
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
          {messages.length === 0 && !pending && (
            <div className="space-y-2">
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                Describe what you want. I'll build or edit the workflow on your canvas.
                Upload a CSV/Excel to load contacts.
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

        {/* Input area */}
        <div className="p-2 flex flex-col gap-2" style={{ borderTop: '1px solid var(--border)' }}>
          {/* Upload bar */}
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={handleFileUpload}
              aria-label="Upload CSV or Excel file"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md disabled:opacity-50"
              style={{ border: '1px solid var(--border)', color: 'var(--text-2)', background: 'var(--bg-base)' }}
              title="Upload CSV or Excel contact list"
            >
              <Paperclip size={12} />
              {uploading ? 'Uploading…' : 'Upload Contacts'}
            </button>
            <span className="text-xs" style={{ color: 'var(--text-3)' }}>.csv / .xlsx</span>
          </div>

          {/* Text input */}
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
              placeholder="Describe a workflow… (Shift+Enter for new line)"
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
    </>
  )
}

// ── Message bubble — applies patch from history on first render ─────────────

function MessageBubble({ m }: { m: ChatMessage }) {
  const isUser = m.role === 'user'
  const [explanation, setExplanation] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [patchSummary, setPatchSummary] = useState<string | null>(null)
  const patchApplied = useRef(false)

  useEffect(() => {
    if (isUser) {
      setExplanation(m.content)
      return
    }
    const { explanation: exp, patch } = parseAssistant(m.content)
    setExplanation(exp)
    // Only apply patch once per bubble (handles history re-renders)
    if (patch && !patchApplied.current) {
      patchApplied.current = true
      const applied = applyWorkflowPatch(patch as Parameters<typeof applyWorkflowPatch>[0])
      const parts: string[] = []
      if (applied.added > 0) parts.push(`+${applied.added} nodes`)
      if (applied.removed > 0) parts.push(`-${applied.removed}`)
      if (applied.updated > 0) parts.push(`~${applied.updated} updated`)
      if (parts.length > 0) setPatchSummary(parts.join(' · '))
    }
  }, [m.content, m.role, isUser])

  const hasRaw = !isUser && m.content.length > (explanation?.length ?? 0) + 10

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
      <div className="flex-1 min-w-0">
        <div
          className="text-xs whitespace-pre-wrap p-2 rounded-md"
          style={{
            background: isUser ? 'transparent' : 'var(--bg-base)',
            border: isUser ? 'none' : '1px solid var(--border)',
            color: 'var(--text-1)',
          }}
        >
          {explanation || m.content}
        </div>
        {patchSummary && (
          <div className="mt-1 text-xs px-2 py-0.5 rounded-full inline-block"
            style={{ background: '#A855F722', color: '#A855F7', border: '1px solid #A855F744' }}>
            Canvas updated: {patchSummary}
          </div>
        )}
        {hasRaw && (
          <button
            className="text-xs mt-1 flex items-center gap-1"
            style={{ color: 'var(--text-3)' }}
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            {expanded ? 'Hide raw JSON' : 'Show raw patch'}
          </button>
        )}
        {hasRaw && expanded && (
          <pre className="text-xs mt-1 p-2 rounded overflow-x-auto whitespace-pre-wrap"
            style={{ background: 'var(--bg-sidebar)', color: 'var(--text-3)', maxHeight: 200, overflowY: 'auto' }}>
            {m.content}
          </pre>
        )}
      </div>
    </div>
  )
}
