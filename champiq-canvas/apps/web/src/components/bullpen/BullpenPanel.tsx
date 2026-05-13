import { useState } from 'react'
import { Icon, Tag } from '@/components/atoms'
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

export function BullpenPanel() {
  const [search, setSearch] = useState('')
  const { prospects, total, loading, error } = useProspects({ search: search || undefined, limit: 100 })

  return (
    <div style={{ width: 360, flexShrink: 0, background: 'var(--bg-0)', borderRight: '1px solid var(--border-1)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Header */}
      <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--border-1)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <Icon name="user" size={15} stroke="var(--accent-2)" />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' }}>Bullpen</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-4)', marginTop: 1 }}>{total} PROSPECTS</div>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-1)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 8, padding: '6px 10px' }}>
          <Icon name="search" size={13} stroke="var(--text-3)" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name or company…"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-1)', fontFamily: 'var(--font-body)', fontSize: 12 }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', padding: 0 }}>
              <Icon name="x" size={12} />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="scroll" style={{ flex: 1, overflowY: 'auto' }}>
        {loading && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>Loading…</div>}
        {error   && <div style={{ padding: 24, textAlign: 'center', color: 'var(--danger)', fontSize: 12 }}>{error}</div>}
        {!loading && !error && prospects.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>No prospects found.</div>
        )}
        {prospects.map(p => (
          <div
            key={p.id}
            style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-1)', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', transition: 'background .14s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-1)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.full_name ?? ([p.first_name, p.last_name].filter(Boolean).join(' ') || p.email)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {[p.role, p.company].filter(Boolean).join(' · ')}
              </div>
            </div>
            <Tag color={STATUS_COLOR[p.status]}>{p.status.replace('_', ' ')}</Tag>
          </div>
        ))}
      </div>
    </div>
  )
}
