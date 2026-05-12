// champiq-canvas/apps/web/src/lib/api/credentials.ts
import { req } from './req'
import type { Credential } from './types'
export type { Credential }

export const listCredentials  = () => req<Credential[]>('/api/credentials')
export const createCredential = (name: string, type: string, data: Record<string, unknown>) =>
  req<Credential>('/api/credentials', { method: 'POST', body: JSON.stringify({ name, type, data }) })
export const deleteCredential = (id: number) => req(`/api/credentials/${id}`, { method: 'DELETE' })
export const getLakeB2BWsToken = (credentialId: number) =>
  req<{ access_token: string; ws_url: string }>(`/api/auth/lakeb2b/ws-token/${credentialId}`)
