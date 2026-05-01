import { useState } from 'react'
import { Pixie } from '@/components/pixie/Pixie'
import { Network, TrendingUp, Building2, Zap, ArrowUpRight } from 'lucide-react'

interface Props {
  pixieCloak: string
}

const PROSPECTS = [
  { name: 'Alex Chen',    company: 'Acme Corp',    title: 'VP Sales',         score: 92, signals: ['intent', 'funded'], status: 'hot' },
  { name: 'Priya Nair',   company: 'Scale.ai',     title: 'Head of RevOps',   score: 84, signals: ['intent'],           status: 'warm' },
  { name: 'Marcus Kim',   company: 'Stripe',        title: 'Sales Engineer',   score: 77, signals: ['seniority'],        status: 'warm' },
  { name: 'Jen Walsh',    company: 'HubSpot',       title: 'Director, Growth', score: 65, signals: ['funded'],           status: 'cool' },
  { name: 'Carlos Vega',  company: 'Notion',        title: 'Ops Lead',         score: 58, signals: ['seniority'],        status: 'cool' },
]

const SIGNALS = [
  { icon: <TrendingUp size={14} />, label: 'Acme Corp raised $40M Series B', when: '1h ago', type: 'funding' },
  { icon: <Zap size={14} />,        label: 'Alex Chen viewed pricing page 3×', when: '2h ago', type: 'intent' },
  { icon: <Building2 size={14} />,  label: 'Scale.ai posted 12 new sales roles', when: '4h ago', type: 'hiring' },
  { icon: <TrendingUp size={14} />, label: 'Stripe Q1 revenue up 28%', when: '1d ago', type: 'funding' },
  { icon: <Zap size={14} />,        label: 'Priya Nair changed title to Head of RevOps', when: '2d ago', type: 'seniority' },
]

const SIGNAL_COLORS: Record<string, string> = {
  funding:   '#A589FF',
  intent:    '#00E5C7',
  hiring:    '#FFC23F',
  seniority: '#5BC0FF',
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? 'var(--success)' : score >= 60 ? 'var(--warn)' : 'var(--danger)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 60, height: 4, background: 'var(--bg-3)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 2 }}/>
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color, fontWeight: 600 }}>{score}</span>
    </div>
  )
}

function SignalBadge({ signal }: { signal: string }) {
  const colors: Record<string, string> = {
    intent:    'rgba(0,229,199,.12)',
    funded:    'rgba(165,137,255,.12)',
    seniority: 'rgba(91,192,255,.12)',
  }
  const textColors: Record<string, string> = {
    intent:    '#00E5C7',
    funded:    '#A589FF',
    seniority: '#5BC0FF',
  }
  return (
    <span style={{
      display: 'inline-block', padding: '2px 7px', borderRadius: 4,
      fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase',
      background: colors[signal] || 'var(--bg-2)', color: textColors[signal] || 'var(--text-3)',
    }}>{signal}</span>
  )
}

export function ChampGraphRailPanel({ pixieCloak }: Props) {
  const [tab, setTab] = useState<'prospects' | 'signals' | 'companies'>('prospects')

  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'var(--bg-0)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--font-body)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        flexShrink: 0,
        background: 'var(--bg-1)',
        borderBottom: '1px solid var(--border-1)',
        padding: '16px 24px 0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'rgba(59,130,246,.12)',
            border: '1px solid rgba(59,130,246,.25)',
            display: 'grid', placeItems: 'center', color: '#3B82F6',
          }}>
            <Network size={18} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.015em' }}>
              ChampGraph
            </h2>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>
              Prospect intelligence · 5 live signals
            </div>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              background: 'rgba(var(--accent-2-rgb),.08)',
              border: '1px solid rgba(var(--accent-2-rgb),.2)',
              borderRadius: 10, padding: '8px 14px',
              display: 'flex', alignItems: 'center', gap: 10,
              fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--text-2)',
              maxWidth: 280,
            }}>
              <Pixie pose="point" size={44} cloak={pixieCloak} />
              <span>"Acme Corp just closed $40M — Alex Chen is a 92/100. Strike now."</span>
            </div>
          </div>
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
        {tab === 'prospects' && (
          <div style={{ background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 10, overflow: 'hidden' }}>
            {/* Table header */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 120px 100px 100px 80px',
              padding: '8px 18px', borderBottom: '1px solid var(--border-1)',
              fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-4)',
            }}>
              <span>Prospect</span><span>Company</span><span>Score</span><span>Signals</span><span>Status</span><span/>
            </div>
            {PROSPECTS.map((p, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 120px 100px 100px 80px',
                padding: '12px 18px', alignItems: 'center',
                borderBottom: i < PROSPECTS.length - 1 ? '1px solid var(--border-1)' : 'none',
                transition: 'background .12s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.title}</div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{p.company}</div>
                <ScoreBar score={p.score}/>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {p.signals.map((s) => <SignalBadge key={s} signal={s}/>)}
                </div>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 8px', borderRadius: 4,
                  fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase',
                  background: p.status === 'hot' ? 'rgba(255,77,109,.1)' : p.status === 'warm' ? 'rgba(255,210,63,.1)' : 'rgba(123,134,166,.1)',
                  color: p.status === 'hot' ? 'var(--danger)' : p.status === 'warm' ? 'var(--warn)' : 'var(--text-3)',
                }}>{p.status}</span>
                <button style={{
                  display: 'flex', alignItems: 'center', gap: 3, padding: '4px 8px',
                  background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 6,
                  color: 'var(--text-3)', fontSize: 11, cursor: 'pointer',
                }}>
                  View <ArrowUpRight size={10}/>
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === 'signals' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {SIGNALS.map((s, i) => (
              <div key={i} style={{
                background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 10,
                padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: `${SIGNAL_COLORS[s.type] || '#7B86A6'}18`,
                  border: `1px solid ${SIGNAL_COLORS[s.type] || '#7B86A6'}30`,
                  display: 'grid', placeItems: 'center',
                  color: SIGNAL_COLORS[s.type] || 'var(--text-3)',
                }}>
                  {s.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 13, color: 'var(--text-1)' }}>{s.label}</div>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-4)' }}>{s.when}</div>
              </div>
            ))}
          </div>
        )}

        {tab === 'companies' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {['Acme Corp', 'Scale.ai', 'Stripe', 'HubSpot', 'Notion', 'Linear'].map((co) => (
              <div key={co} style={{
                background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 10,
                padding: '16px 18px', cursor: 'pointer',
                transition: 'border-color .15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-2)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-1)')}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 8, background: 'var(--bg-2)',
                  display: 'grid', placeItems: 'center', marginBottom: 10, color: 'var(--accent-2)',
                }}>
                  <Building2 size={16}/>
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: 'var(--text-1)' }}>{co}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>2–4 prospects · 1 signal</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
