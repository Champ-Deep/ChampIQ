import { create } from 'zustand'

export type CredentialType = 'champmail' | 'champgraph' | 'champvoice' | 'lakeb2b' | 'http' | 'generic'

export interface Credential {
  id: string
  name: string
  type: CredentialType
  fields: Record<string, string>
  createdAt: string
}

// Field definitions for each credential type shown in the add form.
// Actual secret values are stored here only for reference — the API resolves them.
export const CREDENTIAL_TYPE_FIELDS: Record<CredentialType, { key: string; label: string; secret?: boolean }[]> = {
  champmail: [
    // Legacy fields — the modern flow is the "Connect Emelia" wizard which
    // posts {api_key, default_sender_id} server-side. These keys still appear
    // on credentials migrated from the VPS era.
    { key: 'api_key', label: 'Emelia API Key', secret: true },
    { key: 'default_sender_id', label: 'Default Emelia provider id (optional)' },
  ],
  champgraph: [
    { key: 'email', label: 'Email' },
    { key: 'password', label: 'Password', secret: true },
  ],
  champvoice: [
    { key: 'elevenlabs_api_key', label: 'ElevenLabs API Key', secret: true },
    { key: 'agent_id', label: 'ElevenLabs Agent ID', },
    { key: 'phone_number_id', label: 'ElevenLabs Phone Number ID', },
    { key: 'canvas_webhook_secret', label: 'Webhook Secret (optional — for signature verification)', secret: true },
  ],
  lakeb2b: [
    // Fields managed by the LakeB2B login flow — not manually entered
    { key: 'credential_id', label: 'Server Credential ID (auto-filled)' },
  ],
  http: [
    { key: 'token', label: 'Bearer Token', secret: true },
    { key: 'header_name', label: 'Header name (optional)', },
  ],
  generic: [
    { key: 'value', label: 'Secret value', secret: true },
  ],
}

// Tool kind → credential type mapping (for filtering the picker in RightPanel)
export const TOOL_CREDENTIAL_TYPE: Record<string, CredentialType> = {
  champmail: 'champmail',
  champmail_reply: 'champmail',
  champgraph: 'champgraph',
  champvoice: 'champvoice',
  lakeb2b_pulse: 'lakeb2b',
  http: 'http',
}

const STORAGE_KEY = 'champiq:credentials'

function loadFromStorage(): Credential[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Credential[]) : []
  } catch {
    return []
  }
}

// Guarded localStorage write. Browsers cap localStorage at ~5 MB and
// silently throw QuotaExceededError when full. Without a catch the credential
// add/delete UI would just stop working with no visible error. We log and
// surface a console warning; once we have a toast system this should
// surface as a user-visible warning too.
function saveToStorage(credentials: Credential[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials))
  } catch (err) {
    // QuotaExceededError, SecurityError (private mode), or anything else.
    console.error(
      '[credentialStore] failed to persist credentials to localStorage — ' +
      'changes will not survive a refresh',
      err,
    )
  }
}

interface CredentialStore {
  credentials: Credential[]
  addCredential: (name: string, type: CredentialType, fields: Record<string, string>) => Credential
  deleteCredential: (id: string) => void
  updateCredential: (id: string, fields: Record<string, string>) => void
  getByType: (type: CredentialType) => Credential[]
  getByName: (name: string) => Credential | undefined
}

export const useCredentialStore = create<CredentialStore>((set, get) => ({
  credentials: loadFromStorage(),

  addCredential: (name, type, fields) => {
    const cred: Credential = {
      id: crypto.randomUUID(),
      name,
      type,
      fields,
      createdAt: new Date().toISOString(),
    }
    set((s) => {
      const updated = [...s.credentials, cred]
      saveToStorage(updated)
      return { credentials: updated }
    })
    return cred
  },

  deleteCredential: (id) => {
    set((s) => {
      const updated = s.credentials.filter((c) => c.id !== id)
      saveToStorage(updated)
      return { credentials: updated }
    })
  },

  updateCredential: (id, fields) => {
    set((s) => {
      const updated = s.credentials.map((c) => c.id === id ? { ...c, fields } : c)
      saveToStorage(updated)
      return { credentials: updated }
    })
  },

  getByType: (type) => get().credentials.filter((c) => c.type === type),
  getByName: (name) => get().credentials.find((c) => c.name === name),
}))
