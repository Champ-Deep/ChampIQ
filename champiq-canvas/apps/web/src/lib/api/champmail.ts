// champiq-canvas/apps/web/src/lib/api/champmail.ts
import { req } from './req'
import type { Prospect, ProspectListResponse, Sequence, Template, Sender, TemplatePreview } from './types'

export type { Prospect, ProspectListResponse, Sequence, Template, Sender, TemplatePreview }

export function cmListProspects(
  params: { limit?: number; offset?: number; status?: string; search?: string } = {}
): Promise<ProspectListResponse> {
  const qs = new URLSearchParams()
  if (params.limit)  qs.set('limit',  String(params.limit))
  if (params.offset) qs.set('offset', String(params.offset))
  if (params.status) qs.set('status', params.status)
  if (params.search) qs.set('search', params.search)
  const tail = qs.toString() ? `?${qs.toString()}` : ''
  return req<ProspectListResponse>(`/api/champmail/prospects${tail}`)
}

export const cmCreateProspect  = (body: Omit<Prospect, 'id' | 'created_at'>) =>
  req<Prospect>('/api/champmail/prospects', { method: 'POST', body: JSON.stringify(body) })

export const cmDeleteProspect  = (id: number) =>
  req(`/api/champmail/prospects/${id}`, { method: 'DELETE' })

export const cmListSequences   = () => req<Sequence[]>('/api/champmail/sequences')
export const cmCreateSequence  = (body: { name: string }) =>
  req<Sequence>('/api/champmail/sequences', { method: 'POST', body: JSON.stringify(body) })
export const cmDeleteSequence  = (id: number) =>
  req(`/api/champmail/sequences/${id}`, { method: 'DELETE' })

export const cmListTemplates   = () => req<Template[]>('/api/champmail/templates')
export const cmCreateTemplate  = (body: { name: string; subject: string; body_html: string; body_text?: string }) =>
  req<Template>('/api/champmail/templates', { method: 'POST', body: JSON.stringify(body) })
export const cmUpdateTemplate  = (id: number, body: Partial<Template>) =>
  req<Template>(`/api/champmail/templates/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
export const cmDeleteTemplate  = (id: number) =>
  req(`/api/champmail/templates/${id}`, { method: 'DELETE' })
export const cmPreviewTemplate = (template_id: number, variables: Record<string, unknown> = {}) =>
  req<TemplatePreview>('/api/champmail/templates/preview', {
    method: 'POST', body: JSON.stringify({ template_id, variables })
  })

export const cmListSenders = () => req<Sender[]>('/api/champmail/senders')
