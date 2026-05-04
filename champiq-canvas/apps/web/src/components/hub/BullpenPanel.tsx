import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Upload, X, Users, Sparkles, Mail, Tag, Trash2, Loader2, RefreshCw } from 'lucide-react'
import { Pixie } from '@/components/pixie/Pixie'
import { useUIStore } from '@/store/uiStore'
import { api } from '@/lib/api'

interface Prospect {
  id: number
  email: string
  first_name: string | null
  last_name: string | null
  company: string | null
  title: string | null
  status: 'active' | 'bounced' | 'unsubscribed' | 'replied'
}

interface ProspectListResponse {
  items: Prospect[]
  total: number
  limit: number
  offset: number
}

const STATUS_STYLES: Record<string, { color: string; label: string }> = {
  active:       { color: 'var(--success)',  label: 'Active' },
  bounced:      { color: 'var(--danger)',   label: 'Bounced' },
  unsubscribed: { color: 'var(--text-4)',   label: 'Unsub' },
  replied:      { color: 'var(--info, #38bdf8)', label: 'Replied' },
}

function displayName(p: Prospect): string {
  const parts = [p.first_name, p.last_name].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : p.email.split('@')[0]
}

export function BullpenPanel() {
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { cloak, accent } = useUIStore()

  const load = useCallback(async (q?: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.cmListProspects({ limit: 100, search: q ?? search }) as unknown as ProspectListResponse
      setProspects(res.items ?? [])
      setTotal(res.total ?? 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load prospects')
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function handleSearch(v: string) {
    setSearch(v)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => load(v), 350)
  }

  const filtered = prospects // already filtered server-side; show all
  const allSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id))

  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(filtered.map((p) => p.id)))
  }
  function toggle(id: number) {
    setSelected((s) => { const ns = new Set(s); ns.has(id) ? ns.delete(id) : ns.add(id); return ns })
  }

  async function handleDeleteSelected() {
    if (!confirm(`Remove ${selected.size} prospect${selected.size !== 1 ? 's' : ''}?`)) return
    setDeleting(true)
    try {
      await Promise.all([...selected].map((id) => api.cmDeleteProspect(id)))
      setSelected(new Set())
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/uploads/prospects', { method: 'POST', body: form })
      if (!res.ok) throw new Error(await res.text())
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const statusCounts = {
    active:       filtered.filter((p) => p.status === 'active').length,
    bounced:      filtered.filter((p) => p.status === 'bounced').length,
    unsubscribed: filtered.filter((p) => p.status === 'unsubscribed').length,
    replied:      filtered.filter((p) => p.status === 'replied').length,
  }

  return (
    <div data-accent={accent} style={{
      width: '100%', flex: 1, background: 'var(--bg-0)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: 'var(--font-body)', color: 'var(--text-1)',
    }}>
      {/* Header */}
      <div style={{
        padding: '0 20px', height: 52, flexShrink: 0,
        background: 'var(--bg-1)', borderBottom: '1px solid var(--border-1)',
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'color-mix(in oklch, var(--accent-2) 18%, var(--bg-0))', color: 'var(--accent-2)', display: 'grid', placeItems: 'center' }}>
            <Users size={14} />
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15 }}>Bullpen</span>
          {!loading && (
            <span style={{ background: 'rgba(var(--accent-2-rgb),.12)', border: '1px solid rgba(var(--accent-2-rgb),.25)', borderRadius: 20, padding: '1px 8px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent-1)', letterSpacing: '.1em' }}>
              {total} prospects
            </span>
          )}
        </div>
        <span style={{ flex: 1 }} />

        <button
          onClick={() => load()}
          title="Refresh"
          style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, background: 'transparent', border: '1px solid var(--border-1)', borderRadius: 6, color: 'var(--text-3)', cursor: 'pointer' }}
        >
          {loading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={12} />}
        </button>

        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)', pointerEvents: 'none' }} />
          <input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search prospects…"
            style={{
              paddingLeft: 28, paddingRight: 10, paddingTop: 5, paddingBottom: 5,
              background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 7,
              color: 'var(--text-1)', fontFamily: 'var(--font-body)', fontSize: 12,
              outline: 'none', width: 200,
            }}
          />
        </div>

        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={handleFileUpload} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 7, color: 'var(--text-2)', fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 500, cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.6 : 1 }}
        >
          {uploading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={12} />}
          {uploading ? 'Importing…' : 'Import CSV'}
        </button>
      </div>

      <div className="scroll" style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Error state */}
        {error && (
          <div style={{ padding: '12px 16px', background: 'rgba(255,77,109,.08)', border: '1px solid rgba(255,77,109,.2)', borderRadius: 10, fontSize: 13, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ flex: 1 }}>{error}</span>
            <button onClick={() => load()} style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}>Retry</button>
          </div>
        )}

        {/* Pixie tip — only when data is loaded */}
        {!loading && !error && (
          <div style={{ background: 'rgba(var(--accent-2-rgb),.07)', border: '1px solid rgba(var(--accent-2-rgb),.2)', borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <Pixie pose="read" size={36} cloak={cloak} ambient={false} />
            <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5, alignSelf: 'center' }}>
              {total === 0
                ? "No prospects yet. Import a CSV to get started. I'll help you enrich and enroll them."
                : statusCounts.bounced > 0
                  ? `${statusCounts.bounced} bounced address${statusCounts.bounced !== 1 ? 'es' : ''}. I can remove them or find alternatives via ChampGraph.`
                  : `${statusCounts.active} active prospect${statusCounts.active !== 1 ? 's' : ''}${statusCounts.replied > 0 ? ` · ${statusCounts.replied} repl${statusCounts.replied !== 1 ? 'ies' : 'y'}` : ''}. Ready to enroll.`
              }
            </div>
          </div>
        )}

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div style={{
            background: 'rgba(var(--accent-2-rgb),.08)', border: '1px solid rgba(var(--accent-2-rgb),.25)',
            borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12,
            animation: 'bubble-in 180ms var(--ease-spring)',
          }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, color: 'var(--accent-1)', flexShrink: 0 }}>
              {selected.size} selected
            </span>
            <div style={{ flex: 1, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <BulkBtn icon={<Mail size={12} />}>Enroll in sequence</BulkBtn>
              <BulkBtn icon={<Sparkles size={12} />}>Enrich with Pixie</BulkBtn>
              <BulkBtn icon={<Tag size={12} />}>Tag</BulkBtn>
              <BulkBtn icon={<Trash2 size={12} />} danger onClick={handleDeleteSelected} disabled={deleting}>
                {deleting ? 'Removing…' : 'Remove'}
              </BulkBtn>
            </div>
            <button onClick={() => setSelected(new Set())} style={{ background: 'transparent', border: 'none', color: 'var(--text-4)', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* Status chips */}
        {!loading && total > 0 && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              { label: 'Active',  count: statusCounts.active,       color: 'var(--success)' },
              { label: 'Replied', count: statusCounts.replied,      color: 'var(--info, #38bdf8)' },
              { label: 'Bounced', count: statusCounts.bounced,      color: 'var(--danger)' },
              { label: 'Unsub',   count: statusCounts.unsubscribed, color: 'var(--text-4)' },
            ].filter((c) => c.count > 0).map((chip) => (
              <div key={chip.label} style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px',
                background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 20,
                fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.06em',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: chip.color }} />
                <span style={{ color: 'var(--text-2)' }}>{chip.label}</span>
                <span style={{ color: chip.color, fontWeight: 700 }}>{chip.count}</span>
              </div>
            ))}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} style={{ height: 52, background: 'var(--bg-1)', borderRadius: 8, border: '1px solid var(--border-1)', opacity: 1 - i * 0.15, animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && total === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '48px 20px', textAlign: 'center' }}>
            <Pixie pose="idle" size={64} cloak={cloak} ambient={false} />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, color: 'var(--text-1)', marginBottom: 6 }}>No prospects yet</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, maxWidth: 320 }}>
                Import a CSV to populate your Bullpen. I'll help you enrich, score, and enroll them in sequences.
              </div>
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: 'var(--accent-2)', border: 'none', borderRadius: 8, color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              <Upload size={14} /> Import CSV
            </button>
          </div>
        )}

        {/* Prospect table */}
        {!loading && total > 0 && (
          <div style={{ background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 12, overflow: 'hidden' }}>
            {/* Header row */}
            <div style={{
              display: 'grid', gridTemplateColumns: '36px 1fr 160px 120px',
              padding: '8px 16px', borderBottom: '1px solid var(--border-1)',
              background: 'var(--bg-0)',
            }}>
              <div style={{ display: 'grid', placeItems: 'center' }}>
                <Checkbox checked={allSelected} onChange={toggleAll} />
              </div>
              {['Prospect', 'Company / Title', 'Status'].map((h) => (
                <div key={h} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-4)', display: 'flex', alignItems: 'center' }}>{h}</div>
              ))}
            </div>

            {filtered.map((p, i) => {
              const sc = STATUS_STYLES[p.status] ?? { color: 'var(--text-4)', label: p.status }
              const isSelected = selected.has(p.id)
              return (
                <div
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  style={{
                    display: 'grid', gridTemplateColumns: '36px 1fr 160px 120px',
                    padding: '11px 16px', alignItems: 'center',
                    borderBottom: i < filtered.length - 1 ? '1px solid var(--border-1)' : 'none',
                    background: isSelected ? 'rgba(var(--accent-2-rgb),.06)' : 'transparent',
                    cursor: 'pointer', transition: 'background .12s',
                  }}
                  onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--bg-2)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = isSelected ? 'rgba(var(--accent-2-rgb),.06)' : 'transparent' }}
                >
                  <div style={{ display: 'grid', placeItems: 'center' }}>
                    <Checkbox checked={isSelected} onChange={() => toggle(p.id)} />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: 15, flexShrink: 0,
                      background: 'color-mix(in oklch, var(--accent-2) 18%, var(--bg-3))',
                      display: 'grid', placeItems: 'center',
                      fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, color: 'var(--accent-2)',
                    }}>
                      {displayName(p)[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {displayName(p)}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-4)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.email}
                      </div>
                    </div>
                  </div>

                  <div style={{ minWidth: 0 }}>
                    {p.company && (
                      <div style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.company}</div>
                    )}
                    {p.title && (
                      <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                    )}
                    {!p.company && !p.title && (
                      <span style={{ fontSize: 11, color: 'var(--text-4)' }}>—</span>
                    )}
                  </div>

                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '3px 9px', borderRadius: 20,
                    background: `color-mix(in oklch, ${sc.color} 14%, transparent)`,
                    border: `1px solid color-mix(in oklch, ${sc.color} 30%, transparent)`,
                    fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase',
                    letterSpacing: '.1em', color: sc.color,
                    width: 'fit-content',
                  }}>
                    <span style={{ width: 4, height: 4, borderRadius: '50%', background: sc.color, flexShrink: 0 }} />
                    {sc.label}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange() }}
      style={{
        width: 16, height: 16, borderRadius: 4,
        background: checked ? 'var(--accent-2)' : 'transparent',
        border: checked ? '1.5px solid var(--accent-2)' : '1.5px solid var(--border-2)',
        display: 'grid', placeItems: 'center', cursor: 'pointer', transition: 'all .15s', flexShrink: 0,
      }}
    >
      {checked && <span style={{ color: '#fff', fontSize: 9, fontWeight: 700, lineHeight: 1 }}>✓</span>}
    </button>
  )
}

function BulkBtn({ icon, children, danger, onClick, disabled }: {
  icon: React.ReactNode; children: React.ReactNode
  danger?: boolean; onClick?: () => void; disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px',
        background: danger ? 'rgba(255,77,109,.1)' : 'var(--bg-2)',
        border: `1px solid ${danger ? 'rgba(255,77,109,.3)' : 'var(--border-1)'}`,
        borderRadius: 7, color: danger ? 'var(--danger)' : 'var(--text-2)',
        fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
      }}
    >
      {icon} {children}
    </button>
  )
}
