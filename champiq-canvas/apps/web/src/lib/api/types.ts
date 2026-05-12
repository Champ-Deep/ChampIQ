// champiq-canvas/apps/web/src/lib/api/types.ts

export interface Prospect {
  id: number
  email: string
  first_name: string | null
  last_name: string | null
  full_name: string | null
  company: string | null
  role: string | null
  status: 'ready' | 'needs_review' | 'invalid' | 'enrolled' | 'replied' | 'unsubscribed'
  score?: number
  signal?: string | null
  sequence_name?: string | null
  created_at: string
}

export interface ProspectListResponse {
  items: Prospect[]
  total: number
  limit: number
  offset: number
}

export interface Sequence {
  id: number
  name: string
  created_at: string
}

export interface Template {
  id: number
  name: string
  subject: string
  body_html: string
  body_text: string | null
  created_at: string
}

export interface Sender {
  id: number
  email: string
  name: string | null
  daily_cap: number
  sends_today: number
  disabled: boolean
}

export interface Workflow {
  id: number
  name: string
  active: boolean
  nodes: unknown[]
  edges: unknown[]
  triggers: unknown
  version: number
  updated_at: string
}

export interface Execution {
  id: string
  workflow_id: number
  trigger_kind: string
  status: 'running' | 'success' | 'error' | 'cancelled'
  started_at: string
  finished_at: string | null
}

export interface NodeRun {
  id: string
  execution_id: string
  node_id: string
  status: 'running' | 'success' | 'error' | 'skipped'
  input: unknown
  output: unknown
  error: string | null
  started_at: string
  finished_at: string | null
}

export interface Credential {
  id: number
  name: string
  type: string
  created_at: string
}

export interface ToolJob {
  job_id: string
  status: 'pending' | 'running' | 'success' | 'error'
  progress: number
  result: Record<string, unknown> | null
}

export interface CanvasState {
  nodes: unknown[]
  edges: unknown[]
  updated_at: string
}

export interface TemplatePreview {
  subject: string
  body_html: string
  body_text: string | null
}
