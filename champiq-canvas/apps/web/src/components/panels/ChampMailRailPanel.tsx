import { useState, useEffect } from 'react'
import { Pixie } from '@/components/pixie/Pixie'
import { Mail, Send, Plus, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'

interface Props {
  pixieCloak: string
  sidebar?: boolean
}

interface Sequence {
  id: number
  name: string
  steps: { id: number; step_index: number; template_id: number }[]
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

export function ChampMailRailPanel({ pixieCloak, sidebar: _sidebar }: Props) {
  const [tab, setTab] = useState<'sequences' | 'analytics'>('sequences')
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const load = () => {
    setLoading(true)
    setError(null)
    api.cmListSequences()
      .then((res) => setSequences(res as unknown as Sequence[]))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleCreate() {
    const name = newName.trim() || 'New Sequence'
    setCreating(true)
    try {
      await api.cmCreateSequence({ name })
      setNewName('')
      load()
    } catch { /* ignore */ }
    finally { setCreating(false) }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Delete sequence "${name}"?`)) return
    try {
      await api.cmDeleteSequence(id)
      load()
    } catch { /* ignore */ }
  }

  const pixieTip = loading ? '…'
    : sequences.length === 0
      ? "No sequences yet. Tell me what you want to send and I'll wire it up."
      : `${sequences.length} sequence${sequences.length !== 1 ? 's' : ''} · ${sequences.reduce((n, s) => n + s.steps.length, 0)} total steps ready.`

  const totalSteps = sequences.reduce((n, s) => n + s.steps.length, 0)

  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'var(--bg-0)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--font-body)', overflow: 'hidden',
    }}>
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
              {loading ? 'Loading…' : `${sequences.length} sequence${sequences.length !== 1 ? 's' : ''}`}
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
            onClick={() => load()}
            style={{ display: 'grid', placeItems: 'center', width: 32, height: 32, background: 'transparent', border: '1px solid var(--border-1)', borderRadius: 7, color: 'var(--text-3)', cursor: 'pointer' }}
            title="Refresh"
          >
            {loading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={13} />}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 2 }}>
          {(['sequences', 'analytics'] as const).map((t) => (
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
        {tab === 'sequences' && (
          <>
            {/* Create sequence inline */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
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
                  color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, cursor: creating ? 'not-allowed' : 'pointer',
                  opacity: creating ? 0.7 : 1,
                }}
              >
                {creating ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />}
                Create
              </button>
            </div>

            {/* Error */}
            {error && (
              <div style={{ padding: '10px 14px', background: 'rgba(255,77,109,.08)', border: '1px solid rgba(255,77,109,.2)', borderRadius: 8, fontSize: 13, color: 'var(--danger)', marginBottom: 12 }}>
                {error} — <button onClick={load} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', textDecoration: 'underline', fontSize: 13 }}>Retry</button>
              </div>
            )}

            {/* Loading skeleton */}
            {loading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[...Array(3)].map((_, i) => (
                  <div key={i} style={{ height: 56, background: 'var(--bg-1)', borderRadius: 10, border: '1px solid var(--border-1)', opacity: 1 - i * 0.2 }} />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!loading && sequences.length === 0 && !error && (
              <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                <Send size={28} style={{ color: 'var(--text-4)', marginBottom: 12 }} />
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--text-1)', marginBottom: 6 }}>
                  No sequences yet
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
                  Create a sequence above or ask Pixie to build one.
                </div>
              </div>
            )}

            {/* Sequence list */}
            {!loading && sequences.length > 0 && (
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
                        {seq.steps.length} step{seq.steps.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <Pill {...STATUS_PILL.draft} />
                    <button
                      onClick={() => handleDelete(seq.id, seq.name)}
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
