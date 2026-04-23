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
    { key: 'email', label: 'Email' },
    { key: 'password', label: 'Password', secret: true },
  ],
  champgraph: [
    { key: 'email', label: 'Email' },
    { key: 'password', label: 'Password', secret: true },
  ],
  champvoice: [
    { key: 'gateway_url', label: 'Gateway URL (champiq-voice server)', },
    { key: 'api_key', label: 'Gateway API Key (optional — X-Api-Key header)', secret: true },
    { key: 'elevenlabs_api_key', label: 'ElevenLabs API Key', secret: true },
    { key: 'agent_id', label: 'ElevenLabs Agent ID (default — can override per call)', },
    { key: 'phone_number_id', label: 'ElevenLabs Phone Number ID', },
    { key: 'canvas_webhook_secret', label: 'Canvas Webhook Secret (optional — for signature verification)', secret: true },
  ],
  lakeb2b: [
    { key: 'api_key', label: 'API Key', secret: true },
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

function saveToStorage(credentials: Credential[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials))
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
