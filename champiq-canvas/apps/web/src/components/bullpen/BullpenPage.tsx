import { useState } from 'react'
import { Icon, Btn, Tag } from '@/components/atoms'
import { useProspects } from '@/hooks/useProspects'
import type { Prospect } from '@/lib/api/champmail'

const STATUS_COLOR: Record<Prospect['status'], string> = {
  ready:        'var(--success)',
  needs_review: 'var(--warn)',
  invalid:      'var(--danger)',
  enrolled:     'var(--info)',
  replied:      'var(--mint-2)',
  unsubscribed: 'var(--text-4)',
}

export function BullpenPage({ onBack }: { onBack?: () => void }) {
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'list' | 'map'>('list')
  const { prospects, total, loading, refresh } = useProspects({ search: search || undefined, limit: 500 })

  return (
    <div style={{ width: '100%', height: '100%', background: 'var(--bg-0)', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'var(--font-body)', color: 'var(--text-1)' }}>
      {/* Header */}
      <div style={{ height: 52, flexShrink: 0, background: 'var(--bg-1)', borderBottom: '1px solid var(--border-1)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12 }}>
        {onBack && (
          <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 12, padding: '4px 8px', borderRadius: 6 }}>
            <Icon name="chevLeft" size={14} />Back
          </button>
        )}
        <Icon name="user" size={18} stroke="var(--accent-2)" />
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15 }}>Bullpen</span>
        <span style={{ background: 'rgba(var(--accent-2-rgb),.12)', border: '1px solid rgba(var(--accent-2-rgb),.25)', borderRadius: 20, padding: '1px 8px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent-1)' }}>
          {total} prospects
        </span>
        <div style={{ display: 'flex', gap: 2, marginLeft: 8 }}>
          {(['list', 'map'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{ padding: '5px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', background: view === v ? 'var(--bg-3)' : 'transparent', color: view === v ? 'var(--text-1)' : 'var(--text-3)', fontFamily: 'var(--font-display)', fontSize: 12.5, fontWeight: 600 }}>
              {v === 'list' ? 'List' : 'Pipeline map'}
            </button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 8, padding: '5px 10px' }}>
          <Icon name="search" size={13} stroke="var(--text-3)" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-1)', fontFamily: 'var(--font-body)', fontSize: 12, width: 160 }} />
        </div>
        <Btn variant="secondary" size="md" icon="refresh" onClick={refresh}>Refresh</Btn>
      </div>

      {/* Body */}
      <div className="scroll" style={{ flex: 1, overflowY: 'auto' }}>
        {view === 'map' ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-3)', fontSize: 13 }}>
            Pipeline map — coming soon
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-1)', borderBottom: '1px solid var(--border-1)', position: 'sticky', top: 0 }}>
                {['Name', 'Company', 'Role', 'Status', 'Sequence'].map(h => (
                  <th key={h} style={{ padding: '9px 16px', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>Loading…</td></tr>
              ) : prospects.map(p => (
                <tr
                  key={p.id}
                  style={{ borderBottom: '1px solid var(--border-1)', transition: 'background .12s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg-1)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent' }}
                >
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>
                      {p.full_name ?? [p.first_name, p.last_name].filter(Boolean).join(' ') || '—'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.email}</div>
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--text-2)' }}>{p.company ?? '—'}</td>
                  <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--text-2)' }}>{p.role ?? '—'}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <Tag color={STATUS_COLOR[p.status]}>{p.status.replace('_', ' ')}</Tag>
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{p.sequence_name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
