/**
 * Email Engine switcher.
 *
 * Lets the user choose which email engine ChampIQ should default to:
 *   - Emelia (today's behavior, requires a credential of type "champmail")
 *   - ChampMail-native (future native SMTP transport)
 *
 * Multi-Emelia: any number of credentials of type="champmail" can exist. The
 * user picks one as the active default. Per-workflow override stays a separate
 * concern (would live in node config).
 *
 * Backend contract: GET/PUT /api/settings — see routers/settings.py.
 */
import { useEffect, useState } from 'react'

interface AppSettings {
  default_engine_provider: string
  default_email_credential_id: number | null
  updated_at: string
}

interface ServerCredential {
  id: number
  name: string
  type: string
  created_at: string
  updated_at: string
}

const PROVIDERS: { id: string; label: string; help: string }[] = [
  {
    id: 'emelia',
    label: 'Emelia',
    help: 'Cold-email transport with native reply tracking. Pick the credential to send through below.',
  },
  {
    id: 'champmail_native',
    label: 'ChampMail (native)',
    help: 'Direct SMTP transport. Stub today — no sends will succeed; switch back to Emelia for production.',
  },
]

export function EmailEngineSection() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [credentials, setCredentials] = useState<ServerCredential[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const [sRes, cRes] = await Promise.all([
          fetch('/api/settings'),
          fetch('/api/credentials'),
        ])
        if (!sRes.ok) throw new Error(`settings: ${sRes.status}`)
        if (!cRes.ok) throw new Error(`credentials: ${cRes.status}`)
        const s = (await sRes.json()) as AppSettings
        const c = (await cRes.json()) as ServerCredential[]
        if (!alive) return
        setSettings(s)
        setCredentials(c)
      } catch (e) {
        if (!alive) return
        setError(String(e))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  async function patch(body: Partial<AppSettings>) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`save failed: ${res.status} ${await res.text()}`)
      setSettings((await res.json()) as AppSettings)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <section>
        <h2 className="text-sm font-semibold mb-3">Email Engine</h2>
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>Loading…</p>
      </section>
    )
  }

  if (!settings) {
    return (
      <section>
        <h2 className="text-sm font-semibold mb-3">Email Engine</h2>
        <p className="text-xs" style={{ color: '#dc2626' }}>{error || 'Failed to load settings.'}</p>
      </section>
    )
  }

  // Only credentials shaped like an email engine show up in the dropdown. We
  // accept "champmail" (Emelia today) and "champmail_native" (future SMTP).
  const eligible = credentials.filter((c) => c.type === 'champmail' || c.type === 'champmail_native')

  return (
    <section>
      <h2 className="text-sm font-semibold mb-3">Email Engine</h2>
      <p className="text-xs mb-4" style={{ color: 'var(--text-2)' }}>
        Choose the transport ChampIQ uses to send emails. Per-workflow overrides
        live in each node's config (no change to the canvas).
      </p>

      {/* Provider radio cards */}
      <div className="flex flex-col gap-2 mb-6">
        {PROVIDERS.map((p) => {
          const checked = settings.default_engine_provider === p.id
          return (
            <label
              key={p.id}
              className="flex gap-3 items-start p-3 rounded border cursor-pointer"
              style={{
                borderColor: checked ? '#6366f1' : 'var(--border-1)',
                background: checked ? 'rgba(99,102,241,0.08)' : 'var(--bg-1)',
              }}
            >
              <input
                type="radio"
                name="engine_provider"
                checked={checked}
                disabled={saving}
                onChange={() => void patch({ default_engine_provider: p.id })}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="text-sm font-medium">{p.label}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{p.help}</div>
              </div>
            </label>
          )
        })}
      </div>

      {/* Default credential picker — only meaningful when Emelia is the engine */}
      {settings.default_engine_provider === 'emelia' && (
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide block mb-2"
                 style={{ color: 'var(--text-2)' }}>
            Default Emelia credential
          </label>
          {eligible.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              No Emelia credentials saved yet. Add one in the Credentials section below.
            </p>
          ) : (
            <select
              value={settings.default_email_credential_id ?? ''}
              disabled={saving}
              onChange={(e) =>
                void patch({
                  default_email_credential_id: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="text-sm px-2 py-1.5 rounded border w-full max-w-md"
              style={{
                background: 'var(--bg-1)',
                color: 'var(--text-1)',
                borderColor: 'var(--border-1)',
              }}
            >
              <option value="">— pick a credential —</option>
              {eligible.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.type})
                </option>
              ))}
            </select>
          )}
          {eligible.length > 1 && (
            <p className="text-xs mt-2" style={{ color: 'var(--text-3)' }}>
              {eligible.length} email credentials saved — pick which one is the
              tenant default.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs mt-3" style={{ color: '#dc2626' }}>{error}</p>
      )}
    </section>
  )
}
