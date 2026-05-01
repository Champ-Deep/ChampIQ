import { useState } from 'react'
import { Pixie } from '@/components/pixie/Pixie'
import { Mail, TrendingUp, Send, ArrowUpRight, Clock, CheckCircle, AlertCircle, Plus } from 'lucide-react'

interface Props {
  pixieCloak: string
}

const SEQUENCES = [
  { id: 1, name: 'Cold Outbound · Q2 SaaS', status: 'active', sent: 312, opens: '42%', replies: '11%', lastRun: '2h ago' },
  { id: 2, name: 'Follow-up · SDR Wave 1', status: 'active', sent: 87, opens: '38%', replies: '8%', lastRun: '1d ago' },
  { id: 3, name: 'Re-engage · Stale 60d',  status: 'paused', sent: 54, opens: '26%', replies: '4%', lastRun: '5d ago' },
  { id: 4, name: 'Partner Intro · Warm',   status: 'draft',  sent: 0,  opens: '—',   replies: '—', lastRun: 'Never' },
]

const SENT_EMAILS = [
  { to: 'alex@acme.io',       subject: 'Quick question, Alex', status: 'replied',  when: '30m ago' },
  { to: 'priya@scale.com',    subject: 'Saw your Series B post', status: 'opened', when: '2h ago' },
  { to: 'marcus@stripe.com',  subject: 'ChampIQ → Stripe fit', status: 'sent',    when: '3h ago' },
  { to: 'jen@hubspot.com',    subject: 'Quick question, Jen',  status: 'bounced', when: '4h ago' },
  { to: 'carlos@notion.com',  subject: 'Notion + ChampIQ?',   status: 'opened',  when: '1d ago' },
]

const STATUS_PILL: Record<string, { bg: string; color: string; label: string }> = {
  active:  { bg: 'rgba(74,222,128,.12)', color: 'var(--success)', label: 'Active' },
  paused:  { bg: 'rgba(255,210,63,.1)', color: 'var(--warn)',    label: 'Paused' },
  draft:   { bg: 'rgba(123,134,166,.12)', color: 'var(--text-3)', label: 'Draft' },
  replied: { bg: 'rgba(74,222,128,.12)', color: 'var(--success)', label: 'Replied' },
  opened:  { bg: 'rgba(91,192,255,.12)', color: 'var(--info)',    label: 'Opened' },
  sent:    { bg: 'rgba(123,134,166,.1)', color: 'var(--text-3)',  label: 'Sent' },
  bounced: { bg: 'rgba(255,77,109,.1)', color: 'var(--danger)',  label: 'Bounced' },
}

function Pill({ status }: { status: string }) {
  const s = STATUS_PILL[status] || STATUS_PILL.sent
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 4,
      fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase',
      background: s.bg, color: s.color,
    }}>{s.label}</span>
  )
}

export function ChampMailRailPanel({ pixieCloak }: Props) {
  const [tab, setTab] = useState<'sequences' | 'sent' | 'analytics'>('sequences')

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
            background: 'rgba(34,197,94,.12)',
            border: '1px solid rgba(34,197,94,.25)',
            display: 'grid', placeItems: 'center', color: '#22C55E',
          }}>
            <Mail size={18} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.015em' }}>
              ChampMail
            </h2>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>
              Email sequences · 4 active campaigns
            </div>
          </div>

          {/* Pixie */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              background: 'rgba(var(--accent-2-rgb),.08)',
              border: '1px solid rgba(var(--accent-2-rgb),.2)',
              borderRadius: 10, padding: '8px 14px',
              display: 'flex', alignItems: 'center', gap: 10,
              fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--text-2)',
              maxWidth: 280,
            }}>
              <Pixie pose="read" size={44} cloak={pixieCloak} />
              <span>"42% open rate on Q2 — 10% above benchmark. Keep subject lines under 38 chars."</span>
            </div>
          </div>

          <button style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 8,
            background: 'linear-gradient(180deg, var(--accent-2), var(--accent-3))',
            border: '1px solid var(--accent-3)',
            color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13,
            cursor: 'pointer',
          }}>
            <Plus size={14} /> New Sequence
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2 }}>
          {(['sequences', 'sent', 'analytics'] as const).map((t) => (
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {SEQUENCES.map((seq) => (
              <div key={seq.id} style={{
                background: 'var(--bg-1)', border: '1px solid var(--border-1)',
                borderRadius: 10, padding: '14px 18px',
                display: 'flex', alignItems: 'center', gap: 16,
                transition: 'border-color .15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-2)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-1)')}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: 'var(--text-1)', marginBottom: 3 }}>
                    {seq.name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--text-3)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Send size={10}/> {seq.sent} sent</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={10}/> {seq.lastRun}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                  <Stat label="Opens" value={seq.opens} />
                  <Stat label="Replies" value={seq.replies} accent />
                  <Pill status={seq.status} />
                  <button style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px',
                    background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 6,
                    color: 'var(--text-2)', fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 500,
                    cursor: 'pointer',
                  }}>
                    Open <ArrowUpRight size={11}/>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'sent' && (
          <div style={{ background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 10, overflow: 'hidden' }}>
            {SENT_EMAILS.map((email, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px',
                borderBottom: i < SENT_EMAILS.length - 1 ? '1px solid var(--border-1)' : 'none',
              }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg-2)', display: 'grid', placeItems: 'center', color: 'var(--accent-2)', flexShrink: 0 }}>
                  <Mail size={14}/>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>{email.subject}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>To: {email.to}</div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'var(--font-mono)' }}>{email.when}</div>
                <Pill status={email.status}/>
              </div>
            ))}
          </div>
        )}

        {tab === 'analytics' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[
              { label: 'Emails Sent',    value: '453',  icon: <Send size={16}/>,       color: 'var(--info)' },
              { label: 'Open Rate',      value: '42%',  icon: <TrendingUp size={16}/>, color: 'var(--success)' },
              { label: 'Reply Rate',     value: '11%',  icon: <CheckCircle size={16}/>,color: 'var(--accent-2)' },
              { label: 'Bounces',        value: '2.1%', icon: <AlertCircle size={16}/>,color: 'var(--danger)' },
            ].map((m) => (
              <div key={m.label} style={{
                background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 10,
                padding: '18px 20px',
              }}>
                <div style={{ color: m.color, marginBottom: 10 }}>{m.icon}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.02em' }}>{m.value}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-4)', marginTop: 4 }}>{m.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: accent ? 'var(--accent-1)' : 'var(--text-1)' }}>
        {value}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-4)' }}>
        {label}
      </div>
    </div>
  )
}
