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
    await fetch(url)  // returns HTML — fires svc.create() server-side
    // Small delay to ensure DB commit is visible before listing credentials
    await new Promise(r => setTimeout(r, 600))

    const credsRes = await fetch('/api/credentials')
    const creds = await credsRes.json()
    const latest = Array.isArray(creds)
      ? (creds as { id: number; name: string; type: string }[]).filter(c => c.type === 'lakeb2b').pop()
      : null
    if (!latest) throw new Error('Could not retrieve saved credential')
    setCredentialId(latest.id)
    addCredential(latest.name || credName, 'lakeb2b', { credential_id: String(latest.id) })

    if (li_at) {
      // Extension captured li_at during OAuth — save it from the page (not service worker)
      setStep('li_at')
      setLiAtStatus('pending')
      try {
        const res = await fetch('/api/auth/lakeb2b/linkedin-cookie', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential_id: latest.id, li_at }),
        })
        if (res.ok) {
          setLiAtStatus('ok')
          setTimeout(() => setStep('done'), 600)
        } else {
          const err = await res.json().catch(() => ({}))
          setLiAtStatus('error')
          setError(err.detail || 'LinkedIn session save failed')
        }
      } catch {
        setLiAtStatus('error')
        setError('Failed to save LinkedIn session')
      }
    } else {
      // No li_at captured — ask extension now via page-context message
      setStep('li_at')
      setLiAtStatus('pending')
      const liAtHandler = async (ev: MessageEvent) => {
        if (ev.data?.type !== 'LAKEB2B_LI_AT_VALUE') return
        window.removeEventListener('message', liAtHandler)
        if (!ev.data.found || !ev.data.li_at) {
          setLiAtStatus('error')
          setError('LinkedIn li_at not found — make sure you are logged into LinkedIn')
          return
        }
        try {
          const res = await fetch('/api/auth/lakeb2b/linkedin-cookie', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential_id: latest.id, li_at: ev.data.li_at }),
          })
          if (res.ok) {
            setLiAtStatus('ok')
            setTimeout(() => setStep('done'), 600)
          } else {
            const err = await res.json().catch(() => ({}))
            setLiAtStatus('error')
            setError(err.detail || 'LinkedIn session save failed')
          }
        } catch {
          setLiAtStatus('error')
          setError('Failed to save LinkedIn session')
        }
      }
      window.addEventListener('message', liAtHandler)
      window.postMessage({ type: 'LAKEB2B_GET_LI_AT' }, '*')
      setTimeout(() => {
        window.removeEventListener('message', liAtHandler)
        if (liAtStatus === 'pending') setStep('done')
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

      const onToken = async (token: string, refresh: string, li_at: string, li_at_debug?: string) => {
        if (li_at_debug) console.log('[LakeB2B] li_at debug:', li_at_debug)
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
          onToken(ev.data.token, ev.data.refresh_token || '', ev.data.li_at || '', ev.data.li_at_debug)
        }
      }
      window.addEventListener('message', msgHandler)

      // BroadcastChannel from /auth/callback (tab-redirect path)
      const bcHandler = (ev: MessageEvent) => {
        if (ev.data?.type === 'LAKEB2B_AUTH_TOKEN' && ev.data.token) {
          onToken(ev.data.token, ev.data.refresh_token || '', ev.data.li_at || '', ev.data.li_at_debug)
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

// ── LakeB2B Reconnect (inside credential card) ────────────────────────────────

function LakeB2BReconnect({ credId }: { credId: number }) {
  const [phase, setPhase] = useState<'idle' | 'form' | 'pin' | 'done'>('idle')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  async function startLogin() {
    if (!email.trim() || !password.trim()) { setMsg('Email and password required'); return }
    setLoading(true)
    setMsg('')
    try {
      const res = await fetch('/api/auth/lakeb2b/linkedin-login-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential_id: credId, email: email.trim(), password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(data.detail || `Error ${res.status}`); return }

      if (data.status === 'success') {
        setPhase('done')
        setMsg('✓ LinkedIn session connected')
      } else if (data.session_id) {
        setSessionId(data.session_id)
        setPhase('pin')
        setMsg(data.message || 'Enter the PIN sent to your email/phone')
      } else {
        setMsg(data.message || 'Unexpected response — try again')
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  async function verifyPin() {
    if (!pin.trim()) { setMsg('PIN required'); return }
    setLoading(true)
    setMsg('')
    try {
      const res = await fetch('/api/auth/lakeb2b/linkedin-login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential_id: credId, session_id: sessionId, code: pin.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(data.detail || `Error ${res.status}`); return }
      setPhase('done')
      setMsg('✓ LinkedIn session connected')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  if (phase === 'done') return (
    <p className="text-xs pt-1 font-medium" style={{ color: '#22c55e' }}>✓ LinkedIn session connected</p>
  )

  if (phase === 'pin') return (
    <div className="flex flex-col gap-1.5 pt-1">
      <p className="text-xs" style={{ color: 'var(--text-3)' }}>{msg}</p>
      <input
        className="text-xs p-1.5 rounded-md focus:outline-none"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
        placeholder="6-digit PIN"
        value={pin}
        onChange={e => setPin(e.target.value)}
      />
      <button
        onClick={verifyPin}
        disabled={loading}
        className="text-xs py-1 rounded-md font-medium disabled:opacity-50"
        style={{ background: '#0A66C2', color: '#fff' }}
      >
        {loading ? 'Verifying…' : 'Verify PIN'}
      </button>
    </div>
  )

  if (phase === 'form') return (
    <div className="flex flex-col gap-1.5 pt-1">
      <p className="text-xs" style={{ color: 'var(--text-3)' }}>
        B2B Pulse logs into LinkedIn from its own server — no IP issues.
      </p>
      <input
        className="text-xs p-1.5 rounded-md focus:outline-none"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
        placeholder="LinkedIn email"
        value={email}
        onChange={e => setEmail(e.target.value)}
      />
      <input
        type="password"
        className="text-xs p-1.5 rounded-md focus:outline-none"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
        placeholder="LinkedIn password"
        value={password}
        onChange={e => setPassword(e.target.value)}
      />
      {msg && <p className="text-xs" style={{ color: '#f87171' }}>{msg}</p>}
      <div className="flex gap-1.5">
        <button
          onClick={startLogin}
          disabled={loading}
          className="flex-1 text-xs py-1 rounded-md font-medium disabled:opacity-50"
          style={{ background: '#0A66C2', color: '#fff' }}
        >
          {loading ? 'Connecting…' : 'Connect LinkedIn'}
        </button>
        <button onClick={() => setPhase('idle')} className="text-xs py-1 px-2 rounded-md"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
          Cancel
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-1 pt-1">
      <button
        onClick={() => setPhase('form')}
        className="text-xs py-1 rounded-md font-medium"
        style={{ background: '#0A66C2', color: '#fff' }}
      >
        Connect LinkedIn session
      </button>
      {msg && <p className="text-xs" style={{ color: msg.startsWith('✓') ? '#22c55e' : '#f59e0b' }}>{msg}</p>}
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
            <LakeB2BReconnect credId={parseInt(cred.fields.credential_id || '0', 10)} />
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
