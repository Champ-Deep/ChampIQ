/**
 * RightPanel — Node Inspector + Config Editor
 *
 * Tabs: Form (structured fields) | JSON (raw edit)
 * Tool nodes (champmail, champgraph, champvoice, lakeb2b) get action-aware
 * dynamic input sections. Credential fields show a picker populated from
 * the global CredentialStore.
 */
import { useState, useEffect } from 'react'
import { useCanvasStore } from '@/store/canvasStore'
import { useCredentialStore, TOOL_CREDENTIAL_TYPE } from '@/store/credentialStore'
import { X, Copy, Check, ChevronDown, ChevronUp } from '@/lib/icons'
import { getNodeMeta } from '@/lib/manifest'
import type { ChampIQManifest } from '@/types'

// ── Per-kind static field definitions ────────────────────────────────────────

interface FieldDef {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'json' | 'credential'
  options?: string[]
  placeholder?: string
  hint?: string
}

// For tool nodes: action → specific input fields shown when that action is selected
const ACTION_FIELDS: Record<string, Record<string, FieldDef[]>> = {
  champmail: {
    add_prospect: [
      { key: 'email', label: 'Email', type: 'text', placeholder: '{{item.email}}' },
      { key: 'first_name', label: 'First name', type: 'text', placeholder: '{{item.first_name}}' },
      { key: 'last_name', label: 'Last name', type: 'text', placeholder: '{{item.last_name}}' },
      { key: 'company', label: 'Company', type: 'text', placeholder: '{{item.company}}' },
    ],
    start_sequence: [
      { key: 'email', label: 'Prospect email', type: 'text', placeholder: '{{item.email}}' },
      { key: 'sequence_id', label: 'Sequence ID', type: 'text', placeholder: 'seq_abc123' },
    ],
    enroll_sequence: [
      { key: 'email', label: 'Prospect email', type: 'text', placeholder: '{{item.email}}' },
      { key: 'sequence_id', label: 'Sequence ID', type: 'text', placeholder: 'seq_abc123' },
    ],
    pause_sequence: [
      { key: 'email', label: 'Prospect email', type: 'text', placeholder: '{{item.email}}' },
    ],
    send_single_email: [
      { key: 'email', label: 'To email', type: 'text', placeholder: '{{item.email}}' },
      { key: 'subject', label: 'Subject', type: 'text', placeholder: 'Following up…' },
      { key: 'body', label: 'Body', type: 'textarea', placeholder: 'Hi {{item.first_name}},…' },
    ],
    get_analytics: [
      { key: 'sequence_id', label: 'Sequence ID (optional)', type: 'text' },
    ],
    list_templates: [],
  },
  champgraph: {
    ingest_prospect: [
      { key: 'email', label: 'Email', type: 'text', placeholder: '{{item.email}}' },
      { key: 'first_name', label: 'First name', type: 'text', placeholder: '{{item.first_name}}' },
      { key: 'last_name', label: 'Last name', type: 'text', placeholder: '{{item.last_name}}' },
      { key: 'company', label: 'Company', type: 'text', placeholder: '{{item.company}}' },
      { key: 'title', label: 'Title', type: 'text', placeholder: '{{item.title}}' },
    ],
    get_prospect_status: [
      { key: 'email', label: 'Email', type: 'text', placeholder: '{{item.email}}' },
    ],
    ingest_company: [
      { key: 'name', label: 'Company name', type: 'text', placeholder: '{{item.company}}' },
      { key: 'domain', label: 'Domain', type: 'text', placeholder: '{{item.domain}}' },
      { key: 'industry', label: 'Industry', type: 'text', placeholder: '{{item.industry}}' },
    ],
    semantic_search: [
      { key: 'query', label: 'Query', type: 'text', placeholder: '{{prev.search_term}}' },
      { key: 'limit', label: 'Max results', type: 'number' },
    ],
    nl_query: [
      { key: 'query', label: 'Natural-language query', type: 'textarea',
        placeholder: 'Find all prospects at enterprise companies in fintech' },
    ],
    add_relationship: [
      { key: 'from_email', label: 'From (email)', type: 'text', placeholder: '{{prev.email}}' },
      { key: 'to_email', label: 'To (email)', type: 'text', placeholder: '{{prev.target_email}}' },
      { key: 'relationship', label: 'Relationship type', type: 'text', placeholder: 'knows / colleague' },
    ],
  },
  champvoice: {
    initiate_call: [
      { key: 'agent_id', label: 'Agent ID override (optional)', type: 'text',
        placeholder: '{{item.agent_id}}', hint: 'Overrides the credential default. Leave blank to use the credential agent.' },
      { key: 'call_reason', label: 'Call reason (optional)', type: 'select',
        options: ['', 'cold_outreach', 'email_follow_up', 'sequence_completed', 'replied_follow_up'],
        hint: 'Shapes the AI agent opening. Phone, name, email and company flow in automatically from the loop.' },
    ],
    get_call_status: [
      { key: 'conversation_id', label: 'Conversation ID', type: 'text', placeholder: '{{prev.conversationId}}',
        hint: 'ElevenLabs conversation ID from initiate_call output' },
    ],
    list_calls: [],
    cancel_call: [],
  },
  lakeb2b_pulse: {
    track_page: [
      { key: 'page_url', label: 'LinkedIn URL', type: 'text', placeholder: '{{item.linkedin_url}}' },
    ],
    schedule_engagement: [
      { key: 'prospect_id', label: 'Prospect ID', type: 'text', placeholder: '{{prev.id}}' },
      { key: 'action_type', label: 'Action type', type: 'select',
        options: ['like', 'comment', 'connect', 'message'] },
      { key: 'message', label: 'Message (optional)', type: 'textarea' },
    ],
    list_posts: [
      { key: 'page_url', label: 'LinkedIn profile URL', type: 'text', placeholder: '{{item.linkedin_url}}' },
      { key: 'limit', label: 'Max posts', type: 'number' },
    ],
    get_engagement_status: [
      { key: 'prospect_id', label: 'Prospect ID', type: 'text', placeholder: '{{prev.id}}' },
    ],
  },
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
      hint: 'Examples: "0 9 * * 1-5" = weekdays 9am · "0 8 * * *" = daily 8am' },
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
    { key: 'credential', label: 'Credential', type: 'credential' },
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
      placeholder: '{{ prev.payload.items }}',
      hint: 'Must resolve to a JSON array at runtime.' },
    { key: 'concurrency', label: 'Concurrency (parallel items at once)', type: 'number' },
    { key: 'each', label: 'Per-item transform (JSON object of expressions)', type: 'textarea',
      placeholder: '{"email":"{{item.email}}","name":"{{item.name}}"}' },
    { key: 'wait_for_event', label: 'Wait for event before next item', type: 'text',
      placeholder: 'transcript.ready',
      hint: 'Loop waits for this event from the bus before processing the next item. Leave blank to fire all at once.' },
    { key: 'wait_timeout', label: 'Wait timeout (seconds)', type: 'number',
      hint: 'Max seconds to wait per item before moving on. Default: 300.' },
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
    { key: 'credential', label: 'ChampMail credential', type: 'credential' },
  ],
  // Tool nodes — defined below as combined action + credential + dynamic inputs
  'champmail': [
    { key: 'action', label: 'Action', type: 'select',
      options: ['add_prospect', 'start_sequence', 'pause_sequence', 'send_single_email',
        'get_analytics', 'list_templates', 'enroll_sequence'] },
    { key: 'credential', label: 'ChampMail credential', type: 'credential',
      hint: '⚠ Required. Add via Credentials section in the left sidebar.' },
  ],
  'champgraph': [
    { key: 'action', label: 'Action', type: 'select',
      options: ['ingest_prospect', 'get_prospect_status', 'ingest_company', 'semantic_search', 'nl_query', 'add_relationship'] },
    { key: 'credential', label: 'ChampGraph credential (optional)', type: 'credential' },
  ],
  'champvoice': [
    { key: 'action', label: 'Action', type: 'select',
      options: ['initiate_call', 'get_call_status', 'list_calls', 'cancel_call'],
      hint: 'The champiq-voice gateway routes this to ElevenLabs. No ChampServer login needed.' },
    { key: 'credential', label: 'ChampVoice credential', type: 'credential',
      hint: 'Must contain elevenlabs_api_key, agent_id, phone_number_id. Add via the Credentials panel.' },
  ],
  'lakeb2b_pulse': [
    { key: 'action', label: 'Action', type: 'select',
      options: ['track_page', 'schedule_engagement', 'list_posts', 'get_engagement_status'] },
    { key: 'credential', label: 'LakeB2B credential (optional)', type: 'credential' },
  ],
}

// Kinds that have action-aware dynamic input sections
const TOOL_KINDS_WITH_ACTIONS = new Set(['champmail', 'champgraph', 'champvoice', 'lakeb2b_pulse'])

// ── Helpers ──────────────────────────────────────────────────────────────────

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
    try { return JSON.parse(trimmed) } catch { return val }
  }
  if (type === 'select' && (val === 'true' || val === 'false')) return val === 'true'
  return val
}

// ── CredentialPicker ─────────────────────────────────────────────────────────

function CredentialPicker({ nodeKind, value, onChange }: {
  nodeKind: string
  value: string
  onChange: (v: string) => void
}) {
  const { credentials } = useCredentialStore()
  const credType = TOOL_CREDENTIAL_TYPE[nodeKind]
  const filtered = credType ? credentials.filter((c) => c.type === credType) : credentials
  const [useCustom, setUseCustom] = useState(!filtered.some((c) => c.name === value) && value !== '')

  // If stored creds list changes and current value matches one, switch to picker mode
  useEffect(() => {
    if (filtered.some((c) => c.name === value)) setUseCustom(false)
  }, [filtered.length]) // eslint-disable-line react-hooks/exhaustive-deps

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col gap-1">
        <input
          type="text"
          className="text-xs p-1.5 rounded-md focus:outline-none"
          style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
          placeholder="credential-name  (add via Credentials panel)"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    )
  }

  if (useCustom) {
    return (
      <div className="flex gap-1">
        <input
          type="text"
          className="flex-1 text-xs p-1.5 rounded-md focus:outline-none"
          style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
          placeholder="credential-name"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          className="text-xs px-2 rounded-md"
          style={{ border: '1px solid var(--border)', color: 'var(--text-3)' }}
          onClick={() => setUseCustom(false)}
        >
          Pick
        </button>
      </div>
    )
  }

  return (
    <div className="flex gap-1">
      <select
        className="flex-1 text-xs p-1.5 rounded-md focus:outline-none"
        style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
        value={value}
        onChange={(e) => {
          if (e.target.value === '__custom__') { setUseCustom(true); onChange('') }
          else onChange(e.target.value)
        }}
      >
        <option value="">— select credential —</option>
        {filtered.map((c) => (
          <option key={c.id} value={c.name}>{c.name} ({c.type})</option>
        ))}
        <option value="__custom__">── Enter custom name ──</option>
      </select>
    </div>
  )
}

// ── NodeConfigForm ────────────────────────────────────────────────────────────

function NodeConfigForm({ nodeId, kind, config }: {
  nodeId: string
  kind: string
  config: Record<string, unknown>
}) {
  const { updateNodeConfig } = useCanvasStore()
  const staticFields = KIND_FIELDS[kind] || []
  const currentAction = config.action as string | undefined

  // Derive action-specific input fields when applicable
  const actionFields: FieldDef[] = TOOL_KINDS_WITH_ACTIONS.has(kind) && currentAction
    ? (ACTION_FIELDS[kind]?.[currentAction] ?? [])
    : []

  // Flat list of all rendered fields (static + action-specific inputs section)
  // stored separately: static fields write directly to config keys,
  // action fields write into config.inputs[key]
  const [local, setLocal] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const f of staticFields) init[f.key] = configToString(config[f.key])
    const inputs = (config.inputs as Record<string, unknown>) ?? {}
    for (const f of actionFields) init[`inputs.${f.key}`] = configToString(inputs[f.key])
    return init
  })

  // Sync when node or action changes
  useEffect(() => {
    const next: Record<string, string> = {}
    for (const f of staticFields) next[f.key] = configToString(config[f.key])
    const inputs = (config.inputs as Record<string, unknown>) ?? {}
    const newActionFields = currentAction ? (ACTION_FIELDS[kind]?.[currentAction] ?? []) : []
    for (const f of newActionFields) next[`inputs.${f.key}`] = configToString(inputs[f.key])
    setLocal(next)
  }, [nodeId, kind, currentAction]) // eslint-disable-line react-hooks/exhaustive-deps

  function applyChange(key: string, rawVal: string, fieldType: FieldDef['type'], isInput: boolean) {
    setLocal((prev) => ({ ...prev, [key]: rawVal }))
    const parsed = stringToConfig(rawVal, fieldType)
    if (isInput) {
      const existingInputs = (config.inputs as Record<string, unknown>) ?? {}
      const inputKey = key.replace('inputs.', '')
      updateNodeConfig(nodeId, { ...config, inputs: { ...existingInputs, [inputKey]: parsed } })
    } else {
      updateNodeConfig(nodeId, { ...config, [key]: parsed })
    }
  }

  function renderField(field: FieldDef, isInput = false) {
    const storeKey = isInput ? `inputs.${field.key}` : field.key
    const val = local[storeKey] ?? ''

    return (
      <div key={storeKey} className="flex flex-col gap-1">
        <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>
          {field.label}
        </label>

        {field.type === 'credential' ? (
          <CredentialPicker
            nodeKind={kind}
            value={val}
            onChange={(v) => applyChange(field.key, v, 'text', false)}
          />
        ) : field.type === 'select' ? (
          <select
            className="text-xs p-1.5 rounded-md focus:outline-none"
            style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
            value={val}
            onChange={(e) => applyChange(storeKey, e.target.value, field.type, isInput)}
          >
            <option value="">— select —</option>
            {field.options?.map((o) => <option key={o} value={o}>{o || '(any)'}</option>)}
          </select>
        ) : field.type === 'textarea' ? (
          <textarea
            rows={4}
            className="text-xs p-1.5 rounded-md resize-y focus:outline-none font-mono"
            style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
            value={val}
            placeholder={field.placeholder}
            onChange={(e) => applyChange(storeKey, e.target.value, field.type, isInput)}
          />
        ) : (
          <input
            type={field.type === 'number' ? 'number' : 'text'}
            className="text-xs p-1.5 rounded-md focus:outline-none"
            style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
            value={val}
            placeholder={field.placeholder}
            onChange={(e) => applyChange(storeKey, e.target.value, field.type, isInput)}
          />
        )}

        {field.hint && (
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>{field.hint}</p>
        )}
      </div>
    )
  }

  if (staticFields.length === 0) {
    return (
      <p className="text-xs p-3" style={{ color: 'var(--text-3)' }}>
        No configurable fields for <code>{kind}</code>. Edit via the raw JSON below.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Static fields (action selector, credential picker, top-level keys) */}
      {staticFields.map((f) => renderField(f, false))}

      {/* Action-specific inputs section */}
      {actionFields.length > 0 && (
        <>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1" style={{ borderTop: '1px solid var(--border)' }} />
            <span className="text-xs uppercase tracking-wide shrink-0" style={{ color: 'var(--text-3)' }}>
              Inputs for {currentAction}
            </span>
            <div className="flex-1" style={{ borderTop: '1px solid var(--border)' }} />
          </div>
          {actionFields.map((f) => renderField(f, true))}
        </>
      )}

      {/* Fallback raw inputs for tool nodes when no action chosen or no mapped action */}
      {TOOL_KINDS_WITH_ACTIONS.has(kind) && (!currentAction || actionFields.length === 0) && (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>
            Inputs (JSON object)
          </label>
          <textarea
            rows={4}
            className="text-xs p-1.5 rounded-md resize-y focus:outline-none font-mono"
            style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
            value={configToString(config.inputs)}
            placeholder={'{"email":"{{item.email}}"}'}
            onChange={(e) => {
              const parsed = stringToConfig(e.target.value, 'textarea')
              updateNodeConfig(nodeId, { ...config, inputs: parsed })
            }}
          />
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>
            Select an action above to get structured input fields.
          </p>
        </div>
      )}
    </div>
  )
}

// ── JSON Editor tab ───────────────────────────────────────────────────────────

function JsonConfigEditor({ nodeId, config }: { nodeId: string; config: Record<string, unknown> }) {
  const { updateNodeConfig } = useCanvasStore()
  const [raw, setRaw] = useState(() => JSON.stringify(config, null, 2))
  const [error, setError] = useState('')

  // Sync when node changes externally
  useEffect(() => {
    setRaw(JSON.stringify(config, null, 2))
    setError('')
  }, [nodeId]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleBlur() {
    try {
      const parsed = JSON.parse(raw)
      updateNodeConfig(nodeId, parsed)
      setError('')
    } catch {
      setError('Invalid JSON — changes not saved')
    }
  }

  return (
    <div className="p-3 flex flex-col gap-2">
      <textarea
        rows={16}
        className="text-xs p-2 rounded-md resize-y focus:outline-none font-mono w-full"
        style={{ background: 'var(--bg-sidebar)', border: `1px solid ${error ? '#ef4444' : 'var(--border)'}`, color: 'var(--text-1)' }}
        value={raw}
        onChange={(e) => { setRaw(e.target.value); setError('') }}
        onBlur={handleBlur}
        spellCheck={false}
      />
      {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}
      <p className="text-xs" style={{ color: 'var(--text-3)' }}>
        Edit raw config JSON. Changes apply on blur (click outside the editor).
      </p>
    </div>
  )
}

// ── RightPanel ────────────────────────────────────────────────────────────────

type ConfigTab = 'form' | 'json'

export function RightPanel() {
  const { selectedNodeId, nodes, nodeRuntimeStates, setSelectedNode } = useCanvasStore()
  const [copied, setCopied] = useState(false)
  const [showRaw, setShowRaw] = useState(true)
  const [activeTab, setActiveTab] = useState<ConfigTab>('form')

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

      {/* Config tabs */}
      <div className="flex" style={{ borderBottom: '1px solid var(--border)' }}>
        {(['form', 'json'] as ConfigTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex-1 text-xs py-2 font-medium capitalize"
            style={{
              color: activeTab === tab ? 'var(--text-1)' : 'var(--text-3)',
              borderBottom: activeTab === tab ? '2px solid #6366f1' : '2px solid transparent',
            }}
          >
            {tab === 'form' ? 'Form' : 'JSON'}
          </button>
        ))}
      </div>

      {/* Config body */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'form' ? (
          <NodeConfigForm nodeId={node.id} kind={kind} config={config} />
        ) : (
          <JsonConfigEditor nodeId={node.id} config={config} />
        )}

        {/* Runtime output — always visible after execution */}
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <button
            className="w-full flex items-center justify-between px-3 py-2 text-xs"
            style={{ color: 'var(--text-3)' }}
            onClick={() => setShowRaw((v) => !v)}
          >
            <span className="font-medium" style={{ color: runtime?.output ? 'var(--text-1)' : 'var(--text-3)' }}>
              {runtime?.output ? '✓ Runtime output (JSON)' : 'Runtime output (JSON)'}
            </span>
            {showRaw ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {showRaw && (
            <pre
              className="text-xs px-3 pb-3 overflow-x-auto whitespace-pre-wrap break-words"
              style={{ color: 'var(--text-1)', maxHeight: 400, overflowY: 'auto' }}
            >
              {runtime?.output
                ? JSON.stringify(runtime.output, null, 2)
                : '// No output yet — run the workflow first'}
            </pre>
          )}
        </div>
      </div>
    </aside>
  )
}
