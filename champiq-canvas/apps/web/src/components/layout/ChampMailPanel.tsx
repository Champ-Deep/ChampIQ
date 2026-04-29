/**
 * ChampMailPanel — manage Prospects + Templates inline in the sidebar.
 *
 * Sequences and Analytics are NOT here — those live on the canvas (per the
 * "hybrid UI" decision in ChampMail_Inline_Spec.md).
 *
 * Two collapsible sub-panels:
 *  - Prospects: table + bulk CSV import (re-uses /api/uploads/prospects to parse)
 *  - Templates: list + open editor modal (subject + body_html with variable picker)
 */
import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { ChevronDown, ChevronUp, Plus, Trash2, Mail, X, Eye } from '@/lib/icons'

interface Prospect {
  id: number
  email: string
  first_name?: string
  last_name?: string
  company?: string
  status: string
  last_sent_at?: string
  last_replied_at?: string
}

interface Template {
  id: number
  name: string
  subject: string
  body_html: string
  body_text?: string
  variables: string[]
  updated_at?: string
}

// ── Prospects sub-panel ──────────────────────────────────────────────────────

function ProspectsSection() {
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [form, setForm] = useState({ email: '', first_name: '', last_name: '', company: '', phone: '' })
  const fileRef = useRef<HTMLInputElement>(null)

  async function refresh() {
    setLoading(true)
    try {
      const r = await api.cmListProspects({ limit: 100, search: search || undefined })
      setProspects(r.items as unknown as Prospect[])
    } catch (e) {
      console.error('cmListProspects', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])  // initial load

  async function addProspect() {
    if (!form.email) return
    try {
      await api.cmCreateProspect({ ...form })
      setAdding(false)
      setForm({ email: '', first_name: '', last_name: '', company: '', phone: '' })
      refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'failed')
    }
  }

  async function deleteProspect(id: number) {
    if (!confirm('Delete this prospect?')) return
    await api.cmDeleteProspect(id)
    setProspects((p) => p.filter((x) => x.id !== id))
  }

  async function importCsv(file: File) {
    setImporting(true)
    setImportMsg(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/uploads/prospects', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(`upload failed: ${res.status}`)
      const data = await res.json() as { records: Record<string, unknown>[] }
      let created = 0, skipped = 0
      for (const rec of data.records) {
        try {
          await api.cmCreateProspect(rec)
          created++
        } catch {
          skipped++
        }
      }
      setImportMsg(`Imported ${created}, skipped ${skipped} (duplicates)`)
      refresh()
    } catch (e) {
      setImportMsg(`Import failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="px-3 py-2 flex flex-col gap-2">
      <div className="flex gap-1">
        <input
          className="flex-1 text-xs p-1.5 rounded focus:outline-none"
          style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
          placeholder="Search by email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && refresh()}
        />
        <button onClick={refresh} className="px-2 text-xs rounded" style={{ border: '1px solid var(--border)', color: 'var(--text-2)' }}>
          {loading ? '…' : 'Go'}
        </button>
      </div>

      <div className="flex gap-1">
        <button
          onClick={() => setAdding((a) => !a)}
          className="flex-1 px-2 py-1 text-xs rounded flex items-center justify-center gap-1"
          style={{ border: '1px solid var(--border)', color: 'var(--text-2)' }}
        >
          <Plus size={12} /> Add
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          className="flex-1 px-2 py-1 text-xs rounded"
          style={{ border: '1px solid var(--border)', color: 'var(--text-2)' }}
        >
          {importing ? 'Importing…' : 'Import CSV'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])}
        />
      </div>

      {importMsg && <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>{importMsg}</p>}

      {adding && (
        <div className="flex flex-col gap-1 p-2 rounded" style={{ border: '1px solid var(--border)', background: 'var(--bg-base)' }}>
          <input className="text-xs p-1 rounded focus:outline-none" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
            placeholder="email *" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="text-xs p-1 rounded focus:outline-none" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
            placeholder="first name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
          <input className="text-xs p-1 rounded focus:outline-none" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
            placeholder="company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          <input className="text-xs p-1 rounded focus:outline-none" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
            placeholder="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <div className="flex gap-1">
            <button onClick={addProspect} className="flex-1 px-2 py-1 text-xs rounded" style={{ background: '#A855F7', color: 'white' }}>Save</button>
            <button onClick={() => setAdding(false)} className="flex-1 px-2 py-1 text-xs rounded" style={{ border: '1px solid var(--border)', color: 'var(--text-2)' }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-0.5 max-h-[300px] overflow-y-auto">
        {prospects.length === 0 && (
          <p className="text-xs italic" style={{ color: 'var(--text-3)' }}>No prospects yet.</p>
        )}
        {prospects.map((p) => (
          <div key={p.id} className="group flex items-center justify-between px-2 py-1 rounded" style={{ background: 'var(--bg-base)', color: 'var(--text-1)' }}>
            <div className="flex flex-col min-w-0">
              <span className="text-xs truncate">{p.email}</span>
              <span className="text-[10px] truncate" style={{ color: 'var(--text-3)' }}>
                {[p.first_name, p.company].filter(Boolean).join(' • ')} · {p.status}
              </span>
            </div>
            <button onClick={() => deleteProspect(p.id)} className="opacity-0 group-hover:opacity-100" style={{ color: '#f87171' }}>
              <Trash2 size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Templates sub-panel ──────────────────────────────────────────────────────

function TemplateEditor({ template, onClose, onSaved }: {
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
    if (!name || !subject || !body) { setErr('name, subject, body required'); return }
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
      setErr(e instanceof Error ? e.message : 'save failed')
    } finally {
      setSaving(false)
    }
  }

  async function runPreview() {
    if (!template?.id) {
      // For new templates we can't hit /preview, so render a quick local fallback
      setPreview({ subject, body_html: body })
      return
    }
    try {
      const vars = JSON.parse(previewVars || '{}')
      const out = await api.cmPreviewTemplate(template.id, vars)
      setPreview({ subject: out.subject, body_html: out.body_html })
    } catch (e) {
      setErr(`preview failed: ${e instanceof Error ? e.message : e}`)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="w-[640px] max-h-[90vh] overflow-y-auto rounded-xl p-5 flex flex-col gap-3"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{template?.id ? 'Edit' : 'New'} Template</h3>
          <button onClick={onClose} style={{ color: 'var(--text-3)' }}><X size={16} /></button>
        </div>

        <label className="text-xs" style={{ color: 'var(--text-2)' }}>Name</label>
        <input className="text-xs p-2 rounded focus:outline-none" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
          value={name} onChange={(e) => setName(e.target.value)} />

        <label className="text-xs" style={{ color: 'var(--text-2)' }}>Subject (use {`{{ first_name }}`}, {`{{ company }}`}, ...)</label>
        <input className="text-xs p-2 rounded focus:outline-none font-mono" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
          value={subject} onChange={(e) => setSubject(e.target.value)} />

        <label className="text-xs" style={{ color: 'var(--text-2)' }}>Body HTML</label>
        <textarea rows={10} className="text-xs p-2 rounded focus:outline-none font-mono" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
          value={body} onChange={(e) => setBody(e.target.value)} placeholder="<p>Hi {{ first_name }},</p>" />

        <div className="flex gap-2">
          <input className="flex-1 text-xs p-2 rounded focus:outline-none font-mono" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
            value={previewVars} onChange={(e) => setPreviewVars(e.target.value)} placeholder='{"first_name":"Alice"}' />
          <button onClick={runPreview} className="px-3 py-1 text-xs rounded flex items-center gap-1" style={{ border: '1px solid var(--border)', color: 'var(--text-2)' }}>
            <Eye size={12} /> Preview
          </button>
        </div>

        {preview && (
          <div className="p-3 rounded text-xs" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-1)' }}>
            <div className="font-semibold mb-1">Subject: {preview.subject}</div>
            <div className="prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: preview.body_html }} />
          </div>
        )}

        {err && <p className="text-xs" style={{ color: '#f87171' }}>{err}</p>}

        <div className="flex gap-2 mt-1">
          <button onClick={save} disabled={saving} className="flex-1 py-1.5 rounded text-sm font-medium disabled:opacity-50" style={{ background: '#A855F7', color: 'white' }}>
            {saving ? 'Saving…' : 'Save Template'}
          </button>
          <button onClick={onClose} className="flex-1 py-1.5 rounded text-sm" style={{ border: '1px solid var(--border)', color: 'var(--text-2)' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function TemplatesSection() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [editing, setEditing] = useState<Partial<Template> | null>(null)

  async function refresh() {
    try {
      const r = await api.cmListTemplates() as unknown as Template[]
      setTemplates(r)
    } catch (e) {
      console.error('cmListTemplates', e)
    }
  }
  useEffect(() => { refresh() }, [])

  async function deleteTemplate(id: number) {
    if (!confirm('Delete this template?')) return
    await api.cmDeleteTemplate(id)
    setTemplates((t) => t.filter((x) => x.id !== id))
  }

  return (
    <div className="px-3 py-2 flex flex-col gap-2">
      <button onClick={() => setEditing({})} className="px-2 py-1 text-xs rounded flex items-center justify-center gap-1"
        style={{ border: '1px solid var(--border)', color: 'var(--text-2)' }}>
        <Plus size={12} /> New Template
      </button>

      <div className="flex flex-col gap-0.5 max-h-[260px] overflow-y-auto">
        {templates.length === 0 && (
          <p className="text-xs italic" style={{ color: 'var(--text-3)' }}>No templates yet.</p>
        )}
        {templates.map((t) => (
          <div key={t.id} className="group flex items-center justify-between px-2 py-1 rounded cursor-pointer"
            style={{ background: 'var(--bg-base)', color: 'var(--text-1)' }}
            onClick={() => setEditing(t)}>
            <div className="flex flex-col min-w-0">
              <span className="text-xs truncate font-medium">{t.name}</span>
              <span className="text-[10px] truncate" style={{ color: 'var(--text-3)' }}>{t.subject}</span>
            </div>
            <button onClick={(e) => { e.stopPropagation(); deleteTemplate(t.id) }} className="opacity-0 group-hover:opacity-100" style={{ color: '#f87171' }}>
              <Trash2 size={11} />
            </button>
          </div>
        ))}
      </div>

      {editing !== null && (
        <TemplateEditor template={editing} onClose={() => setEditing(null)} onSaved={refresh} />
      )}
    </div>
  )
}

// ── Main panel ───────────────────────────────────────────────────────────────

export function ChampMailPanel() {
  const [open, setOpen] = useState(true)
  const [tab, setTab] = useState<'prospects' | 'templates'>('prospects')

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide"
        style={{ color: 'var(--text-3)' }}
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5"><Mail size={12} /> ChampMail</span>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && (
        <>
          <div className="flex border-b text-xs" style={{ borderColor: 'var(--border)' }}>
            <button
              className="flex-1 py-1.5"
              style={{
                color: tab === 'prospects' ? 'var(--text-1)' : 'var(--text-3)',
                borderBottom: tab === 'prospects' ? '2px solid #A855F7' : '2px solid transparent',
              }}
              onClick={() => setTab('prospects')}
            >Prospects</button>
            <button
              className="flex-1 py-1.5"
              style={{
                color: tab === 'templates' ? 'var(--text-1)' : 'var(--text-3)',
                borderBottom: tab === 'templates' ? '2px solid #A855F7' : '2px solid transparent',
              }}
              onClick={() => setTab('templates')}
            >Templates</button>
          </div>
          {tab === 'prospects' ? <ProspectsSection /> : <TemplatesSection />}
        </>
      )}
    </div>
  )
}
