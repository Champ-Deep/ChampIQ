import { Pixie } from '@/components/atoms'
import { useUIStore } from '@/store/uiStore'

const PLACEHOLDER = [
  { t: 'Just now', c: 'Activity', msg: 'Open a canvas to start tracking runs.', kind: 'info' as const },
]

const DOT_COLORS = {
  ok:    'var(--success)',
  err:   'var(--danger)',
  info:  'var(--info)',
  pixie: 'var(--mint-2)',
}

export function ActivityFeed() {
  const cloak = useUIStore(s => s.cloak)

  return (
    <div style={{
      width: 320, flexShrink: 0, background: 'var(--bg-1)',
      borderLeft: '1px solid var(--border-1)',
      display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-1)' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600 }}>Activity</div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)',
          marginTop: 1, letterSpacing: '.14em', textTransform: 'uppercase',
        }}>
          LAST 24H
        </div>
      </div>
      <div className="scroll" style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {PLACEHOLDER.map((a) => (
          <div key={`${a.t}-${a.c}`} style={{
            padding: '10px 8px', borderRadius: 6, display: 'flex', gap: 10,
            alignItems: 'flex-start', borderBottom: '1px solid var(--border-1)',
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0,
              background: DOT_COLORS[a.kind],
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.4 }}>{a.msg}</div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)',
                marginTop: 4, letterSpacing: '.1em', textTransform: 'uppercase',
              }}>
                {a.t} · {a.c.toUpperCase()}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{
        borderTop: '1px solid var(--border-1)', padding: 14,
        display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-0)',
      }}>
        <Pixie pose="idle" size={48} cloak={cloak} />
        <div>
          <div className="t-pixel" style={{ color: 'var(--mint-2)' }}>PIXIE · ONLINE</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.4 }}>
            Open a canvas — I'll meet you there.
          </div>
        </div>
      </div>
    </div>
  )
}
