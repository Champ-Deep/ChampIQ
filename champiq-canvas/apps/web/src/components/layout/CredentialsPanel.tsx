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
// Flow:
//   Step 'extension' → user must install the ChampIQ browser extension first
//   Step 'login'     → extension detected; user enters name and clicks Login with LinkedIn
//   Step 'linkedin'  → OAuth popup opened; extension intercepts B2B Pulse redirect,
//                      captures token, sends LAKEB2B_AUTH_TOKEN postMessage
//   Step 'done'      → credential saved; show success

const EXTENSION_INSTALL_URL = '/extension.zip'

type LakeB2BStep = 'extension' | 'login' | 'waiting' | 'done'

function LakeB2BLoginFlow({ onDone }: { onDone: () => void }) {
  const { addCredential } = useCredentialStore()
  const [step, setStep] = useState<LakeB2BStep>('extension')
  const [name, setName] = useState('lakeb2b-pulse')
  const [credentialId, setCredentialId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const [needsReload, setNeedsReload] = useState(false)

  // Ping the extension via postMessage. Content script replies with LAKEB2B_PONG.
  function checkExtension(): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        window.removeEventListener('message', handler)
        resolve(false)
      }, 1500)
      function handler(ev: MessageEvent) {
        if (ev.data?.type === 'LAKEB2B_PONG') {
          clearTimeout(timeout)
          window.removeEventListener('message', handler)
          resolve(true)
        }
      }
      window.addEventListener('message', handler)
      window.postMessage({ type: 'LAKEB2B_PING' }, '*')
    })
  }

  async function handleCheckExtension() {
    setChecking(true)
    setError('')
    setNeedsReload(false)
    const found = await checkExtension()
    setChecking(false)
    if (found) {
      setStep('login')
    } else {
      // Extension content scripts only inject into tabs that loaded AFTER install.
      // Show a reload prompt so the user can refresh without losing their place.
      setNeedsReload(true)
      setError('Extension installed but not yet active on this tab.')
    }
  }

  // Start OAuth: open popup, then listen for LAKEB2B_AUTH_TOKEN from the extension
  async function handleLinkedInLogin() {
    if (!name.trim()) { setError('Credential name is required'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/auth/lakeb2b/oauth-url?name=${encodeURIComponent(name.trim())}`)
      if (!res.ok) throw new Error(`Failed to get OAuth URL (${res.status})`)
      const data = await res.json()

      // Open the B2B Pulse LinkedIn OAuth popup
      const popup = window.open(data.auth_url, 'lakeb2b_oauth', 'width=600,height=700,scrollbars=yes')
      setStep('waiting')

      // The extension watches for B2B Pulse's redirect to localhost:5173/login?token=...
      // It closes the popup tab and sends LAKEB2B_AUTH_TOKEN via content.js → postMessage
      const tokenHandler = async (ev: MessageEvent) => {
        if (ev.data?.type !== 'LAKEB2B_AUTH_TOKEN') return
        window.removeEventListener('message', tokenHandler)
        clearInterval(popupWatcher)
        popup?.close()

        const token: string = ev.data.token
        const refreshToken: string = ev.data.refresh_token || ''
        const credName = name.trim()

        try {
          // Persist the credential server-side
          await fetch(
            `/api/auth/lakeb2b/callback?token=${encodeURIComponent(token)}&refresh_token=${encodeURIComponent(refreshToken)}&name=${encodeURIComponent(credName)}`
          )
          // Fetch back to get the server-assigned credential id
          const credsRes = await fetch('/api/credentials')
          const creds = await credsRes.json()
          const latest = Array.isArray(creds)
            ? (creds as { id: number; name: string; type: string }[])
                .filter(c => c.type === 'lakeb2b')
                .pop()
            : null

          if (latest) {
            setCredentialId(latest.id)
            addCredential(latest.name || credName, 'lakeb2b', { credential_id: String(latest.id) })
            setStep('done')
          } else {
            setError('Auth succeeded but could not retrieve credential. Try again.')
            setStep('login')
          }
        } catch {
          setError('Failed to save credential after OAuth.')
          setStep('login')
        }
        setLoading(false)
      }
      window.addEventListener('message', tokenHandler)

      // Also handle the old LAKEB2B_AUTH_SUCCESS path (in case backend callback fires first)
      const successHandler = async (ev: MessageEvent) => {
        if (ev.data?.type !== 'LAKEB2B_AUTH_SUCCESS') return
        window.removeEventListener('message', successHandler)
        window.removeEventListener('message', tokenHandler)
        clearInterval(popupWatcher)
        const serverId: number = ev.data.credential_id
        const credName: string = ev.data.name || name.trim()
        setCredentialId(serverId)
        addCredential(credName, 'lakeb2b', { credential_id: String(serverId) })
        setStep('done')
        setLoading(false)
      }
      window.addEventListener('message', successHandler)

      // Fallback: popup closed without any message (user cancelled)
      const popupWatcher = setInterval(() => {
        if (popup?.closed) {
          clearInterval(popupWatcher)
          window.removeEventListener('message', tokenHandler)
          window.removeEventListener('message', successHandler)
          setStep('login')
          setLoading(false)
        }
      }, 500)

    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start OAuth')
      setStep('login')
      setLoading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (step === 'done') {
    return (
      <div className="flex flex-col gap-3 p-3 rounded-lg" style={{ background: 'var(--bg-sidebar)', border: '1px solid #22c55e44' }}>
        <p className="text-xs font-semibold" style={{ color: '#22c55e' }}>✓ LakeB2B Pulse connected</p>
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>
          Credential ID: {credentialId} — ready to use in LakeB2B Pulse nodes.
        </p>
        <button onClick={onDone} className="text-xs py-1.5 rounded-md font-medium" style={{ background: '#6366f1', color: '#fff' }}>
          Done
        </button>
      </div>
    )
  }

  if (step === 'waiting') {
    return (
      <div className="flex flex-col gap-3 p-3 rounded-lg" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border)' }}>
        <p className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>Waiting for LinkedIn login…</p>
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>
          Complete the LinkedIn login in the popup. The extension will capture your token automatically.
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs animate-pulse" style={{ color: '#818cf8' }}>●</span>
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>Waiting for extension to capture token…</span>
        </div>
        {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}
        <button onClick={() => { setStep('login'); setLoading(false) }} className="text-xs" style={{ color: 'var(--text-3)' }}>
          Cancel
        </button>
      </div>
    )
  }

  if (step === 'login') {
    return (
      <div className="flex flex-col gap-2.5 p-3 rounded-lg" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-1.5">
          <span className="text-xs" style={{ color: '#22c55e' }}>●</span>
          <p className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>Extension detected — Connect LakeB2B Pulse</p>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>
          Enter a name for this credential, then sign in with LinkedIn.
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

  // Step 'extension': prompt to install the extension first
  return (
    <div className="flex flex-col gap-3 p-3 rounded-lg" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border)' }}>
      <p className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>Step 1 — Install the ChampIQ Extension</p>
      <p className="text-xs" style={{ color: 'var(--text-3)' }}>
        The ChampIQ browser extension is required to capture your LinkedIn auth token automatically.
      </p>

      <div className="flex flex-col gap-2 p-2.5 rounded-md" style={{ background: '#6366f111', border: '1px solid #6366f133' }}>
        <p className="text-xs font-medium" style={{ color: '#818cf8' }}>How to install:</p>
        <ol className="flex flex-col gap-1" style={{ color: 'var(--text-3)' }}>
          <li className="text-xs">1. Download the extension zip below</li>
          <li className="text-xs">2. Go to <span className="font-mono" style={{ color: 'var(--text-2)' }}>chrome://extensions</span></li>
          <li className="text-xs">3. Enable "Developer mode" (top right)</li>
          <li className="text-xs">4. Click "Load unpacked" → select the unzipped folder</li>
        </ol>
      </div>

      <a
        href={EXTENSION_INSTALL_URL}
        download
        className="flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-md font-medium"
        style={{ background: '#6366f1', color: '#fff' }}
      >
        <ExternalLink size={11} /> Download Extension
      </a>

      {error && <p className="text-xs" style={{ color: '#f59e0b' }}>{error}</p>}

      {needsReload ? (
        <button
          onClick={() => window.location.reload()}
          className="text-xs py-1.5 rounded-md font-medium"
          style={{ background: '#f59e0b', color: '#000' }}
        >
          Reload page to activate extension →
        </button>
      ) : (
        <button
          onClick={handleCheckExtension}
          disabled={checking}
          className="text-xs py-1.5 rounded-md font-medium disabled:opacity-50"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
        >
          {checking ? 'Checking…' : 'I installed it — continue →'}
        </button>
      )}

      <button onClick={onDone} className="text-xs" style={{ color: 'var(--text-3)' }}>
        Cancel
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
