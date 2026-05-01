import { useEffect, useRef, useState } from 'react'
import { Send, Bot, User, Loader2, Paperclip, X, Key, ChevronDown, ChevronUp } from '@/lib/icons'
import { api } from '@/lib/api'
import { applyWorkflowPatch } from '@/lib/applyPatch'
import { useCanvasStore } from '@/store/canvasStore'
import { saveCurrentCanvas } from '@/hooks/usePersistence'
import { Pixie, PixieOnlinePill } from '@/components/pixie/Pixie'
import type { ChatMessage } from '@/types'
import type { CloakColor, VoicePreset } from '@/store/uiStore'

const SESSION_ID = 'default'

const SUGGESTIONS = [
  'Every weekday at 9am, list prospects from ChampGraph and call each one with ChampVoice.',
  'When a new lead submits a form (webhook), create them in ChampGraph and call immediately.',
  'Route prospects by engagement: call anyone who replied or opened, track cold leads on LinkedIn.',
  'Build a workflow: upload contacts CSV → enroll each in a Champmail sequence',
  'When a Champmail reply comes in, classify it with an LLM and pause the sequence if positive.',
  'A/B test two subject lines: split my list in half and send variant A to one half, B to the other.',
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

const CRED_TYPES: Record<string, { label: string; defaultName: string; fields: { key: string; label: string; type: string; placeholder: string }[] }> = {
  champmail: {
    label: 'ChampMail / ChampGraph',
    defaultName: 'champmail-admin',
    fields: [
      { key: 'email', label: 'Admin Email', type: 'email', placeholder: 'admin@yourcompany.com' },
      { key: 'password', label: 'Admin Password', type: 'password', placeholder: '••••••••' },
    ],
  },
  champvoice: {
    label: 'ChampVoice (ElevenLabs)',
    defaultName: 'champvoice-cred',
    fields: [
      { key: 'elevenlabs_api_key', label: 'ElevenLabs API Key', type: 'password', placeholder: 'sk_…' },
      { key: 'agent_id', label: 'Agent ID', type: 'text', placeholder: 'agent_…' },
      { key: 'phone_number_id', label: 'Phone Number ID', type: 'text', placeholder: 'phone_…' },
    ],
  },
  http_bearer: {
    label: 'HTTP Bearer Token',
    defaultName: 'http-token',
    fields: [
      { key: 'token', label: 'Bearer Token', type: 'password', placeholder: 'Bearer token value' },
    ],
  },
  http_basic: {
    label: 'HTTP Basic Auth',
    defaultName: 'http-basic',
    fields: [
      { key: 'username', label: 'Username', type: 'text', placeholder: 'username' },
      { key: 'password', label: 'Password', type: 'password', placeholder: '••••••••' },
    ],
  },
}

function CredentialManager({ onClose }: { onClose: () => void }) {
  const [creds, setCreds] = useState<CredentialRow[]>([])
  const [adding, setAdding] = useState(false)
  const [credType, setCredType] = useState('champmail')
  const [name, setName] = useState('champmail-admin')
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    api.listCredentials().then((rows) => setCreds(rows as unknown as CredentialRow[])).catch(() => {})
  }, [])

  function handleTypeChange(t: string) {
    setCredType(t)
    setName(CRED_TYPES[t]?.defaultName ?? t)
    setFieldValues({})
    setErr(null)
  }

  async function save() {
    const schema = CRED_TYPES[credType]
    const missing = schema?.fields.filter((f) => !fieldValues[f.key]).map((f) => f.label)
    if (missing?.length) { setErr(`Required: ${missing.join(', ')}`); return }
    setSaving(true); setErr(null)
    try {
      await api.createCredential(name, credType, fieldValues)
      const rows = await api.listCredentials()
      setCreds(rows as unknown as CredentialRow[])
      setAdding(false)
      setCredType('champmail')
      setName('champmail-admin')
      setFieldValues({})
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

  const schema = CRED_TYPES[credType]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="w-96 rounded-xl p-5 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
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
            <label className="text-xs" style={{ color: 'var(--text-2)' }}>Type</label>
            <select className="text-xs p-2 rounded-md focus:outline-none"
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
              value={credType} onChange={(e) => handleTypeChange(e.target.value)}>
              {Object.entries(CRED_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <label className="text-xs" style={{ color: 'var(--text-2)' }}>Credential name</label>
            <input className="text-xs p-2 rounded-md focus:outline-none"
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
              value={name} onChange={(e) => setName(e.target.value)} />
            {schema?.fields.map((f) => (
              <div key={f.key} className="flex flex-col gap-1">
                <label className="text-xs" style={{ color: 'var(--text-2)' }}>{f.label}</label>
                <input type={f.type} className="text-xs p-2 rounded-md focus:outline-none"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                  placeholder={f.placeholder}
                  value={fieldValues[f.key] ?? ''}
                  onChange={(e) => setFieldValues((fv) => ({ ...fv, [f.key]: e.target.value }))} />
              </div>
            ))}
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
            + Add Credential
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

interface ChatPanelProps {
  pixieCloak?: CloakColor | string
  voice?: VoicePreset | string
}

export function ChatPanel({ pixieCloak = '#1E5FCB', voice = 'Friendly' }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [showCreds, setShowCreds] = useState(false)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [uploading, setUploading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const pixiePose = pending ? 'think' : err ? 'lean' : messages.length === 0 ? 'idle' : 'read'
  const pixieTip = pending
    ? 'Thinking through the best workflow for you…'
    : voice === 'Quirky'
      ? 'Drop a wild idea — I thrive on chaos!'
      : voice === 'Pro'
        ? 'Describe the business objective. I\'ll architect it.'
        : 'Describe what you want. I\'ll build the workflow.'

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
        style={{
          width: 300,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-1)',
          borderRight: '1px solid var(--border-1)',
        }}
        aria-label="Pixie workflow assistant"
      >
        {/* Pixie hero section */}
        <div style={{
          padding: '18px 16px 14px',
          borderBottom: '1px solid var(--border-1)',
          background: 'linear-gradient(180deg, rgba(var(--accent-2-rgb),.06) 0%, transparent 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <PixieOnlinePill />
            <button
              onClick={() => setShowCreds(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: 7, fontSize: 11,
                fontFamily: 'var(--font-display)', fontWeight: 500,
                background: 'transparent',
                color: 'var(--text-3)', border: '1px solid var(--border-1)',
                cursor: 'pointer',
              }}
              title="Manage credentials"
            >
              <Key size={11} /> Credentials
            </button>
          </div>

          <Pixie
            pose={pixiePose as Parameters<typeof Pixie>[0]['pose']}
            size={80}
            cloak={pixieCloak}
            ambient
          />

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 2 }}>
              Pixie
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', lineHeight: 1.4 }}>
              {pixieTip}
            </div>
          </div>
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
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {messages.length === 0 && !pending && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  style={{
                    width: '100%', textAlign: 'left', fontSize: 11.5, padding: '8px 10px', borderRadius: 8,
                    border: '1px solid var(--border-1)', color: 'var(--text-2)', background: 'var(--bg-2)',
                    fontFamily: 'var(--font-body)', cursor: 'pointer', lineHeight: 1.45,
                    transition: 'all .15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(var(--accent-2-rgb),.4)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-3)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-1)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-2)' }}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
              <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Thinking…
            </div>
          )}

          {err && (
            <div style={{ fontSize: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,77,109,.08)', color: 'var(--danger)', border: '1px solid rgba(255,77,109,.2)' }}>
              {err}
            </div>
          )}
        </div>

        {/* Input area */}
        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-1)', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          {/* Upload bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
              aria-label="Upload CSV or Excel file"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: 7, fontSize: 11,
                fontFamily: 'var(--font-display)', fontWeight: 500,
                border: '1px solid var(--border-1)', color: 'var(--text-2)', background: 'var(--bg-2)',
                cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.5 : 1,
              }}
              title="Upload CSV or Excel contact list"
            >
              <Paperclip size={11} />
              {uploading ? 'Uploading…' : 'Upload Contacts'}
            </button>
            <span style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'var(--font-mono)' }}>.csv / .xlsx</span>
          </div>

          {/* Text input */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
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
              style={{
                flex: 1, fontSize: 13, padding: '8px 12px', borderRadius: 8, resize: 'none', outline: 'none',
                background: 'var(--bg-2)', border: '1px solid var(--border-1)', color: 'var(--text-1)',
                fontFamily: 'var(--font-body)', lineHeight: 1.5,
                transition: 'border-color .15s',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = 'rgba(var(--accent-2-rgb),.5)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border-1)')}
              aria-label="Chat input"
            />
            <button
              onClick={() => send(draft)}
              disabled={pending || !draft.trim()}
              style={{
                width: 36, height: 36, display: 'grid', placeItems: 'center',
                background: 'linear-gradient(180deg, var(--accent-2), var(--accent-3))',
                color: '#fff', border: 'none', borderRadius: 9,
                cursor: pending || !draft.trim() ? 'not-allowed' : 'pointer',
                opacity: pending || !draft.trim() ? 0.4 : 1,
                transition: 'opacity .15s',
                flexShrink: 0,
              }}
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
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <span style={{
        flexShrink: 0, width: 24, height: 24, borderRadius: '50%',
        display: 'grid', placeItems: 'center',
        background: isUser ? 'var(--bg-3)' : 'rgba(var(--accent-2-rgb),.15)',
        color: isUser ? 'var(--text-3)' : 'var(--accent-1)',
        border: isUser ? '1px solid var(--border-1)' : '1px solid rgba(var(--accent-2-rgb),.25)',
      }}>
        {isUser ? <User size={12} /> : <Bot size={12} />}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12.5, lineHeight: 1.5, whiteSpace: 'pre-wrap',
          padding: isUser ? '0' : '8px 10px',
          borderRadius: isUser ? 0 : 8,
          background: isUser ? 'transparent' : 'var(--bg-2)',
          border: isUser ? 'none' : '1px solid var(--border-1)',
          color: isUser ? 'var(--text-2)' : 'var(--text-1)',
          fontFamily: 'var(--font-body)',
        }}>
          {explanation || m.content}
        </div>
        {patchSummary && (
          <div style={{
            marginTop: 4, fontSize: 10, padding: '2px 8px', borderRadius: 20, display: 'inline-block',
            background: 'rgba(var(--accent-2-rgb),.1)', color: 'var(--accent-1)',
            border: '1px solid rgba(var(--accent-2-rgb),.25)', fontFamily: 'var(--font-mono)',
          }}>
            Canvas updated: {patchSummary}
          </div>
        )}
        {hasRaw && (
          <button
            style={{ fontSize: 11, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer' }}
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            {expanded ? 'Hide raw JSON' : 'Show raw patch'}
          </button>
        )}
        {hasRaw && expanded && (
          <pre style={{
            fontSize: 10.5, marginTop: 4, padding: '8px 10px', borderRadius: 8,
            overflowX: 'auto', whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto',
            background: 'var(--bg-3)', color: 'var(--text-3)', fontFamily: 'var(--font-mono)',
            border: '1px solid var(--border-1)',
          }}>
            {m.content}
          </pre>
        )}
      </div>
    </div>
  )
}
