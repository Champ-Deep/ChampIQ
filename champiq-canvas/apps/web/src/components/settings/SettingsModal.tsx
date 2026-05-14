import { useState, useEffect, useRef } from 'react'
import { useUIStore } from '@/store/uiStore'
import { Pixie, PixieOnlinePill } from '@/components/pixie/Pixie'
import { X, Key, Palette, User, Plus, Moon, Sun, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import type { AccentPreset, VoicePreset, CloakColor } from '@/store/uiStore'
import { useCredentialStore, CREDENTIAL_TYPES, CREDENTIAL_TYPE_FIELDS, CREDENTIAL_REQUIRED_FIELDS } from '@/store/credentialStore'
import type { CredentialType } from '@/store/credentialStore'
import type { Credential as ApiCredential } from '@/lib/api/types'

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

const CREDENTIAL_TYPE_LABELS: Record<CredentialType, string> = {
  champmail:  'ChampMail (Emelia)',
  champgraph: 'ChampGraph',
  champvoice: 'ChampVoice (ElevenLabs)',
  lakeb2b:    'LakeB2B Pulse',
  http:       'HTTP / Bearer',
  generic:    'Generic Secret',
}

function CredentialsTab() {
  const [creds, setCreds] = useState<ApiCredential[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<CredentialType>('champmail')
  const [newFields, setNewFields] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [addError, setAddError] = useState('')

  useEffect(() => {
    api.listCredentials().then((list) => {
      setCreds(list)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  function handleTypeChange(t: CredentialType) {
    setNewType(t)
    setNewFields({})
    setAddError('')
  }

  async function handleAdd() {
    if (!newName.trim()) { setAddError('Name is required'); return }
    const required = CREDENTIAL_REQUIRED_FIELDS[newType] ?? []
    const fieldDefs = CREDENTIAL_TYPE_FIELDS[newType]
    const missing = required.filter((k) => !newFields[k]?.trim())
    if (missing.length > 0) {
      const labels = missing.map((k) => fieldDefs.find((f) => f.key === k)?.label ?? k)
      setAddError(`Required: ${labels.join(', ')}`)
      return
    }
    setSaving(true)
    setAddError('')
    try {
      const created = await api.createCredential(newName.trim(), newType, newFields)
      setCreds((prev) => [...prev, created])
      useCredentialStore.getState().addCredential(newName.trim(), newType, newFields)
      setNewName(''); setNewType('champmail'); setNewFields({}); setShowAdd(false)
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Remove this credential?')) return
    try {
      const target = creds.find((c) => c.id === id)
      await api.deleteCredential(id)
      setCreds((prev) => prev.filter((c) => c.id !== id))
      if (target) {
        const localCred = useCredentialStore.getState().getByName(target.name)
        if (localCred) useCredentialStore.getState().deleteCredential(localCred.id)
      }
    } catch { /* noop */ }
  }

  const fieldDefs = CREDENTIAL_TYPE_FIELDS[newType]
  const isLakeB2BWizard = newType === 'lakeb2b'

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.01em' }}>
            Credentials
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-3)' }}>
            API tokens and service keys bound to your canvases.
          </p>
        </div>
        <button
          onClick={() => { setShowAdd((v) => !v); setAddError('') }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 8,
            background: 'linear-gradient(180deg, var(--accent-2), var(--accent-3))',
            border: '1px solid var(--accent-3)',
            color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13,
            cursor: 'pointer',
          }}
        >
          <Plus size={14} /> Add credential
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ background: 'var(--bg-2)', border: '1px solid rgba(var(--accent-2-rgb),.3)', borderRadius: 10, padding: 16, marginBottom: 16, animation: 'bubble-in 160ms var(--ease-spring)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SettingsField label="Name">
              <input value={newName} onChange={(e) => { setNewName(e.target.value); setAddError('') }} placeholder="e.g. champmail-prod" style={fieldInputStyle} />
            </SettingsField>
            <SettingsField label="Type">
              <select value={newType} onChange={(e) => handleTypeChange(e.target.value as CredentialType)} style={fieldInputStyle}>
                {CREDENTIAL_TYPES.map((t) => (
                  <option key={t} value={t}>{CREDENTIAL_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </SettingsField>

            {newType === 'champmail' ? (
              <EmeliaWizard
                onSave={(name, fields) => {
                  api.createCredential(name, 'champmail', fields)
                    .then((c) => {
                      setCreds((p) => [...p, c])
                      useCredentialStore.getState().addCredential(name, 'champmail', fields)
                      setShowAdd(false)
                    })
                    .catch((e) => setAddError(e instanceof Error ? e.message : 'Failed to save'))
                }}
              />
            ) : isLakeB2BWizard ? (
              <LakeB2BWizard
                onDone={(credId, name) => {
                  api.listCredentials().then(setCreds).catch(() => {})
                  useCredentialStore.getState().addCredential(name, 'lakeb2b', { credential_id: String(credId) })
                  setShowAdd(false)
                }}
              />
            ) : (
              fieldDefs.map((f) => {
                const isRequired = (CREDENTIAL_REQUIRED_FIELDS[newType] ?? []).includes(f.key)
                return (
                  <SettingsField key={f.key} label={f.label} required={isRequired}>
                    <input
                      type={f.secret ? 'password' : 'text'}
                      value={newFields[f.key] ?? ''}
                      onChange={(e) => setNewFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder={f.secret ? '••••••••••••' : ''}
                      style={{ ...fieldInputStyle, fontFamily: f.secret ? 'var(--font-mono)' : 'var(--font-body)' }}
                    />
                  </SettingsField>
                )
              })
            )}

            {addError && <p style={{ margin: 0, fontSize: 12, color: '#f87171' }}>{addError}</p>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAdd(false)} style={ghostSmStyle}>Cancel</button>
              {newType !== 'champmail' && !isLakeB2BWizard && (
                <button onClick={handleAdd} disabled={saving || !newName.trim()} style={primarySmStyle}>
                  {saving ? 'Saving…' : 'Save credential'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 10, overflow: 'hidden' }}>
        {loading && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>Loading…</div>
        )}
        {!loading && creds.length === 0 && !showAdd && (
          <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>
            No credentials yet. Add one to connect your canvases.
          </div>
        )}
        {creds.map((c, i) => (
          <div key={c.id} style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '14px 16px',
            borderBottom: i < creds.length - 1 ? '1px solid var(--border-1)' : 'none',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, background: 'var(--bg-3)',
              display: 'grid', placeItems: 'center',
              color: c.active !== false ? 'var(--accent-1)' : 'var(--danger)',
            }}>
              <Key size={14}/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: 'var(--text-1)' }}>{c.name}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-4)', marginTop: 1 }}>{c.type}</div>
            </div>
            <CredPill status={c.active !== false ? 'connected' : 'expired'} />
            <button
              onClick={() => handleDelete(c.id)}
              style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none', color: 'var(--text-4)', cursor: 'pointer', borderRadius: 5, transition: 'all .15s' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'rgba(255,77,109,.08)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-4)'; e.currentTarget.style.background = 'transparent' }}
            >
              <Trash2 size={13} />
            </button>
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
  const { accent, setAccent, isDark, setIsDark } = useUIStore()
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
        {([['Dark', true], ['Light', false]] as [string, boolean][]).map(([label, dark]) => (
          <button key={label} onClick={() => setIsDark(dark)} style={{
            padding: '10px 16px', width: 160, borderRadius: 10, cursor: 'pointer',
            background: 'var(--bg-2)',
            border: isDark === dark ? '1px solid var(--accent-2)' : '1px solid var(--border-1)',
            display: 'flex', alignItems: 'center', gap: 10,
            color: 'var(--text-1)',
          }}>
            {dark ? <Moon size={14} /> : <Sun size={14} />}
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600 }}>{label}</span>
            {isDark === dark && <span style={{ marginLeft: 'auto', color: 'var(--accent-2)' }}>✓</span>}
          </button>
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
            <div style={{ width: '100%', height: 40, background: hex, borderRadius: 6 }}/>
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
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--text-1)' }}>Deep</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>deep@championsmail.com</div>
        </div>
        <button
          onClick={() => {
            if (!confirm('Sign out? Your canvases and settings will remain saved locally.')) return
            localStorage.clear()
            sessionStorage.clear()
            window.location.reload()
          }}
          style={{ padding: '5px 12px', background: 'var(--bg-3)', border: '1px solid var(--border-1)', borderRadius: 7, color: 'var(--text-2)', fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 500, cursor: 'pointer' }}
        >
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
                    width: 50, padding: '5px 0', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    background: pixieCloak === hex ? 'rgba(var(--accent-2-rgb),.14)' : 'transparent',
                    border: pixieCloak === hex ? '1px solid rgba(var(--accent-2-rgb),.4)' : '1px solid transparent',
                    borderRadius: 8,
                  }}>
                    <div style={{ width: 32, height: 32, background: hex, borderRadius: 7, border: '2px solid var(--bg-1)' }}/>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)' }}>{name}</div>
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

// ── LakeB2B inline wizard ──────────────────────────────────────────────────

function LakeB2BWizard({ onDone }: { onDone: (credId: number, name: string) => void }) {
  const [step, setStep] = useState<'oauth' | 'linkedin' | 'done'>('oauth')
  const [credName, setCredName] = useState('lakeb2b-pulse')
  const [credentialId, setCredentialId] = useState<number | null>(null)
  const [resolvedName, setResolvedName] = useState('lakeb2b-pulse')
  const [oauthLoading, setOauthLoading] = useState(false)
  const [oauthError, setOauthError] = useState('')

  const [linkedinTab, setLinkedinTab] = useState<'server' | 'extension'>('server')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [twoFaCode, setTwoFaCode] = useState('')
  const [needsTwoFa, setNeedsTwoFa] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')

  const linkedinConnectedRef = useRef(false)
  const credentialIdRef = useRef<number | null>(null)
  const resolvedNameRef = useRef('lakeb2b-pulse')

  // Listen for messages from the OAuth popup and the browser extension
  useEffect(() => {
    let authTokenTimer: ReturnType<typeof setTimeout> | null = null

    async function handleMsg(e: MessageEvent) {
      if (!e.data?.type) return

      if (e.data.type === 'LAKEB2B_AUTH_SUCCESS') {
        if (authTokenTimer) { clearTimeout(authTokenTimer); authTokenTimer = null }
        const id = e.data.credential_id as number
        const name = (e.data.name as string) || resolvedNameRef.current
        credentialIdRef.current = id
        resolvedNameRef.current = name
        setCredentialId(id)
        setResolvedName(name)
        setOauthLoading(false)
        if (linkedinConnectedRef.current) {
          setStep('done')
          onDone(id, name)
        } else {
          setStep('linkedin')
        }
      } else if (e.data.type === 'LAKEB2B_AUTH_ERROR') {
        setOauthError(e.data.error || 'LinkedIn OAuth failed')
        setOauthLoading(false)
      } else if (e.data.type === 'LAKEB2B_AUTH_TOKEN') {
        // Extension intercepted the popup and already captured li_at
        linkedinConnectedRef.current = true
        // If AUTH_SUCCESS doesn't arrive in 2s (popup closed by extension before HTML ran),
        // refresh the credentials list to find the newly created record
        authTokenTimer = setTimeout(async () => {
          if (credentialIdRef.current !== null) return
          try {
            const list = await api.listCredentials()
            const found = list.filter((c) => c.type === 'lakeb2b').at(-1)
            if (found) {
              credentialIdRef.current = found.id
              setCredentialId(found.id)
              setResolvedName(found.name)
              setOauthLoading(false)
              setStep('done')
              onDone(found.id, found.name)
            }
          } catch { /* noop */ }
        }, 2000)
      } else if (e.data.type === 'LAKEB2B_PAIR_RESULT') {
        setLoginLoading(false)
        if (e.data.success) {
          linkedinConnectedRef.current = true
          if (credentialIdRef.current !== null) {
            setStep('done')
            onDone(credentialIdRef.current, resolvedNameRef.current)
          }
        } else {
          setLoginError(e.data.error || 'Extension pairing failed — make sure you are logged into LinkedIn in Chrome')
        }
      }
    }

    window.addEventListener('message', handleMsg)
    return () => {
      window.removeEventListener('message', handleMsg)
      if (authTokenTimer) clearTimeout(authTokenTimer)
    }
  }, [onDone])

  async function handleOAuth() {
    if (!credName.trim()) { setOauthError('Name is required'); return }
    resolvedNameRef.current = credName.trim()
    setOauthLoading(true)
    setOauthError('')
    try {
      const res = await fetch(`/api/auth/lakeb2b/oauth-url?name=${encodeURIComponent(credName.trim())}&base_url=${encodeURIComponent(window.location.origin)}`)
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json() as { auth_url: string }
      const popup = window.open(data.auth_url, 'lakeb2b-oauth', 'width=600,height=700,left=200,top=100')
      if (!popup) { setOauthError('Popup blocked — allow popups for this site and try again'); setOauthLoading(false); return }
      // Detect if user closed popup without completing
      const poll = setInterval(() => {
        if (popup.closed) {
          clearInterval(poll)
          setOauthLoading((cur) => {
            if (cur) setOauthError('LinkedIn login was cancelled — try again')
            return false
          })
        }
      }, 800)
    } catch (e) {
      setOauthError(e instanceof Error ? e.message : 'Failed to start OAuth')
      setOauthLoading(false)
    }
  }

  async function handleServerLogin() {
    const id = credentialIdRef.current
    if (!id) return
    if (!email.trim() || !password) { setLoginError('Email and password are required'); return }
    setLoginLoading(true)
    setLoginError('')
    try {
      const res = await fetch('/api/auth/lakeb2b/linkedin-login-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential_id: id, email: email.trim(), password }),
      })
      const data = await res.json() as { status?: string; session_id?: string; message?: string; detail?: string }
      if (!res.ok) throw new Error(data.detail || `Error ${res.status}`)
      if (data.status === 'success') {
        linkedinConnectedRef.current = true
        setStep('done')
        onDone(id, resolvedNameRef.current)
      } else if (data.status === 'needs_2fa') {
        setSessionId(data.session_id ?? '')
        setNeedsTwoFa(true)
      } else {
        setLoginError(data.message || 'Login failed — check your LinkedIn credentials')
      }
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : 'Login failed')
    } finally {
      setLoginLoading(false)
    }
  }

  async function handleVerify2FA() {
    const id = credentialIdRef.current
    if (!id || !sessionId) return
    if (!twoFaCode.trim()) { setLoginError('Enter the verification code'); return }
    setLoginLoading(true)
    setLoginError('')
    try {
      const res = await fetch('/api/auth/lakeb2b/linkedin-login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential_id: id, session_id: sessionId, code: twoFaCode.trim() }),
      })
      const data = await res.json() as { status?: string; message?: string; detail?: string }
      if (!res.ok) throw new Error(data.detail || `Error ${res.status}`)
      if (data.status === 'success') {
        linkedinConnectedRef.current = true
        setStep('done')
        onDone(id, resolvedNameRef.current)
      } else {
        setLoginError(data.message || 'Invalid code — try again')
      }
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : 'Verification failed')
    } finally {
      setLoginLoading(false)
    }
  }

  async function handleExtensionPair() {
    const id = credentialIdRef.current
    if (!id) return
    setLoginLoading(true)
    setLoginError('')
    try {
      const res = await fetch(`/api/auth/lakeb2b/pair?credential_id=${id}`, { method: 'POST' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { detail?: string }
        throw new Error(d.detail || `Error ${res.status}`)
      }
      const { pairing_token, api_base } = await res.json() as { pairing_token: string; api_base: string }
      // Content script bridges this to the background service worker
      window.postMessage({ type: 'LAKEB2B_PAIR', pairing_token, api_base }, '*')
      // Result arrives via LAKEB2B_PAIR_RESULT in handleMsg above
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : 'Extension pairing failed')
      setLoginLoading(false)
    }
  }

  function handleSkip() {
    const id = credentialIdRef.current
    if (id !== null) onDone(id, resolvedNameRef.current)
  }

  if (step === 'oauth') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '10px 12px', background: 'var(--bg-0)', borderRadius: 7, border: '1px solid var(--border-1)', lineHeight: 1.55 }}>
        <strong style={{ color: 'var(--text-2)' }}>LakeB2B Pulse</strong> monitors LinkedIn on your behalf.
        First, authorize ChampIQ via LinkedIn OAuth. Then link your LinkedIn session (server login or browser extension).
      </div>
      <SettingsField label="Credential name" required>
        <input
          value={credName}
          onChange={(e) => { setCredName(e.target.value); setOauthError('') }}
          placeholder="lakeb2b-pulse"
          style={fieldInputStyle}
        />
      </SettingsField>
      {oauthError && <p style={{ margin: 0, fontSize: 12, color: 'var(--danger)' }}>{oauthError}</p>}
      <button
        onClick={handleOAuth}
        disabled={oauthLoading || !credName.trim()}
        style={{ ...primarySmStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
      >
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 14, height: 14, borderRadius: 2,
          background: '#0A66C2', color: '#fff',
          fontWeight: 700, fontSize: 9, letterSpacing: 0, fontFamily: 'serif',
          flexShrink: 0,
        }}>in</span>
        {oauthLoading ? 'Waiting for LinkedIn…' : 'Connect with LinkedIn'}
      </button>
      {oauthLoading && (
        <p style={{ margin: 0, fontSize: 11, color: 'var(--text-4)', textAlign: 'center' }}>
          Complete the LinkedIn login in the popup window.
        </p>
      )}
    </div>
  )

  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px', background: 'none', border: 'none',
    borderBottom: active ? '2px solid var(--accent-2)' : '2px solid transparent',
    color: active ? 'var(--accent-1)' : 'var(--text-3)',
    fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  })

  if (step === 'linkedin') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ padding: '8px 12px', background: 'rgba(74,222,128,.08)', border: '1px solid rgba(74,222,128,.2)', borderRadius: 7, fontSize: 12, color: 'var(--text-2)' }}>
        ✓ B2B Pulse authorized. Now link your LinkedIn session.
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-1)', marginBottom: 2 }}>
        <button style={tabBtn(linkedinTab === 'server')} onClick={() => { setLinkedinTab('server'); setLoginError('') }}>Server Login</button>
        <button style={tabBtn(linkedinTab === 'extension')} onClick={() => { setLinkedinTab('extension'); setLoginError('') }}>Browser Extension</button>
      </div>

      {linkedinTab === 'server' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-4)', lineHeight: 1.5 }}>
            B2B Pulse logs into LinkedIn from their servers — no extension needed.
            Your password goes directly to B2B Pulse, not stored in ChampIQ.
          </p>
          {!needsTwoFa ? (
            <>
              <SettingsField label="LinkedIn email" required>
                <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setLoginError('') }} placeholder="you@example.com" style={fieldInputStyle} />
              </SettingsField>
              <SettingsField label="LinkedIn password" required>
                <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setLoginError('') }} placeholder="••••••••" style={{ ...fieldInputStyle, fontFamily: 'var(--font-mono)' }} />
              </SettingsField>
              {loginError && <p style={{ margin: 0, fontSize: 12, color: 'var(--danger)' }}>{loginError}</p>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={handleSkip} style={ghostSmStyle}>Skip for now</button>
                <button onClick={handleServerLogin} disabled={loginLoading || !email.trim() || !password} style={primarySmStyle}>
                  {loginLoading ? 'Connecting…' : 'Connect LinkedIn →'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-2)' }}>LinkedIn sent a verification code to your phone or email.</p>
              <SettingsField label="Verification code" required>
                <input
                  value={twoFaCode}
                  onChange={(e) => { setTwoFaCode(e.target.value); setLoginError('') }}
                  placeholder="123456" maxLength={8} autoFocus
                  style={{ ...fieldInputStyle, fontFamily: 'var(--font-mono)', letterSpacing: '0.15em' }}
                  onKeyDown={(e) => e.key === 'Enter' && handleVerify2FA()}
                />
              </SettingsField>
              {loginError && <p style={{ margin: 0, fontSize: 12, color: 'var(--danger)' }}>{loginError}</p>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => { setNeedsTwoFa(false); setTwoFaCode('') }} style={ghostSmStyle}>← Back</button>
                <button onClick={handleVerify2FA} disabled={loginLoading || !twoFaCode.trim()} style={primarySmStyle}>
                  {loginLoading ? 'Verifying…' : 'Verify →'}
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-4)', lineHeight: 1.5 }}>
            The ChampIQ extension reads your LinkedIn session cookie and shares it with B2B Pulse automatically.
          </p>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: 'var(--text-3)', lineHeight: 2 }}>
            <li>Download the extension zip below</li>
            <li>Open Chrome → <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>chrome://extensions</code></li>
            <li>Enable <strong>Developer Mode</strong> (toggle top-right)</li>
            <li>Drag the zip onto the page and confirm install</li>
            <li>Log into <strong>LinkedIn</strong> in Chrome</li>
            <li>Click <strong>Connect via Extension</strong> below</li>
          </ol>
          <a href="/extension.zip" download="champiq-extension.zip"
            style={{ ...primarySmStyle, textDecoration: 'none', textAlign: 'center', display: 'block' }}>
            Download Extension (.zip)
          </a>
          {loginError && <p style={{ margin: 0, fontSize: 12, color: 'var(--danger)' }}>{loginError}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={handleSkip} style={ghostSmStyle}>Skip for now</button>
            <button onClick={handleExtensionPair} disabled={loginLoading} style={primarySmStyle}>
              {loginLoading ? 'Connecting…' : 'Connect via Extension →'}
            </button>
          </div>
        </div>
      )}
    </div>
  )

  // step === 'done'
  return (
    <div style={{ padding: '14px 16px', background: 'rgba(74,222,128,.08)', border: '1px solid rgba(74,222,128,.2)', borderRadius: 8, textAlign: 'center' }}>
      <div style={{ fontSize: 22, marginBottom: 6 }}>✓</div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--text-1)', marginBottom: 4 }}>
        B2B Pulse connected
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>
        Drag a <strong>B2B Pulse</strong> node onto the canvas to start monitoring LinkedIn.
      </p>
    </div>
  )
}

// ── Emelia inline wizard ────────────────────────────────────────────────────

interface EmeliaProvider { id: string; email?: string; name?: string }

function EmeliaWizard({ onSave }: { onSave: (name: string, fields: Record<string, string>) => void }) {
  const [step, setStep] = useState<'key' | 'sender' | 'name'>('key')
  const [apiKey, setApiKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [testError, setTestError] = useState('')
  const [accountEmail, setAccountEmail] = useState('')
  const [providers, setProviders] = useState<EmeliaProvider[]>([])
  const [selectedProvider, setSelectedProvider] = useState('')
  const [credName, setCredName] = useState('emelia-prod')

  async function handleVerify() {
    if (!apiKey.trim()) { setTestError('Enter your Emelia API key first'); return }
    setTesting(true); setTestError('')
    try {
      const res = await fetch('/api/champmail/credentials/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey.trim() }),
      })
      if (!res.ok) { setTestError(`Emelia rejected the key (${res.status})`); return }
      const data = await res.json()
      if (!data.valid) { setTestError(data.error ?? 'Emelia rejected the key — check it and try again'); return }
      setAccountEmail(data.account_email ?? '')
      setProviders(data.providers ?? [])
      setStep('sender')
    } catch {
      setTestError('Could not reach the server — is the API running?')
    } finally {
      setTesting(false)
    }
  }

  function handleSave() {
    onSave(credName.trim() || 'emelia-prod', {
      api_key: apiKey.trim(),
      default_sender_id: selectedProvider,
    })
  }

  if (step === 'key') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <SettingsField label="Emelia API Key" required>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => { setApiKey(e.target.value); setTestError('') }}
          placeholder="OoHpr7..."
          style={{ ...fieldInputStyle, fontFamily: 'var(--font-mono)' }}
          onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
        />
      </SettingsField>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-4)' }}>
        Get your key from <strong>app.emelia.io → Settings → API Keys</strong>
      </p>
      {testError && <p style={{ margin: 0, fontSize: 12, color: 'var(--danger)' }}>{testError}</p>}
      <button onClick={handleVerify} disabled={testing || !apiKey.trim()} style={primarySmStyle}>
        {testing ? 'Verifying…' : 'Verify key →'}
      </button>
    </div>
  )

  if (step === 'sender') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--text-2)', padding: '8px 10px', background: 'var(--bg-0)', borderRadius: 7, border: '1px solid var(--border-1)' }}>
        ✓ Connected as <strong>{accountEmail || 'your Emelia account'}</strong>
      </div>
      <SettingsField label="Default sender (optional)">
        {providers.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-4)' }}>
            No email inboxes connected in Emelia yet — you can skip this.
          </p>
        ) : (
          <select
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
            style={fieldInputStyle}
          >
            <option value="">— Skip / use environment default —</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>{p.email ?? p.name ?? p.id}</option>
            ))}
          </select>
        )}
      </SettingsField>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={() => setStep('key')} style={ghostSmStyle}>← Back</button>
        <button onClick={() => setStep('name')} style={primarySmStyle}>Next →</button>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <SettingsField label="Credential name" required>
        <input
          value={credName}
          onChange={(e) => setCredName(e.target.value)}
          placeholder="emelia-prod"
          style={fieldInputStyle}
        />
      </SettingsField>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-4)' }}>
        This name appears in the node inspector credential picker.
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={() => setStep('sender')} style={ghostSmStyle}>← Back</button>
        <button onClick={handleSave} disabled={!credName.trim()} style={primarySmStyle}>Save credential</button>
      </div>
    </div>
  )
}

// ── Shared style helpers ────────────────────────────────────────────────────

function SettingsField({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 5 }}>
        {label}{required && <span style={{ color: 'var(--danger)', marginLeft: 3 }}>*</span>}
      </div>
      {children}
    </div>
  )
}

const fieldInputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg-0)', border: '1px solid var(--border-2)',
  color: 'var(--text-1)', padding: '8px 10px', borderRadius: 7,
  fontFamily: 'var(--font-body)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
}

const ghostSmStyle: React.CSSProperties = {
  padding: '6px 14px', background: 'transparent', border: '1px solid var(--border-1)',
  borderRadius: 7, color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 600,
  fontSize: 12, cursor: 'pointer',
}

const primarySmStyle: React.CSSProperties = {
  padding: '6px 14px', background: 'var(--accent-2)', border: 'none',
  borderRadius: 7, color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 600,
  fontSize: 12, cursor: 'pointer',
}
