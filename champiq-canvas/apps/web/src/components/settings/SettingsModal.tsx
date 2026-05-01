import { useState } from 'react'
import { useUIStore } from '@/store/uiStore'
import { Pixie, PixieOnlinePill } from '@/components/pixie/Pixie'
import { X, Key, Palette, User, Plus } from 'lucide-react'
import type { AccentPreset, VoicePreset, CloakColor } from '@/store/uiStore'

interface Props {
  open: boolean
  onClose: () => void
  pixieCloak: string
  voice: VoicePreset
}

const TABS = [
  { id: 'credentials', label: 'Credentials', icon: <Key size={14} /> },
  { id: 'theme',       label: 'Theme',       icon: <Palette size={14} /> },
  { id: 'account',     label: 'Account',     icon: <User size={14} /> },
] as const

type Tab = typeof TABS[number]['id']

export function SettingsModal({ open, onClose, pixieCloak, voice }: Props) {
  const { accent } = useUIStore()
  const [tab, setTab] = useState<Tab>('credentials')

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(7,9,18,.8)', backdropFilter: 'blur(6px)',
        display: 'grid', placeItems: 'center',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        data-accent={accent}
        style={{
          width: 900, height: 660,
          background: 'var(--bg-1)',
          border: '1px solid var(--border-1)',
          borderRadius: 16,
          display: 'flex',
          overflow: 'hidden',
          boxShadow: '0 28px 90px rgba(0,0,0,.7)',
          animation: 'bubble-in 220ms var(--ease-spring) both',
        }}
      >
        {/* Sidebar */}
        <div style={{
          width: 220, flexShrink: 0,
          background: 'var(--bg-0)',
          borderRight: '1px solid var(--border-1)',
          padding: '18px 12px',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700,
            color: 'var(--text-1)', marginBottom: 18, padding: '0 6px',
          }}>Settings</div>

          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 10px', marginBottom: 2, borderRadius: 8,
              background: tab === t.id ? 'rgba(var(--accent-2-rgb),.12)' : 'transparent',
              border: tab === t.id ? '1px solid rgba(var(--accent-2-rgb),.25)' : '1px solid transparent',
              color: tab === t.id ? 'var(--accent-1)' : 'var(--text-3)',
              fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', textAlign: 'left',
            }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 28, position: 'relative' }}>
          <button onClick={onClose} style={{
            position: 'absolute', top: 16, right: 16,
            width: 30, height: 30, display: 'grid', placeItems: 'center',
            background: 'var(--bg-2)', border: '1px solid var(--border-1)',
            borderRadius: 8, color: 'var(--text-3)', cursor: 'pointer',
          }}><X size={15}/></button>

          {tab === 'credentials' && <CredentialsTab />}
          {tab === 'theme'       && <ThemeTab />}
          {tab === 'account'     && <AccountTab pixieCloak={pixieCloak} voice={voice} />}
        </div>
      </div>
    </div>
  )
}

// ── Credentials tab ────────────────────────────────────────────────────────

function CredentialsTab() {
  const creds = [
    { name: 'ChampMail · prod',   type: 'champmail',  meta: 'Last used 2m ago',       status: 'connected' },
    { name: 'ChampMail · staging',type: 'champmail',  meta: 'Last used 4d ago',       status: 'connected' },
    { name: 'ChampGraph · main',  type: 'champgraph', meta: '4 stages bound',         status: 'connected' },
    { name: 'OpenAI',             type: 'llm',        meta: 'gpt-4o · 12k req/mo',   status: 'connected' },
    { name: 'LakeB2B Pulse',      type: 'data',       meta: 'Token expired Apr 28',  status: 'expired' },
  ]
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.01em' }}>
            Credentials
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-3)' }}>
            API tokens and service keys bound to your stages.
          </p>
        </div>
        <button style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '7px 14px', borderRadius: 8,
          background: 'linear-gradient(180deg, var(--accent-2), var(--accent-3))',
          border: '1px solid var(--accent-3)',
          color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13,
          cursor: 'pointer',
        }}>
          <Plus size={14} /> Add credential
        </button>
      </div>

      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 10, overflow: 'hidden' }}>
        {creds.map((c, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '14px 16px',
            borderBottom: i < creds.length - 1 ? '1px solid var(--border-1)' : 'none',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, background: 'var(--bg-3)',
              display: 'grid', placeItems: 'center',
              color: c.status === 'expired' ? 'var(--danger)' : 'var(--accent-1)',
            }}>
              <Key size={14}/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: 'var(--text-1)' }}>{c.name}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-4)', marginTop: 1 }}>{c.type} · {c.meta}</div>
            </div>
            <CredPill status={c.status} />
            <button style={{
              padding: '4px 10px', background: 'var(--bg-3)', border: '1px solid var(--border-1)',
              borderRadius: 6, color: 'var(--text-2)', fontSize: 12,
              fontFamily: 'var(--font-display)', fontWeight: 500, cursor: 'pointer',
            }}>Edit</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function CredPill({ status }: { status: string }) {
  const isExpired = status === 'expired'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 8px', borderRadius: 4,
      fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase',
      background: isExpired ? 'rgba(255,77,109,.1)' : 'rgba(74,222,128,.1)',
      color: isExpired ? 'var(--danger)' : 'var(--success)',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }}/>
      {isExpired ? 'Expired' : 'Connected'}
    </span>
  )
}

// ── Theme tab ──────────────────────────────────────────────────────────────

function ThemeTab() {
  const { accent, setAccent } = useUIStore()
  const accents: [AccentPreset, string][] = [
    ['violet', '#7C5CFF'], ['mint', '#00E5C7'],
    ['coral', '#FF7A59'],  ['sun', '#FFC23F'], ['sky', '#5BC0FF'],
  ]
  return (
    <div>
      <h3 style={{ margin: '0 0 4px', fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.01em' }}>
        Theme
      </h3>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text-3)' }}>Surface mode and accent color.</p>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 10 }}>
        Surface
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 28 }}>
        {['Dark', 'Light'].map((m) => (
          <div key={m} style={{
            padding: '10px 16px', width: 140, borderRadius: 10,
            background: 'var(--bg-2)',
            border: m === 'Dark' ? '1px solid var(--accent-2)' : '1px solid var(--border-1)',
            display: 'flex', alignItems: 'center', gap: 10,
            color: m === 'Dark' ? 'var(--text-1)' : 'var(--text-4)',
            cursor: 'pointer',
          }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600 }}>{m}</span>
            {m === 'Dark' && <span style={{ marginLeft: 'auto', color: 'var(--accent-2)', fontSize: 10 }}>✓</span>}
          </div>
        ))}
      </div>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 10 }}>
        Accent
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {accents.map(([id, hex]) => (
          <button key={id} onClick={() => setAccent(id)} style={{
            padding: 10, width: 120, background: 'var(--bg-2)',
            border: accent === id ? `1px solid ${hex}` : '1px solid var(--border-1)',
            borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 8,
            cursor: 'pointer',
          }}>
            <div style={{ width: '100%', height: 36, background: hex, borderRadius: 6 }}/>
            <span style={{
              fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600,
              color: accent === id ? hex : 'var(--text-2)',
              textTransform: 'capitalize',
            }}>{id}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Account tab (Pixie merged in) ──────────────────────────────────────────

function AccountTab({ pixieCloak, voice }: { pixieCloak: string; voice: VoicePreset }) {
  const { setCloak, setVoice } = useUIStore()
  const VOICES: { id: VoicePreset; desc: string }[] = [
    { id: 'Friendly', desc: 'Short. Honest. No filler.' },
    { id: 'Crisp',    desc: 'One-line answers only.' },
    { id: 'Quirky',   desc: 'Playful with pixel emoji.' },
    { id: 'Pro',      desc: 'Stakeholder-safe tone.' },
  ]
  const CLOAKS: [string, CloakColor][] = [
    ['Emerald', '#0EA968'], ['Magenta', '#E63A87'],
    ['Cobalt',  '#1E5FCB'], ['Charcoal', '#2A2F44'],
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h3 style={{ margin: '0 0 4px', fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.01em' }}>
          Account
        </h3>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)' }}>Profile, workspace, and your Pixie.</p>
      </div>

      {/* Profile */}
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 24, background: 'var(--accent-2)',
          display: 'grid', placeItems: 'center', color: '#fff',
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, flexShrink: 0,
        }}>D</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--text-1)' }}>Deep Patel</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>deep@championsmail.com</div>
        </div>
        <button style={{ padding: '5px 12px', background: 'var(--bg-3)', border: '1px solid var(--border-1)', borderRadius: 7, color: 'var(--text-2)', fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 500, cursor: 'pointer' }}>
          Sign out
        </button>
      </div>

      {/* Workspace */}
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: 18 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 10 }}>
          Workspace
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: 'var(--text-1)' }}>Champions Lab</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Pro plan · 4 seats · renews Jul 14</div>
          </div>
          <button style={{ padding: '5px 12px', background: 'var(--bg-3)', border: '1px solid var(--border-1)', borderRadius: 7, color: 'var(--text-2)', fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 500, cursor: 'pointer' }}>
            Manage
          </button>
        </div>
      </div>

      {/* Pixie section */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(var(--accent-2-rgb),.14)', display: 'grid', placeItems: 'center' }}>
            <span style={{ color: 'var(--accent-2)', fontSize: 12 }}>✦</span>
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>
            Your Pixie
          </span>
        </div>

        <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: 20, display: 'grid', gridTemplateColumns: '130px 1fr', gap: 20 }}>
          {/* Preview */}
          <div style={{ background: 'var(--bg-0)', borderRadius: 12, padding: 14, display: 'grid', placeItems: 'center', position: 'relative' }}>
            <Pixie pose="idle" size={88} cloak={pixieCloak} />
            <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)' }}>
              <PixieOnlinePill />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Cloak */}
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 8 }}>
                Cloak color
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {CLOAKS.map(([name, hex]) => (
                  <button key={hex} onClick={() => setCloak(hex)} style={{
                    padding: 5, cursor: 'pointer',
                    background: pixieCloak === hex ? 'rgba(var(--accent-2-rgb),.14)' : 'transparent',
                    border: pixieCloak === hex ? '1px solid rgba(var(--accent-2-rgb),.4)' : '1px solid transparent',
                    borderRadius: 8,
                  }}>
                    <div style={{ width: 32, height: 32, background: hex, borderRadius: 7, border: '2px solid var(--bg-1)' }}/>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)', textAlign: 'center', marginTop: 4 }}>{name}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Voice */}
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 8 }}>
                Voice
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                {VOICES.map((v) => (
                  <button key={v.id} onClick={() => setVoice(v.id)} style={{
                    padding: '8px 10px', cursor: 'pointer', textAlign: 'left',
                    background: voice === v.id ? 'rgba(var(--accent-2-rgb),.10)' : 'var(--bg-3)',
                    border: voice === v.id ? '1px solid rgba(var(--accent-2-rgb),.35)' : '1px solid var(--border-1)',
                    borderRadius: 8,
                  }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600, color: voice === v.id ? 'var(--accent-1)' : 'var(--text-1)', marginBottom: 2 }}>{v.id}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-4)', lineHeight: 1.3 }}>{v.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
