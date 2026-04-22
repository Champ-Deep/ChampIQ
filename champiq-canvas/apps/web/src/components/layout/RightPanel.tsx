/**
 * RightPanel — Node Inspector + Manual Config Editor
 *
 * Every node kind gets a human-readable form for its config fields.
 * Changes are applied immediately to the canvas store.
 */
import { useState, useEffect } from 'react'
import { useCanvasStore } from '@/store/canvasStore'
import { X, Copy, Check, ChevronDown, ChevronUp } from '@/lib/icons'
import { getNodeMeta } from '@/lib/manifest'
import type { ChampIQManifest } from '@/types'

// ── Per-kind config field definitions ──────────────────────────────────────

interface FieldDef {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'json'
  options?: string[]
  placeholder?: string
  hint?: string
}

const KIND_FIELDS: Record<string, FieldDef[]> = {
  'trigger.manual': [
    { key: 'label', label: 'Trigger label', type: 'text', placeholder: 'Run workflow' },
    { key: 'items', label: 'Input items (JSON array or leave blank)', type: 'textarea',
      placeholder: '[{"email":"a@b.com","name":"Alice"},...]',
      hint: 'Paste a JSON array or upload a CSV via the chat panel.' },
  ],
  'trigger.webhook': [
    { key: 'path', label: 'Webhook path', type: 'text', placeholder: '/hooks/my-event' },
    { key: 'secret', label: 'Signing secret (optional)', type: 'text' },
  ],
  'trigger.cron': [
    { key: 'cron', label: 'Cron expression', type: 'text', placeholder: '0 9 * * 1-5',
      hint: 'Examples: "0 9 * * 1-5" = weekdays 9am, "0 8 * * *" = daily 8am' },
    { key: 'timezone', label: 'Timezone', type: 'text', placeholder: 'UTC' },
  ],
  'trigger.event': [
    { key: 'event', label: 'Event name', type: 'text', placeholder: 'email.replied' },
    { key: 'source', label: 'Source tool (optional)', type: 'text', placeholder: 'champmail' },
  ],
  'http': [
    { key: 'url', label: 'URL', type: 'text', placeholder: 'https://api.example.com/endpoint' },
    { key: 'method', label: 'Method', type: 'select', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
    { key: 'headers', label: 'Headers (JSON object)', type: 'textarea',
      placeholder: '{"Authorization":"Bearer {{credential.token}}"}' },
    { key: 'body', label: 'Body (JSON or text)', type: 'textarea',
      placeholder: '{"text":"{{prev.message}}"}' },
    { key: 'credential', label: 'Credential name (optional)', type: 'text' },
  ],
  'set': [
    { key: 'fields', label: 'Fields (JSON object — keys = output fields, values = expressions)',
      type: 'textarea', placeholder: '{"email":"{{prev.email}}","name":"{{prev.first}} {{prev.last}}"}' },
  ],
  'merge': [
    { key: 'mode', label: 'Merge mode', type: 'select', options: ['all', 'first'] },
  ],
  'if': [
    { key: 'condition', label: 'Condition expression', type: 'text',
      placeholder: '{{ prev.tier }} == "enterprise"',
      hint: 'Emits branch "true" or "false" downstream.' },
  ],
  'switch': [
    { key: 'value', label: 'Value expression', type: 'text', placeholder: '{{ prev.status }}' },
    { key: 'cases', label: 'Cases (JSON array: [{match,branch}])', type: 'textarea',
      placeholder: '[{"match":"positive","branch":"positive"},{"match":"negative","branch":"negative"}]' },
    { key: 'default_branch', label: 'Default branch name', type: 'text', placeholder: 'other' },
  ],
  'loop': [
    { key: 'items', label: 'Items expression', type: 'text',
      placeholder: '{{ trigger.payload.items }}',
      hint: 'Must resolve to a JSON array at runtime.' },
    { key: 'concurrency', label: 'Concurrency (parallel items at once)', type: 'number' },
    { key: 'each', label: 'Per-item transform (JSON object of expressions)', type: 'textarea',
      placeholder: '{"email":"{{item.email}}","name":"{{item.name}}"}' },
  ],
  'split': [
    { key: 'mode', label: 'Split mode', type: 'select', options: ['fixed_n', 'fan_out'],
      hint: '"fixed_n" distributes items evenly. "fan_out" sends full list to each branch.' },
    { key: 'n', label: 'Number of branches', type: 'number' },
    { key: 'items', label: 'Items expression', type: 'text', placeholder: '{{ prev.records }}' },
  ],
  'wait': [
    { key: 'seconds', label: 'Wait duration (seconds)', type: 'number',
      hint: '3600 = 1h · 86400 = 1 day · 259200 = 3 days' },
  ],
  'code': [
    { key: 'expression', label: 'Python expression', type: 'textarea',
      placeholder: '{"result": [r for r in prev["records"] if r.get("tier") == "enterprise"]}' },
  ],
  'llm': [
    { key: 'prompt', label: 'Prompt', type: 'textarea',
      placeholder: 'Write a personalised 1-sentence opener for {{item.name}} at {{item.company}}.' },
    { key: 'system', label: 'System prompt (optional)', type: 'textarea' },
    { key: 'json_mode', label: 'JSON mode', type: 'select', options: ['false', 'true'] },
    { key: 'model', label: 'Model override (optional)', type: 'text', placeholder: 'anthropic/claude-3-haiku' },
  ],
  'champmail_reply': [
    { key: 'credential', label: 'ChampMail credential name', type: 'text', placeholder: 'champmail-admin' },
  ],
  'champmail': [
    { key: 'action', label: 'Action', type: 'select',
      options: ['add_prospect', 'start_sequence', 'pause_sequence', 'send_single_email',
        'get_analytics', 'list_templates', 'enroll_sequence'] },
    { key: 'credential', label: 'ChampMail credential name', type: 'text',
      placeholder: 'champmail-admin',
      hint: '⚠ Required. Add via Credentials button in chat panel.' },
    { key: 'inputs', label: 'Inputs (JSON object of field → expression mappings)', type: 'textarea',
      placeholder: '{"email":"{{item.email}}","sequence_id":"seq_abc123"}' },
  ],
  'champgraph': [
    { key: 'action', label: 'Action', type: 'select',
      options: ['ingest_prospect', 'ingest_company', 'semantic_search', 'nl_query', 'add_relationship'] },
    { key: 'credential', label: 'ChampGraph credential name (optional)', type: 'text' },
    { key: 'inputs', label: 'Inputs (JSON object)', type: 'textarea',
      placeholder: '{"query":"{{prev.search_term}}"}' },
  ],
  'lakeb2b_pulse': [
    { key: 'action', label: 'Action', type: 'select',
      options: ['track_page', 'schedule_engagement', 'list_posts', 'get_engagement_status'] },
    { key: 'credential', label: 'LakeB2B credential name (optional)', type: 'text' },
    { key: 'inputs', label: 'Inputs (JSON object)', type: 'textarea',
      placeholder: '{"page_url":"{{item.linkedin_url}}"}' },
  ],
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getKind(nodeData: Record<string, unknown>): string {
  return (nodeData.kind as string)
    || (nodeData.toolId as string)
    || (nodeData.type as string)
    || 'unknown'
}

function configToString(val: unknown): string {
  if (val === null || val === undefined) return ''
  if (typeof val === 'string') return val
  return JSON.stringify(val, null, 2)
}

function stringToConfig(val: string, type: FieldDef['type']): unknown {
  if (type === 'number') return val === '' ? undefined : Number(val)
  if (type === 'json' || type === 'textarea') {
    const trimmed = val.trim()
    if (!trimmed) return undefined
    try { return JSON.parse(trimmed) } catch { return val }  // keep raw string if invalid JSON
  }
  if (type === 'select' && (val === 'true' || val === 'false')) return val === 'true'
  return val
}

// ── NodeConfigForm ───────────────────────────────────────────────────────────

function NodeConfigForm({ nodeId, kind, config }: {
  nodeId: string
  kind: string
  config: Record<string, unknown>
}) {
  const { updateNodeConfig } = useCanvasStore()
  const fields = KIND_FIELDS[kind] || []
  const [local, setLocal] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const f of fields) init[f.key] = configToString(config[f.key])
    return init
  })

  // Sync if node changes externally
  useEffect(() => {
    const next: Record<string, string> = {}
    for (const f of fields) next[f.key] = configToString(config[f.key])
    setLocal(next)
  }, [nodeId, kind]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleChange(key: string, rawVal: string, fieldType: FieldDef['type']) {
    setLocal((prev) => ({ ...prev, [key]: rawVal }))
    const parsed = stringToConfig(rawVal, fieldType)
    const next = { ...config, [key]: parsed }
    updateNodeConfig(nodeId, next)
  }

  if (fields.length === 0) {
    return (
      <p className="text-xs p-3" style={{ color: 'var(--text-3)' }}>
        No configurable fields for <code>{kind}</code>. Edit via the raw JSON below.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      {fields.map((field) => (
        <div key={field.key} className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>
            {field.label}
          </label>
          {field.type === 'select' ? (
            <select
              className="text-xs p-1.5 rounded-md focus:outline-none"
              style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
              value={local[field.key] ?? ''}
              onChange={(e) => handleChange(field.key, e.target.value, field.type)}
            >
              <option value="">— select —</option>
              {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : field.type === 'textarea' ? (
            <textarea
              rows={4}
              className="text-xs p-1.5 rounded-md resize-y focus:outline-none font-mono"
              style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
              value={local[field.key] ?? ''}
              placeholder={field.placeholder}
              onChange={(e) => handleChange(field.key, e.target.value, field.type)}
            />
          ) : (
            <input
              type={field.type === 'number' ? 'number' : 'text'}
              className="text-xs p-1.5 rounded-md focus:outline-none"
              style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
              value={local[field.key] ?? ''}
              placeholder={field.placeholder}
              onChange={(e) => handleChange(field.key, e.target.value, field.type)}
            />
          )}
          {field.hint && (
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>{field.hint}</p>
          )}
        </div>
      ))}
    </div>
  )
}

// ── RightPanel ───────────────────────────────────────────────────────────────

export function RightPanel() {
  const { selectedNodeId, nodes, nodeRuntimeStates, setSelectedNode } = useCanvasStore()
  const [copied, setCopied] = useState(false)
  const [showRaw, setShowRaw] = useState(false)

  const node = nodes.find((n) => n.id === selectedNodeId)
  if (!node) return null

  const manifest = node.data.manifest as ChampIQManifest | undefined
  const label = manifest
    ? getNodeMeta(manifest).label
    : ((node.data?.kind as string | undefined) ?? (node.data?.label as string | undefined) ?? 'Node')

  const kind = getKind(node.data as Record<string, unknown>)
  const config = (node.data?.config as Record<string, unknown>) ?? {}
  const runtime = nodeRuntimeStates[selectedNodeId!]
  const jsonText = JSON.stringify({ config, runtime: runtime ?? {} }, null, 2)

  async function handleCopy() {
    await navigator.clipboard.writeText(jsonText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <aside
      className="w-80 shrink-0 flex flex-col overflow-hidden"
      style={{ background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)' }}
      aria-label="Node inspector"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-1)' }}>
            {label}
          </span>
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>{kind}</span>
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={handleCopy} className="p-1 rounded" style={{ color: 'var(--text-3)' }} aria-label="Copy config JSON">
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <button onClick={() => setSelectedNode(null)} className="p-1 rounded" style={{ color: 'var(--text-3)' }} aria-label="Close inspector">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Status */}
      <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Status: </span>
        <span className="text-xs capitalize" style={{ color: 'var(--text-1)' }}>
          {runtime?.status ?? 'idle'}
        </span>
        {runtime?.error && (
          <p className="text-xs mt-1 p-1.5 rounded" style={{ background: '#7f1d1d33', color: '#fca5a5' }}>
            {runtime.error}
          </p>
        )}
      </div>

      {/* Config form */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-3)' }}>
            Configuration
          </p>
        </div>

        <NodeConfigForm nodeId={node.id} kind={kind} config={config} />

        {/* Raw output toggle */}
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <button
            className="w-full flex items-center justify-between px-3 py-2 text-xs"
            style={{ color: 'var(--text-3)' }}
            onClick={() => setShowRaw((v) => !v)}
          >
            <span>Raw JSON (config + output)</span>
            {showRaw ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {showRaw && (
            <pre
              className="text-xs px-3 pb-3 overflow-x-auto whitespace-pre-wrap break-words"
              style={{ color: 'var(--text-1)', maxHeight: 300, overflowY: 'auto' }}
            >
              {jsonText}
            </pre>
          )}
        </div>

        {/* Runtime output preview */}
        {runtime?.output && (
          <div className="px-3 pb-3">
            <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>Last output preview</p>
            <pre className="text-xs rounded p-2 overflow-x-auto whitespace-pre-wrap break-words"
              style={{ background: 'var(--bg-sidebar)', color: 'var(--text-1)', maxHeight: 200, overflowY: 'auto' }}>
              {JSON.stringify(runtime.output, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </aside>
  )
}
