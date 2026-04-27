import { useState } from 'react'
import { Plus, Trash2, Eye, EyeOff, ChevronDown, ChevronUp, ExternalLink } from '@/lib/icons'
import {
  useCredentialStore,
  CREDENTIAL_TYPE_FIELDS,
  type CredentialType,
  type Credential,
} from '@/store/credentialStore'

const TYPE_LABELS: Record<CredentialType, string> = {
  champmail:  'ChampMail',
  champgraph: 'ChampGraph',
  champvoice: 'ChampVoice',
  lakeb2b:    'LakeB2B Pulse',
  http:       'HTTP / Bearer',
  generic:    'Generic Secret',
}

const CREDENTIAL_TYPES: CredentialType[] = [
  'champmail', 'champgraph', 'champvoice', 'lakeb2b', 'http', 'generic',
]

// ── LakeB2B Pulse Login Flow ──────────────────────────────────────────────────

type LakeB2BStep = 'login' | 'linkedin' | 'done'

function LakeB2BLoginFlow({ onDone }: { onDone: () => void }) {
  const { addCredential } = useCredentialStore()
  const [step, setStep] = useState<LakeB2BStep>('login')
  const [name, setName] = useState('lakeb2b-pulse')
  const [credentialId, setCredentialId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [extensionDetected, setExtensionDetected] = useState<boolean | null>(null)

  // Step 1: Open LinkedIn OAuth popup
  async function handleLinkedInLogin() {
    if (!name.trim()) { setError('Credential name is required'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/auth/lakeb2b/oauth-url?name=${encodeURIComponent(name.trim())}`)
      if (!res.ok) throw new Error(`Failed to get OAuth URL (${res.status})`)
      const data = await res.json()

      // Open popup — B2B Pulse handles LinkedIn OAuth, then redirects to our callback
      const popup = window.open(data.auth_url, 'lakeb2b_oauth', 'width=600,height=700,scrollbars=yes')

      // Listen for postMessage from callback page (two possible sources):
      // 1. LAKEB2B_AUTH_SUCCESS — from /api/auth/lakeb2b/callback HTML page (direct redirect)
      // 2. LAKEB2B_TOKEN_RELAY — from our app at localhost:5173/login?token=... (B2B Pulse → our app)
      const handler = async (ev: MessageEvent) => {
        if (ev.data?.type === 'LAKEB2B_AUTH_SUCCESS') {
          window.removeEventListener('message', handler)
          const serverId: number = ev.data.credential_id
          const credName: string = ev.data.name || name.trim()
          setCredentialId(serverId)
          addCredential(credName, 'lakeb2b', { credential_id: String(serverId) })
          detectExtension()
          setStep('linkedin')
          popup?.close()
        } else if (ev.data?.type === 'LAKEB2B_TOKEN_RELAY') {
          // B2B Pulse redirected to localhost:5173/login?token=... → our app relayed the token
          window.removeEventListener('message', handler)
          const credName = name.trim()
          try {
            // Save the credential via the backend callback endpoint (returns HTML, we ignore body)
            await fetch(
              `/api/auth/lakeb2b/callback?token=${encodeURIComponent(ev.data.token)}&refresh_token=${encodeURIComponent(ev.data.refresh_token || '')}&name=${encodeURIComponent(credName)}`
            )
            const credsRes = await fetch('/api/credentials')
            const creds = await credsRes.json()
            const latest = Array.isArray(creds) ? creds.filter((c: { type: string }) => c.type === 'lakeb2b').pop() : null
            if (latest) {
              setCredentialId(latest.id)
              addCredential(latest.name || credName, 'lakeb2b', { credential_id: String(latest.id) })
              detectExtension()
              setStep('linkedin')
            } else {
              setError('OAuth succeeded but could not retrieve credential')
            }
          } catch {
            setError('Failed to complete OAuth setup')
          }
          setLoading(false)
        } else if (ev.data?.type === 'LAKEB2B_AUTH_ERROR') {
          window.removeEventListener('message', handler)
          setError(ev.data.error || 'LinkedIn login failed')
          popup?.close()
        }
      }
      window.addEventListener('message', handler)

      // Fallback: if popup closes without postMessage
      const interval = setInterval(() => {
        if (popup?.closed) {
          clearInterval(interval)
          window.removeEventListener('message', handler)
          setLoading(false)
        }
      }, 500)

    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start OAuth')
      setLoading(false)
    }
  }

  // Detect LakeB2B extension via postMessage handshake
  function detectExtension() {
    setExtensionDetected(null)
    const timeout = setTimeout(() => setExtensionDetected(false), 800)
    const handler = (ev: MessageEvent) => {
      if (ev.data?.type === 'LAKEB2B_PONG') {
        clearTimeout(timeout)
        setExtensionDetected(true)
        window.removeEventListener('message', handler)
      }
    }
    window.addEventListener('message', handler)
    window.postMessage({ type: 'LAKEB2B_PING' }, '*')
  }

  // Extension captures li_at from LinkedIn and posts it back
  function handleConnectLinkedIn() {
    const handler = async (ev: MessageEvent) => {
      if (ev.data?.type === 'LAKEB2B_COOKIE' && ev.data?.li_at) {
        window.removeEventListener('message', handler)
        await saveCookie(ev.data.li_at)
      }
    }
    window.addEventListener('message', handler)
    window.open('https://www.linkedin.com', '_blank')
  }

  async function saveCookie(li_at: string) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/lakeb2b/linkedin-cookie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential_id: credentialId, li_at }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Failed to save LinkedIn session')
      }
      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect LinkedIn')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'done') {
    return (
      <div className="flex flex-col gap-3 p-3 rounded-lg" style={{ background: 'var(--bg-sidebar)', border: '1px solid #22c55e44' }}>
        <p className="text-xs font-semibold" style={{ color: '#22c55e' }}>✓ LakeB2B Pulse connected</p>
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>B2B Pulse ✓ · LinkedIn session ✓</p>
        <button onClick={onDone} className="text-xs py-1.5 rounded-md font-medium" style={{ background: '#6366f1', color: '#fff' }}>Done</button>
      </div>
    )
  }

  if (step === 'linkedin') {
    return (
      <div className="flex flex-col gap-3 p-3 rounded-lg" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border)' }}>
        <p className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>Step 2 — Connect LinkedIn session</p>
        <p className="text-xs" style={{ color: '#22c55e' }}>✓ B2B Pulse login successful</p>

        {extensionDetected === false && (
          <div className="flex flex-col gap-2 p-2.5 rounded-md" style={{ background: '#f59e0b11', border: '1px solid #f59e0b44' }}>
            <p className="text-xs font-medium" style={{ color: '#f59e0b' }}>Extension required</p>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              Install the LakeB2B LinkedIn extension to auto-capture your session token.
            </p>
            <a
              href="https://b2b-pulse.up.railway.app/extension"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs font-medium"
              style={{ color: '#0EA5E9' }}
              onClick={() => setTimeout(detectExtension, 4000)}
            >
              <ExternalLink size={11} /> Download Extension
            </a>
          </div>
        )}

        {extensionDetected === true && (
          <p className="text-xs" style={{ color: '#22c55e' }}>✓ Extension detected</p>
        )}

        {extensionDetected !== false && (
          <button
            onClick={handleConnectLinkedIn}
            disabled={loading}
            className="text-xs py-1.5 rounded-md font-medium disabled:opacity-50"
            style={{ background: '#0A66C2', color: '#fff' }}
          >
            {loading ? 'Connecting…' : 'Login to LinkedIn'}
          </button>
        )}

        <p className="text-xs text-center" style={{ color: 'var(--text-3)' }}>— or paste manually —</p>
        <ManualCookieInput onSave={saveCookie} loading={loading} />

        {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}
        <button onClick={onDone} className="text-xs" style={{ color: 'var(--text-3)' }}>Skip for now</button>
      </div>
    )
  }

  // Step 1: LinkedIn OAuth
  return (
    <div className="flex flex-col gap-2.5 p-3 rounded-lg" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border)' }}>
      <p className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>Connect LakeB2B Pulse</p>
      <p className="text-xs" style={{ color: 'var(--text-3)' }}>
        Sign in with LinkedIn — B2B Pulse uses LinkedIn OAuth.
      </p>

      <div className="flex flex-col gap-1">
        <label className="text-xs" style={{ color: 'var(--text-3)' }}>Credential name</label>
        <input
          autoFocus
          className="text-xs p-1.5 rounded-md focus:outline-none"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
          placeholder="lakeb2b-pulse"
          value={name}
          onChange={(e) => { setName(e.target.value); setError('') }}
        />
      </div>

      {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleLinkedInLogin}
          disabled={loading}
          className="flex-1 text-xs py-1.5 rounded-md font-medium disabled:opacity-50 flex items-center justify-center gap-1.5"
          style={{ background: '#0A66C2', color: '#fff' }}
        >
          {loading ? 'Opening…' : <><ExternalLink size={11} /> Login with LinkedIn</>}
        </button>
        <button
          onClick={onDone}
          className="flex-1 text-xs py-1.5 rounded-md"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function ManualCookieInput({ onSave, loading }: { onSave: (li_at: string) => void; loading: boolean }) {
  const [show, setShow] = useState(false)
  const [liAt, setLiAt] = useState('')
  if (!show) {
    return (
      <button onClick={() => setShow(true)} className="text-xs" style={{ color: 'var(--text-3)' }}>
        Paste li_at cookie manually
      </button>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs" style={{ color: 'var(--text-3)' }}>li_at cookie value</label>
      <input
        type="password"
        className="text-xs p-1.5 rounded-md focus:outline-none font-mono"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
        placeholder="AQEDATd..."
        value={liAt}
        onChange={(e) => setLiAt(e.target.value)}
      />
      <button
        onClick={() => onSave(liAt)}
        disabled={loading || liAt.length < 10}
        className="text-xs py-1 rounded-md font-medium disabled:opacity-50"
        style={{ background: '#0EA5E9', color: '#fff' }}
      >
        Save cookie
      </button>
    </div>
  )
}

// ── Add Credential Form ───────────────────────────────────────────────────────

function AddCredentialForm({ initialType, onDone }: { initialType?: CredentialType; onDone: () => void }) {
  const { addCredential } = useCredentialStore()
  const [name, setName] = useState('')
  const [type, setType] = useState<CredentialType>(initialType ?? 'champmail')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [showSecrets, setShowSecrets] = useState(false)
  const [error, setError] = useState('')

  const fieldDefs = CREDENTIAL_TYPE_FIELDS[type]

  function handleTypeChange(t: CredentialType) {
    setType(t)
    setFields({})
  }

  function handleSubmit() {
    if (!name.trim()) { setError('Name is required'); return }
    addCredential(name.trim(), type, fields)
    onDone()
  }

  // LakeB2B uses its own guided flow
  if (type === 'lakeb2b') {
    return (
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: 'var(--text-3)' }}>Type</label>
          <select
            className="text-xs p-1.5 rounded-md focus:outline-none"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
            value={type}
            onChange={(e) => handleTypeChange(e.target.value as CredentialType)}
          >
            {CREDENTIAL_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <LakeB2BLoginFlow onDone={onDone} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5 p-3 rounded-lg" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border)' }}>
      <p className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>New credential</p>

      {/* Type */}
      <div className="flex flex-col gap-1">
        <label className="text-xs" style={{ color: 'var(--text-3)' }}>Type</label>
        <select
          className="text-xs p-1.5 rounded-md focus:outline-none"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
          value={type}
          onChange={(e) => handleTypeChange(e.target.value as CredentialType)}
        >
          {CREDENTIAL_TYPES.map((t) => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>
      </div>

      {/* Name */}
      <div className="flex flex-col gap-1">
        <label className="text-xs" style={{ color: 'var(--text-3)' }}>Name</label>
        <input
          autoFocus
          className="text-xs p-1.5 rounded-md focus:outline-none"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
          placeholder={`e.g. ${type}-prod`}
          value={name}
          onChange={(e) => { setName(e.target.value); setError('') }}
        />
      </div>

      {/* Dynamic fields */}
      {fieldDefs.map((f) => (
        <div key={f.key} className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: 'var(--text-3)' }}>{f.label}</label>
          <input
            type={f.secret && !showSecrets ? 'password' : 'text'}
            className="text-xs p-1.5 rounded-md focus:outline-none"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
            value={fields[f.key] ?? ''}
            onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
          />
        </div>
      ))}

      {/* ChampVoice: show ElevenLabs webhook URL hint */}
      {type === 'champvoice' && (
        <p className="text-xs px-1" style={{ color: 'var(--text-3)' }}>
          In ElevenLabs agent settings, set the post-call webhook to:<br />
          <span className="font-mono" style={{ color: '#818cf8' }}>
            https://champiq-production.up.railway.app/api/webhooks/tools/champvoice
          </span>
        </p>
      )}

      {/* Show/hide secrets */}
      <button
        className="text-xs flex items-center gap-1 w-fit"
        style={{ color: 'var(--text-3)' }}
        onClick={() => setShowSecrets((v) => !v)}
      >
        {showSecrets ? <EyeOff size={11} /> : <Eye size={11} />}
        {showSecrets ? 'Hide' : 'Show'} secrets
      </button>

      {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          className="flex-1 text-xs py-1.5 rounded-md font-medium"
          style={{ background: '#6366f1', color: '#fff' }}
        >
          Save
        </button>
        <button
          onClick={onDone}
          className="flex-1 text-xs py-1.5 rounded-md"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Credential Card ───────────────────────────────────────────────────────────

function CredentialCard({ cred }: { cred: Credential }) {
  const { deleteCredential } = useCredentialStore()
  const [expanded, setExpanded] = useState(false)
  const filledKeys = Object.keys(cred.fields).filter((k) => cred.fields[k])

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ border: '1px solid var(--border)', background: 'var(--bg-sidebar)' }}
    >
      <div
        className="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium truncate" style={{ color: 'var(--text-1)' }}>{cred.name}</p>
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>{TYPE_LABELS[cred.type]}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); deleteCredential(cred.id) }}
            className="p-0.5 rounded hover:text-red-400"
            style={{ color: 'var(--text-3)' }}
            aria-label={`Delete ${cred.name}`}
          >
            <Trash2 size={11} />
          </button>
          {expanded ? <ChevronUp size={11} style={{ color: 'var(--text-3)' }} /> : <ChevronDown size={11} style={{ color: 'var(--text-3)' }} />}
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 flex flex-col gap-1" style={{ borderTop: '1px solid var(--border)' }}>
          {filledKeys.length === 0 ? (
            <p className="text-xs pt-2" style={{ color: 'var(--text-3)' }}>No fields set.</p>
          ) : (
            filledKeys.map((k) => (
              <div key={k} className="flex items-center justify-between gap-2 pt-1.5">
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>{k}</span>
                <span className="text-xs font-mono" style={{ color: 'var(--text-2)' }}>••••••</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── CredentialsPanel ──────────────────────────────────────────────────────────

export function CredentialsPanel() {
  const { credentials } = useCredentialStore()
  const [adding, setAdding] = useState(false)
  const [addType, setAddType] = useState<CredentialType | undefined>()

  function startAdd(type?: CredentialType) {
    setAddType(type)
    setAdding(true)
  }

  return (
    <div className="flex flex-col gap-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-2)' }}>
          Credentials {credentials.length > 0 && `(${credentials.length})`}
        </span>
        <button
          onClick={() => startAdd()}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-md font-medium"
          style={{ background: '#6366f1', color: '#fff' }}
        >
          <Plus size={11} /> Add
        </button>
      </div>

      <div className="flex flex-col gap-2 p-3">
        {/* Add form */}
        {adding && (
          <AddCredentialForm initialType={addType} onDone={() => setAdding(false)} />
        )}

        {/* Credential list */}
        {credentials.length === 0 && !adding ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>No credentials saved yet.</p>
            <div className="flex flex-col gap-1.5">
              {CREDENTIAL_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => startAdd(t)}
                  className="text-xs py-1.5 px-2 rounded-md text-left flex items-center gap-1.5"
                  style={{ border: '1px solid var(--border)', color: 'var(--text-2)', background: 'var(--bg-sidebar)' }}
                >
                  <Plus size={10} /> Add {TYPE_LABELS[t]} Credential
                </button>
              ))}
            </div>
          </div>
        ) : (
          credentials.map((c) => <CredentialCard key={c.id} cred={c} />)
        )}
      </div>

      <div style={{ borderTop: '1px solid var(--border)' }} />
    </div>
  )
}
