import { useState, useEffect } from 'react'
import { Pixie } from '@/components/pixie/Pixie'
import { Mail, Send, Plus, Loader2, RefreshCw, Trash2, FileText, Eye, X } from 'lucide-react'
import { api } from '@/lib/api'
import type { Sequence, Template } from '@/lib/api/types'

interface Props {
  pixieCloak: string
  sidebar?: boolean
}

const STATUS_PILL: Record<string, { bg: string; color: string; label: string }> = {
  active:  { bg: 'rgba(74,222,128,.12)', color: 'var(--success)', label: 'Active' },
  paused:  { bg: 'rgba(255,210,63,.1)', color: 'var(--warn)',    label: 'Paused' },
  draft:   { bg: 'rgba(123,134,166,.12)', color: 'var(--text-3)', label: 'Draft' },
}

function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 4,
      fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase',
      background: bg, color,
    }}>{label}</span>
  )
}

// ── Template editor modal ─────────────────────────────────────────────────────

function TemplateEditorModal({ template, onClose, onSaved }: {
  template: Partial<Template> | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(template?.name ?? '')
  const [subject, setSubject] = useState(template?.subject ?? '')
  const [body, setBody] = useState(template?.body_html ?? '')
  const [previewVars, setPreviewVars] = useState('{"first_name":"Alice","company":"AcmeCo"}')
  const [preview, setPreview] = useState<{ subject: string; body_html: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    if (!name || !subject || !body) { setErr('Name, subject, and body are required'); return }
    setSaving(true); setErr(null)
    try {
      if (template?.id) {
        await api.cmUpdateTemplate(template.id, { name, subject, body_html: body })
      } else {
        await api.cmCreateTemplate({ name, subject, body_html: body })
      }
      onSaved()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function runPreview() {
    if (!template?.id) {
      setPreview({ subject, body_html: body })
      return
    }
    try {
      const vars = JSON.parse(previewVars || '{}')
      const out = await api.cmPreviewTemplate(template.id, vars)
      setPreview({ subject: out.subject, body_html: out.body_html })
    } catch (e) {
      setErr(`Preview failed: ${e instanceof Error ? e.message : e}`)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(7,9,18,.75)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{ width: 680, maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 16, padding: 28, display: 'flex', flexDirection: 'column', gap: 14 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--text-1)' }}>
            {template?.id ? 'Edit Template' : 'New Template'}
          </h3>
          <button onClick={onClose} style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 7, color: 'var(--text-3)', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-3)' }}>Name</label>
          <input
            value={name} onChange={(e) => setName(e.target.value)}
            style={{ padding: '8px 12px', background: 'var(--bg-0)', border: '1px solid var(--border-1)', borderRadius: 8, color: 'var(--text-1)', fontFamily: 'var(--font-body)', fontSize: 13, outline: 'none' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-3)' }}>
            Subject <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--text-4)' }}>— use {'{{ first_name }}'}, {'{{ company }}'}, …</span>
          </label>
          <input
            value={subject} onChange={(e) => setSubject(e.target.value)}
            style={{ padding: '8px 12px', background: 'var(--bg-0)', border: '1px solid var(--border-1)', borderRadius: 8, color: 'var(--text-1)', fontFamily: 'var(--font-mono)', fontSize: 13, outline: 'none' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-3)' }}>Body HTML</label>
          <textarea
            rows={10} value={body} onChange={(e) => setBody(e.target.value)}
            placeholder="<p>Hi {{ first_name }},</p>"
            style={{ padding: '10px 12px', background: 'var(--bg-0)', border: '1px solid var(--border-1)', borderRadius: 8, color: 'var(--text-1)', fontFamily: 'var(--font-mono)', fontSize: 12, outline: 'none', resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={previewVars} onChange={(e) => setPreviewVars(e.target.value)}
            style={{ flex: 1, padding: '7px 10px', background: 'var(--bg-0)', border: '1px solid var(--border-1)', borderRadius: 8, color: 'var(--text-1)', fontFamily: 'var(--font-mono)', fontSize: 12, outline: 'none' }}
            placeholder='{"first_name":"Alice"}'
          />
          <button
            onClick={runPreview}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 8, color: 'var(--text-2)', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            <Eye size={13} /> Preview
          </button>
        </div>

        {preview && (
          <div style={{ padding: '14px 16px', background: 'var(--bg-0)', border: '1px solid var(--border-1)', borderRadius: 10, fontSize: 13 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--text-1)', marginBottom: 8 }}>Subject: {preview.subject}</div>
            <div style={{ color: 'var(--text-2)', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: preview.body_html }} />
          </div>
        )}

        {err && <p style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }}>{err}</p>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 8, color: 'var(--text-2)', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={save} disabled={saving}
            style={{ padding: '8px 20px', background: 'var(--accent-2)', border: 'none', borderRadius: 8, color: '#fff', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Saving…' : 'Save Template'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function ChampMailRailPanel({ pixieCloak, sidebar: _sidebar }: Props) {
  const [tab, setTab] = useState<'sequences' | 'templates' | 'analytics'>('sequences')

  // Sequences state
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [seqLoading, setSeqLoading] = useState(true)
  const [seqError, setSeqError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)

  // Templates state
  const [templates, setTemplates] = useState<Template[]>([])
  const [tplLoading, setTplLoading] = useState(true)
  const [tplError, setTplError] = useState<string | null>(null)
  const [editingTemplate, setEditingTemplate] = useState<Partial<Template> | null | undefined>(undefined)

  const loadSequences = () => {
    setSeqLoading(true)
    setSeqError(null)
    api.cmListSequences()
      .then((res) => setSequences(res))
      .catch((e) => setSeqError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setSeqLoading(false))
  }

  const loadTemplates = () => {
    setTplLoading(true)
    setTplError(null)
    api.cmListTemplates()
      .then((res) => setTemplates(res))
      .catch((e) => setTplError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setTplLoading(false))
  }

  useEffect(() => {
    loadSequences()
    loadTemplates()
  }, [])

  async function handleCreate() {
    const name = newName.trim() || 'New Sequence'
    setCreating(true)
    setCreateError(null)
    try {
      await api.cmCreateSequence({ name })
      setNewName('')
      loadSequences()
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create sequence')
    } finally {
      setCreating(false)
    }
  }

  async function handleDeleteSequence(id: number, name: string) {
    if (!confirm(`Delete sequence "${name}"?`)) return
    try {
      await api.cmDeleteSequence(id)
      loadSequences()
    } catch { /* ignore */ }
  }

  async function handleDeleteTemplate(id: number, name: string) {
    if (!confirm(`Delete template "${name}"?`)) return
    try {
      await api.cmDeleteTemplate(id)
      loadTemplates()
    } catch { /* ignore */ }
  }

  const loading = tab === 'sequences' ? seqLoading : tplLoading
  const pixieTip = seqLoading ? '…'
    : sequences.length === 0
      ? "No sequences yet. Tell me what you want to send and I'll wire it up."
      : `${sequences.length} sequence${sequences.length !== 1 ? 's' : ''} · ${sequences.reduce((n, s) => n + (s.steps?.length ?? 0), 0)} total steps ready.`

  const totalSteps = sequences.reduce((n, s) => n + (s.steps?.length ?? 0), 0)

  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'var(--bg-0)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--font-body)', overflow: 'hidden',
    }}>
      {/* Template editor modal */}
      {editingTemplate !== undefined && (
        <TemplateEditorModal
          template={editingTemplate}
          onClose={() => setEditingTemplate(undefined)}
          onSaved={loadTemplates}
        />
      )}

      {/* Header */}
      <div style={{
        flexShrink: 0, background: 'var(--bg-1)',
        borderBottom: '1px solid var(--border-1)',
        padding: '16px 24px 0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'rgba(34,197,94,.12)', border: '1px solid rgba(34,197,94,.25)',
            display: 'grid', placeItems: 'center', color: '#22C55E',
          }}>
            <Mail size={18} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.015em' }}>
              ChampMail
            </h2>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>
              {seqLoading ? 'Loading…' : `${sequences.length} sequence${sequences.length !== 1 ? 's' : ''} · ${templates.length} template${templates.length !== 1 ? 's' : ''}`}
            </div>
          </div>

          {/* Pixie tip */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              background: 'rgba(var(--accent-2-rgb),.08)', border: '1px solid rgba(var(--accent-2-rgb),.2)',
              borderRadius: 10, padding: '8px 14px',
              display: 'flex', alignItems: 'center', gap: 10,
              fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--text-2)', maxWidth: 280,
            }}>
              <Pixie pose="read" size={44} cloak={pixieCloak} />
              <span>"{pixieTip}"</span>
            </div>
          </div>

          <button
            onClick={() => { loadSequences(); loadTemplates() }}
            style={{ display: 'grid', placeItems: 'center', width: 32, height: 32, background: 'transparent', border: '1px solid var(--border-1)', borderRadius: 7, color: 'var(--text-3)', cursor: 'pointer' }}
            title="Refresh"
          >
            {loading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={13} />}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 2 }}>
          {(['sequences', 'templates', 'analytics'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '6px 16px 10px', borderRadius: '8px 8px 0 0',
              background: tab === t ? 'var(--bg-0)' : 'transparent',
              border: 'none', borderBottom: tab === t ? '2px solid var(--accent-2)' : '2px solid transparent',
              color: tab === t ? 'var(--accent-1)' : 'var(--text-3)',
              fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              textTransform: 'capitalize',
            }}>{t}</button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

        {/* ── Sequences tab ── */}
        {tab === 'sequences' && (
          <>
            {/* Create sequence inline */}
            <div style={{ display: 'flex', gap: 8, marginBottom: createError ? 8 : 16 }}>
              <input
                value={newName}
                onChange={(e) => { setNewName(e.target.value); setCreateError(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
                placeholder="New sequence name…"
                style={{
                  flex: 1, padding: '8px 12px', background: 'var(--bg-1)', border: '1px solid var(--border-1)',
                  borderRadius: 8, color: 'var(--text-1)', fontFamily: 'var(--font-body)', fontSize: 13, outline: 'none',
                }}
              />
              <button
                onClick={handleCreate}
                disabled={creating}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                  background: 'var(--accent-2)', border: 'none', borderRadius: 8,
                  color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13,
                  cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.7 : 1,
                }}
              >
                {creating ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />}
                Create
              </button>
            </div>

            {/* Create error */}
            {createError && (
              <div style={{ padding: '8px 12px', background: 'rgba(255,77,109,.08)', border: '1px solid rgba(255,77,109,.2)', borderRadius: 8, fontSize: 13, color: 'var(--danger)', marginBottom: 12 }}>
                {createError}
              </div>
            )}

            {/* Load error */}
            {seqError && (
              <div style={{ padding: '10px 14px', background: 'rgba(255,77,109,.08)', border: '1px solid rgba(255,77,109,.2)', borderRadius: 8, fontSize: 13, color: 'var(--danger)', marginBottom: 12 }}>
                {seqError}. <button onClick={loadSequences} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', textDecoration: 'underline', fontSize: 13 }}>Retry</button>
              </div>
            )}

            {seqLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[...Array(3)].map((_, i) => (
                  <div key={i} style={{ height: 56, background: 'var(--bg-1)', borderRadius: 10, border: '1px solid var(--border-1)', opacity: 1 - i * 0.2 }} />
                ))}
              </div>
            )}

            {!seqLoading && sequences.length === 0 && !seqError && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 20px' }}>
                <Send size={28} style={{ color: 'var(--text-4)', marginBottom: 12 }} />
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--text-1)', marginBottom: 6 }}>
                  No sequences yet
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
                  Create a sequence above or ask Pixie to build one.
                </div>
              </div>
            )}

            {!seqLoading && sequences.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sequences.map((seq) => (
                  <div key={seq.id} style={{
                    background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 10,
                    padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16,
                    transition: 'border-color .15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-2)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-1)')}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: 'var(--text-1)', marginBottom: 3 }}>
                        {seq.name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Send size={10} />
                        {seq.steps?.length ?? 0} step{(seq.steps?.length ?? 0) !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <Pill {...STATUS_PILL.draft} />
                    <button
                      onClick={() => handleDeleteSequence(seq.id, seq.name)}
                      title="Delete sequence"
                      style={{
                        display: 'grid', placeItems: 'center', width: 28, height: 28,
                        background: 'transparent', border: '1px solid transparent', borderRadius: 6,
                        color: 'var(--text-4)', cursor: 'pointer', transition: 'all .14s', flexShrink: 0,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.borderColor = 'rgba(255,77,109,.3)'; e.currentTarget.style.background = 'rgba(255,77,109,.07)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Templates tab ── */}
        {tab === 'templates' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
              <button
                onClick={() => setEditingTemplate({})}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                  background: 'var(--accent-2)', border: 'none', borderRadius: 8,
                  color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                }}
              >
                <Plus size={14} /> New Template
              </button>
            </div>

            {tplError && (
              <div style={{ padding: '10px 14px', background: 'rgba(255,77,109,.08)', border: '1px solid rgba(255,77,109,.2)', borderRadius: 8, fontSize: 13, color: 'var(--danger)', marginBottom: 12 }}>
                {tplError}. <button onClick={loadTemplates} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', textDecoration: 'underline', fontSize: 13 }}>Retry</button>
              </div>
            )}

            {tplLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[...Array(3)].map((_, i) => (
                  <div key={i} style={{ height: 56, background: 'var(--bg-1)', borderRadius: 10, border: '1px solid var(--border-1)', opacity: 1 - i * 0.2 }} />
                ))}
              </div>
            )}

            {!tplLoading && templates.length === 0 && !tplError && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 20px' }}>
                <FileText size={28} style={{ color: 'var(--text-4)', marginBottom: 12 }} />
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--text-1)', marginBottom: 6 }}>
                  No templates yet
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
                  Click "New Template" to create your first email template.
                </div>
              </div>
            )}

            {!tplLoading && templates.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {templates.map((tpl) => (
                  <div key={tpl.id} style={{
                    background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 10,
                    padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16,
                    transition: 'border-color .15s', cursor: 'pointer',
                  }}
                  onClick={() => setEditingTemplate(tpl)}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-2)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-1)')}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: 'var(--text-1)', marginBottom: 3 }}>
                        {tpl.name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tpl.subject}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(tpl.id, tpl.name) }}
                      title="Delete template"
                      style={{
                        display: 'grid', placeItems: 'center', width: 28, height: 28,
                        background: 'transparent', border: '1px solid transparent', borderRadius: 6,
                        color: 'var(--text-4)', cursor: 'pointer', transition: 'all .14s', flexShrink: 0,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.borderColor = 'rgba(255,77,109,.3)'; e.currentTarget.style.background = 'rgba(255,77,109,.07)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Analytics tab ── */}
        {tab === 'analytics' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
              {[
                { label: 'Sequences', value: String(sequences.length), color: 'var(--accent-2)' },
                { label: 'Total steps', value: String(totalSteps), color: 'var(--success)' },
                { label: 'Emails sent', value: '—', color: 'var(--text-3)' },
              ].map((m) => (
                <div key={m.label} style={{ background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 10, padding: '18px 20px' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, color: m.color, letterSpacing: '-.02em' }}>{m.value}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-4)', marginTop: 4 }}>{m.label}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13, background: 'var(--bg-1)', borderRadius: 10, border: '1px solid var(--border-1)' }}>
              Open rate, reply rate, and bounce data will appear here once you enroll prospects and run sequences.
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
