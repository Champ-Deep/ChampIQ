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
//   Step 'login'    → enter name → click Login with LinkedIn → popup opens
//   Step 'waiting'  → popup open, waiting for LAKEB2B_AUTH_TOKEN
//   Step 'li_at'    → credential saved; extension auto-reads li_at from LinkedIn cookies
//   Step 'done'     → fully connected (B2B Pulse + LinkedIn session)

type LakeB2BStep = 'login' | 'waiting' | 'li_at' | 'done'

function LakeB2BLoginFlow({ onDone }: { onDone: () => void }) {
  const { addCredential } = useCredentialStore()
  const [step, setStep] = useState<LakeB2BStep>('login')
  const [name, setName] = useState('lakeb2b-pulse')
  const [credentialId, setCredentialId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [liAtStatus, setLiAtStatus] = useState<'pending' | 'ok' | 'error'>('pending')

  async function saveToken(token: string, refreshToken: string, li_at: string) {
    const credName = name.trim()

    // Save credential server-side. Pass li_at too so backend can call session-cookies
    // immediately while token is guaranteed fresh (extension captured both together).
    const url = `/api/auth/lakeb2b/callback?token=${encodeURIComponent(token)}&refresh_token=${encodeURIComponent(refreshToken)}&name=${encodeURIComponent(credName)}${li_at ? `&li_at=${encodeURIComponent(li_at)}` : ''}`
    await fetch(url)

    const credsRes = await fetch('/api/credentials')
    const creds = await credsRes.json()
    const latest = Array.isArray(creds)
      ? (creds as { id: number; name: string; type: string }[]).filter(c => c.type === 'lakeb2b').pop()
      : null
    if (!latest) throw new Error('Could not retrieve saved credential')
    setCredentialId(latest.id)
    addCredential(latest.name || credName, 'lakeb2b', { credential_id: String(latest.id) })

    if (li_at) {
      // li_at was captured by extension and saved atomically — done
      setStep('done')
    } else {
      // No li_at yet — show the li_at step and ask extension to capture it now
      setStep('li_at')
      setLiAtStatus('pending')
      const liAtHandler = (ev: MessageEvent) => {
        if (ev.data?.type !== 'LAKEB2B_LI_AT_RESULT') return
        window.removeEventListener('message', liAtHandler)
        if (ev.data.success) {
          setLiAtStatus('ok')
          setTimeout(() => setStep('done'), 800)
        } else {
          setLiAtStatus('error')
          setError(ev.data.error || 'Could not capture LinkedIn session')
        }
      }
      window.addEventListener('message', liAtHandler)
      window.postMessage({ type: 'LAKEB2B_SAVE_LI_AT', credential_id: latest.id }, '*')
      setTimeout(() => {
        window.removeEventListener('message', liAtHandler)
        setStep('done')
      }, 5000)
    }
  }

  async function handleLinkedInLogin() {
    if (!name.trim()) { setError('Credential name is required'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/auth/lakeb2b/oauth-url?name=${encodeURIComponent(name.trim())}`)
      if (!res.ok) throw new Error(`Server error ${res.status} — please try again`)
      const { auth_url } = await res.json()

      // Open B2B Pulse LinkedIn OAuth in a popup.
      // After login, B2B Pulse redirects popup to FRONTEND_URL/auth/callback#access_token=...
      // Our main.tsx /auth/callback handler reads the hash and postMessages LAKEB2B_AUTH_TOKEN back.
      const popup = window.open(auth_url, 'lakeb2b_oauth', 'width=600,height=700,scrollbars=yes')
      setStep('waiting')

      // BroadcastChannel fallback (when redirect isn't a popup — tab-based redirect)
      const bc = new BroadcastChannel('lakeb2b_oauth')

      const cleanup = (keepLoading = false) => {
        window.removeEventListener('message', msgHandler)
        bc.removeEventListener('message', bcHandler)
        bc.close()
        clearInterval(popupWatcher)
        if (!keepLoading) setLoading(false)
      }

      const onToken = async (token: string, refresh: string, li_at: string) => {
        cleanup(true)
        popup?.close()
        try {
          await saveToken(token, refresh, li_at)
        } catch {
          setError('Failed to save credential. Try again.')
          setStep('login')
        }
        setLoading(false)
      }

      // postMessage from /auth/callback or extension (includes li_at captured simultaneously)
      const msgHandler = (ev: MessageEvent) => {
        if (ev.data?.type === 'LAKEB2B_AUTH_TOKEN' && ev.data.token) {
          onToken(ev.data.token, ev.data.refresh_token || '', ev.data.li_at || '')
        }
      }
      window.addEventListener('message', msgHandler)

      // BroadcastChannel from /auth/callback (tab-redirect path)
      const bcHandler = (ev: MessageEvent) => {
        if (ev.data?.type === 'LAKEB2B_AUTH_TOKEN' && ev.data.token) {
          onToken(ev.data.token, ev.data.refresh_token || '', ev.data.li_at || '')
        }
      }
      bc.addEventListener('message', bcHandler)

      // Popup closed by user without completing login
      const popupWatcher = setInterval(() => {
        if (popup?.closed) {
          cleanup()
          setStep('login')
        }
      }, 500)

    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start OAuth')
      setStep('login')
      setLoading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (step === 'li_at') {
    return (
      <div className="flex flex-col gap-3 p-3 rounded-lg" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border)' }}>
        <p className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>✓ B2B Pulse login successful</p>
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>Connecting LinkedIn session automatically…</p>
        {liAtStatus === 'pending' && (
          <div className="flex items-center gap-2">
            <span className="text-xs animate-pulse" style={{ color: '#818cf8' }}>●</span>
            <span className="text-xs" style={{ color: 'var(--text-3)' }}>Reading LinkedIn session from browser…</span>
          </div>
        )}
        {liAtStatus === 'ok' && (
          <p className="text-xs font-medium" style={{ color: '#22c55e' }}>✓ LinkedIn session connected</p>
        )}
        {liAtStatus === 'error' && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs" style={{ color: '#f59e0b' }}>{error}</p>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              Make sure you're logged into LinkedIn in this browser, then:
            </p>
            <button
              onClick={() => {
                setError('')
                setLiAtStatus('pending')
                window.postMessage({ type: 'LAKEB2B_SAVE_LI_AT', credential_id: credentialId }, '*')
              }}
              className="text-xs py-1 rounded-md font-medium"
              style={{ background: '#0A66C2', color: '#fff' }}
            >
              Retry — capture LinkedIn session
            </button>
            <button onClick={() => setStep('done')} className="text-xs" style={{ color: 'var(--text-3)' }}>
              Skip for now
            </button>
          </div>
        )}
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="flex flex-col gap-3 p-3 rounded-lg" style={{ background: 'var(--bg-sidebar)', border: '1px solid #22c55e44' }}>
        <p className="text-xs font-semibold" style={{ color: '#22c55e' }}>✓ LakeB2B Pulse fully connected</p>
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>
          B2B Pulse ✓ · LinkedIn session ✓ — ready to track posts.
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
          Complete the LinkedIn login in the popup. This page will update automatically when done.
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs animate-pulse" style={{ color: '#818cf8' }}>●</span>
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>Waiting for LinkedIn login to complete…</span>
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
        <p className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>Connect LakeB2B Pulse</p>
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>
          Sign in with LinkedIn to connect your LakeB2B Pulse account.
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

  // Default: 'login' step (also the fallback)
  return null
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
  const [liAtMsg, setLiAtMsg] = useState('')
  const filledKeys = Object.keys(cred.fields).filter((k) => cred.fields[k])

  function reconnectLinkedIn() {
    setLiAtMsg('Capturing LinkedIn session…')
    const credId = parseInt(cred.fields.credential_id || '0', 10)
    if (!credId) { setLiAtMsg('No server credential ID found'); return }

    const handler = (ev: MessageEvent) => {
      if (ev.data?.type !== 'LAKEB2B_LI_AT_RESULT') return
      window.removeEventListener('message', handler)
      setLiAtMsg(ev.data.success ? '✓ LinkedIn session connected' : `Error: ${ev.data.error}`)
    }
    window.addEventListener('message', handler)
    window.postMessage({ type: 'LAKEB2B_SAVE_LI_AT', credential_id: credId }, '*')
    setTimeout(() => {
      window.removeEventListener('message', handler)
      setLiAtMsg((m) => m === 'Capturing LinkedIn session…' ? 'No response from extension — reload it at chrome://extensions' : m)
    }, 5000)
  }

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
        <div className="px-3 pb-3 flex flex-col gap-2" style={{ borderTop: '1px solid var(--border)' }}>
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
          {cred.type === 'lakeb2b' && (
            <div className="flex flex-col gap-1 pt-1">
              <button
                onClick={reconnectLinkedIn}
                className="text-xs py-1 rounded-md font-medium"
                style={{ background: '#0A66C2', color: '#fff' }}
              >
                Reconnect LinkedIn session
              </button>
              {liAtMsg && (
                <p className="text-xs" style={{ color: liAtMsg.startsWith('✓') ? '#22c55e' : '#f59e0b' }}>
                  {liAtMsg}
                </p>
              )}
            </div>
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
