import { useState, useEffect } from 'react'
import { Pixie } from '@/components/pixie/Pixie'
import { Network, Loader2, RefreshCw, ExternalLink } from 'lucide-react'
import { api } from '@/lib/api'

interface Props {
  pixieCloak: string
  sidebar?: boolean
}

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
}

const STATUS_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  active:       { color: 'var(--success)',        bg: 'rgba(74,222,128,.12)',   label: 'Active' },
  bounced:      { color: 'var(--danger)',          bg: 'rgba(255,77,109,.1)',    label: 'Bounced' },
  unsubscribed: { color: 'var(--text-4)',          bg: 'rgba(123,134,166,.1)',   label: 'Unsub' },
  replied:      { color: 'var(--info,#38bdf8)',    bg: 'rgba(56,189,248,.1)',    label: 'Replied' },
}

function displayName(p: Prospect): string {
  const parts = [p.first_name, p.last_name].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : p.email.split('@')[0]
}

function NotConfigured({ feature }: { feature: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
      <Network size={32} style={{ color: 'var(--text-4)', marginBottom: 14 }} />
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--text-1)', marginBottom: 8 }}>
        {feature} unavailable
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, maxWidth: 320, margin: '0 auto' }}>
        Live {feature.toLowerCase()} require the Graphiti service. Set{' '}
        <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--bg-3)', padding: '1px 5px', borderRadius: 3 }}>CHAMPGRAPH_URL</code>{' '}
        in your Railway environment variables to connect.
      </div>
      <a
        href="https://github.com/developer00777/Cham_Graph"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 16,
          padding: '7px 14px', background: 'var(--bg-2)', border: '1px solid var(--border-1)',
          borderRadius: 7, color: 'var(--text-2)', textDecoration: 'none',
          fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 500,
        }}
      >
        <ExternalLink size={12} /> ChampGraph setup guide
      </a>
    </div>
  )
}

export function ChampGraphRailPanel({ pixieCloak, sidebar: _sidebar }: Props) {
  const [tab, setTab] = useState<'prospects' | 'signals' | 'companies'>('prospects')
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    api.cmListProspects({ limit: 50 })
      .then((res) => {
        const r = res as unknown as ProspectListResponse
        setProspects(r.items ?? [])
        setTotal(r.total ?? 0)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const pixieTip = loading ? '…'
    : total === 0
      ? "No prospects yet. Import a CSV in the Bullpen to populate your pipeline."
      : `${total} prospect${total !== 1 ? 's' : ''} in your pipeline. Connect ChampGraph for live intent signals.`

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
            background: 'rgba(59,130,246,.12)', border: '1px solid rgba(59,130,246,.25)',
            display: 'grid', placeItems: 'center', color: '#3B82F6',
          }}>
            <Network size={18} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.015em' }}>
              ChampGraph
            </h2>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>
              {loading ? 'Loading…' : `${total} prospect${total !== 1 ? 's' : ''} · signals require Graphiti`}
            </div>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              background: 'rgba(var(--accent-2-rgb),.08)', border: '1px solid rgba(var(--accent-2-rgb),.2)',
              borderRadius: 10, padding: '8px 14px',
              display: 'flex', alignItems: 'center', gap: 10,
              fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--text-2)', maxWidth: 280,
            }}>
              <Pixie pose="point" size={44} cloak={pixieCloak} />
              <span>"{pixieTip}"</span>
            </div>
          </div>

          <button
            onClick={load}
            style={{ display: 'grid', placeItems: 'center', width: 32, height: 32, background: 'transparent', border: '1px solid var(--border-1)', borderRadius: 7, color: 'var(--text-3)', cursor: 'pointer' }}
            title="Refresh"
          >
            {loading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={13} />}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 2 }}>
          {(['prospects', 'signals', 'companies'] as const).map((t) => (
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

        {tab === 'signals' && <NotConfigured feature="Signals" />}
        {tab === 'companies' && <NotConfigured feature="Companies" />}

        {tab === 'prospects' && (
          <>
            {error && (
              <div style={{ padding: '10px 14px', background: 'rgba(255,77,109,.08)', border: '1px solid rgba(255,77,109,.2)', borderRadius: 8, fontSize: 13, color: 'var(--danger)', marginBottom: 12 }}>
                {error} — <button onClick={load} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', textDecoration: 'underline', fontSize: 13 }}>Retry</button>
              </div>
            )}

            {loading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[...Array(4)].map((_, i) => (
                  <div key={i} style={{ height: 52, background: 'var(--bg-1)', borderRadius: 8, border: '1px solid var(--border-1)', opacity: 1 - i * 0.18 }} />
                ))}
              </div>
            )}

            {!loading && total === 0 && !error && (
              <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                <Network size={28} style={{ color: 'var(--text-4)', marginBottom: 12 }} />
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--text-1)', marginBottom: 6 }}>No prospects yet</div>
                <div style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>Import a CSV in the Bullpen to populate your pipeline.</div>
              </div>
            )}

            {!loading && prospects.length > 0 && (
              <div style={{ background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 10, overflow: 'hidden' }}>
                {/* Table header */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 160px 100px',
                  padding: '8px 18px', borderBottom: '1px solid var(--border-1)',
                  fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-4)',
                }}>
                  <span>Prospect</span><span>Company / Title</span><span>Status</span>
                </div>

                {prospects.map((p, i) => {
                  const sc = STATUS_STYLES[p.status] ?? STATUS_STYLES.active
                  return (
                    <div key={p.id} style={{
                      display: 'grid', gridTemplateColumns: '1fr 160px 100px',
                      padding: '12px 18px', alignItems: 'center',
                      borderBottom: i < prospects.length - 1 ? '1px solid var(--border-1)' : 'none',
                      transition: 'background .12s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>
                          {displayName(p)}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>{p.email}</div>
                      </div>
                      <div style={{ minWidth: 0 }}>
                        {p.company && <div style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.company}</div>}
                        {p.title && <div style={{ fontSize: 11, color: 'var(--text-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>}
                      </div>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '2px 8px', borderRadius: 4,
                        background: sc.bg, color: sc.color,
                        fontFamily: 'var(--font-mono)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.1em',
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
          </>
        )}
      </div>
    </div>
  )
}
