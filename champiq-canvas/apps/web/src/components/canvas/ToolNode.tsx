import { useState, useEffect } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import Form from '@rjsf/core'
import validator from '@rjsf/validator-ajv8'
import { resolveIcon, X } from '@/lib/icons'
import { useCanvasStore } from '@/store/canvasStore'
import { useExecutionStore } from '@/store/executionStore'
import {
  getNodeMeta,
  getRestAction,
  getConfigSchema,
  getPopulateEndpoints,
  getToolId,
  isV2,
} from '@/lib/manifest'
import { api } from '@/lib/api'
import type { ChampIQManifest, NodeStatus } from '@/types'
import { useJobPolling } from '@/hooks/useJobPolling'
import { Icon, type IconName } from '@/components/atoms'

// ── Kind metadata ──────────────────────────────────────────────────────────
const KIND_META: Record<string, { label: string; color: string; icon: string }> = {
  'trigger.manual':  { label: 'Manual Trigger',  color: '#10b981', icon: 'play_node' },
  'trigger.webhook': { label: 'Webhook Trigger', color: '#10b981', icon: 'webhook' },
  'trigger.cron':    { label: 'Cron Schedule',   color: '#10b981', icon: 'cron' },
  'trigger.event':   { label: 'Event Trigger',   color: '#10b981', icon: 'bolt' },
  'http':            { label: 'HTTP Request',     color: '#8b5cf6', icon: 'webhook' },
  'set':             { label: 'Set / Map',        color: '#06b6d4', icon: 'set' },
  'merge':           { label: 'Merge',            color: '#06b6d4', icon: 'layers' },
  'if':              { label: 'If / Branch',      color: '#f59e0b', icon: 'if_node' },
  'switch':          { label: 'Switch',           color: '#f59e0b', icon: 'branch' },
  'loop':            { label: 'Loop',             color: '#f59e0b', icon: 'loop' },
  'split':           { label: 'Split / A-B',      color: '#f59e0b', icon: 'branch' },
  'wait':            { label: 'Wait',             color: '#6b7280', icon: 'timer' },
  'code':            { label: 'Code',             color: '#6b7280', icon: 'code' },
  'llm':             { label: 'LLM',              color: '#8b5cf6', icon: 'sparkle' },
  'champmail_reply': { label: 'Reply Classifier', color: '#f97316', icon: 'mail' },
  'champmail':       { label: 'ChampMail',        color: '#f97316', icon: 'mail' },
  'champgraph':      { label: 'ChampGraph',       color: '#14b8a6', icon: 'graph' },
  'champvoice':      { label: 'ChampVoice',       color: '#3b82f6', icon: 'voice' },
  'lakeb2b_pulse':   { label: 'LakeB2B Pulse',   color: '#ec4899', icon: 'bolt' },
}

// ── Status styles (left-border treatment per execution state) ──────────────
const STATE_STYLES: Record<string, React.CSSProperties> = {
  idle:       { borderLeft: '3px solid var(--border-2)' },
  running:    { borderLeft: '3px solid var(--warn)', animation: 'node-pulse 1.5s ease-in-out infinite' },
  success:    { borderLeft: '3px solid var(--success)', animation: 'node-success-pop 400ms var(--ease-spring)' },
  error:      { borderLeft: '3px solid var(--danger)' },
  suggesting: { borderLeft: '3px dashed var(--mint-2)', animation: 'dash-flow 1.2s linear infinite' },
}

// ── Kind → accent color ────────────────────────────────────────────────────
function kindColor(kind: string): string {
  const COLORS: Record<string, string> = {
    'trigger.manual': '#10b981', 'trigger.cron': '#10b981',
    'trigger.webhook': '#10b981', 'trigger.event': '#10b981',
    'csv.upload': '#06b6d4', 'set': '#06b6d4', 'merge': '#06b6d4',
    'if': '#f59e0b', 'switch': '#f59e0b', 'loop': '#f59e0b',
    'split': '#f59e0b', 'wait': '#6b7280', 'code': '#6b7280',
    'http': '#8b5cf6', 'llm': '#8b5cf6',
    'champmail': '#f97316', 'champgraph': '#14b8a6',
    'champvoice': '#3b82f6', 'lakeb2b_pulse': '#ec4899',
  }
  return COLORS[kind] ?? '#7C5CFF'
}

// ── Kind → icon name ───────────────────────────────────────────────────────
function kindToIcon(kind: string): IconName {
  const MAP: Record<string, IconName> = {
    'trigger.manual': 'play_node', 'trigger.cron': 'cron',
    'trigger.webhook': 'webhook', 'trigger.event': 'bolt',
    'csv.upload': 'db', 'set': 'set', 'merge': 'layers',
    'if': 'if_node', 'switch': 'branch', 'loop': 'loop',
    'split': 'branch', 'wait': 'timer', 'code': 'code',
    'http': 'webhook', 'llm': 'sparkle',
    'champmail': 'mail', 'champgraph': 'graph',
    'champvoice': 'voice', 'lakeb2b_pulse': 'bolt',
  }
  return MAP[kind] ?? 'layers'
}

function configSummary(config: Record<string, unknown>, kind: string): string | null {
  if (!config) return null
  if (kind === 'if') return config.condition ? `if ${String(config.condition).slice(0, 32)}` : null
  if (kind === 'loop') return config.items ? `loop: ${String(config.items).slice(0, 32)}` : null
  if (kind === 'split') return `split into ${config.n ?? 2} branches`
  if (kind === 'wait') return config.seconds ? `wait ${config.seconds}s` : null
  if (kind.startsWith('trigger.cron')) return config.cron ? String(config.cron) : null
  if (kind === 'champmail')     return config.action ? `action: ${config.action}` : 'No action selected'
  if (kind === 'champgraph')    return config.action ? `action: ${config.action}` : 'No action selected'
  if (kind === 'champvoice')    return config.action ? `action: ${config.action}` : 'No action selected'
  if (kind === 'lakeb2b_pulse') return config.action ? `action: ${config.action}` : 'No action selected'
  if (kind === 'http') return config.url ? String(config.url).slice(0, 35) : null
  if (kind === 'llm') return config.prompt ? String(config.prompt).slice(0, 35) + '…' : null
  return null
}

// Kept for LegacyFormNode status dot
const STATUS_DOT: Record<NodeStatus, { color: string; glow?: string; pulse?: boolean }> = {
  idle:    { color: '#525C7A' },
  running: { color: '#FFD23F', glow: '#FFD23F', pulse: true },
  success: { color: '#4ADE80', glow: '#4ADE80' },
  error:   { color: '#FF4D6D', glow: '#FF4D6D' },
}

export function ToolNode(props: NodeProps) {
  const { data } = props
  const manifest = data.manifest as ChampIQManifest | undefined
  const kind = (data.kind as string | undefined) ?? (data.toolId as string | undefined)

  if (!manifest || isV2(manifest)) {
    return <SimpleNode {...props} />
  }
  return <LegacyFormNode {...props} manifest={manifest} kindHint={kind} />
}

// ── SimpleNode — Frame-style 200px card ───────────────────────────────────
function SimpleNode({ id, data, selected }: NodeProps) {
  const manifest = data.manifest as ChampIQManifest | undefined
  const kind = (data.kind as string | undefined) ?? (data.toolId as string | undefined) ?? 'unknown'

  const runtimeState = useExecutionStore(s => s.nodeRuntimeStates[id])
  const { setSelectedNode } = useCanvasStore()
  const status = (runtimeState?.status ?? 'idle') as string
  const config = (data.config as Record<string, unknown>) ?? {}

  const color = kindColor(kind)

  const isSplit = kind === 'split'
  const splitN = isSplit ? Math.max(Number(config.n ?? 2), 2) : 0
  const isRootTrigger = kind.startsWith('trigger.')

  // Derive label: manifest takes priority, then data fields
  const metaLabel = manifest
    ? getNodeMeta(manifest).label
    : (data.label as string) ?? KIND_META[kind]?.label ?? kind

  const STATUS_TEXT: Record<string, string> = {
    running: 'Running…',
    success: 'Done',
    error: 'Error',
    suggesting: 'Pixie suggests',
  }

  return (
    <div
      onDoubleClick={() => setSelectedNode(id)}
      title="Double-click to open settings"
      style={{
        width: 200, minHeight: 84,
        background: 'var(--bg-1)', border: '1px solid var(--border-2)',
        borderRadius: 12, padding: '10px 12px',
        cursor: 'pointer', position: 'relative',
        boxShadow: selected ? `0 0 0 2px var(--accent-2), 0 0 24px -4px rgba(var(--accent-2-rgb),.4)` : 'none',
        transition: 'box-shadow .18s var(--ease-swift)',
        ...(STATE_STYLES[status] ?? STATE_STYLES.idle),
      }}
    >
      {!isRootTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          style={{
            width: 12, height: 12, borderRadius: '50%',
            background: 'var(--bg-3)',
            border: `2px solid var(--border-2)`,
          }}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: status !== 'idle' ? 6 : 0 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7, flexShrink: 0,
          background: `color-mix(in oklch, ${color} 22%, transparent)`,
          color: color, display: 'grid', placeItems: 'center',
        }}>
          <Icon name={kindToIcon(kind)} size={14} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.12em',
            textTransform: 'uppercase', color: 'var(--text-4)',
          }}>
            {(data.kindLabel as string) ?? kind}
          </div>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 12.5, fontWeight: 600,
            color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {(data.label as string) ?? (data.name as string) ?? metaLabel}
          </div>
        </div>
      </div>

      {status !== 'idle' && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.08em',
          color: ({ running: 'var(--warn)', success: 'var(--success)', error: 'var(--danger)', suggesting: 'var(--mint-2)' } as Record<string, string>)[status] ?? 'var(--text-3)',
        }}>
          {STATUS_TEXT[status] ?? status}
        </div>
      )}

      {isSplit
        ? Array.from({ length: splitN }, (_, i) => (
            <Handle
              key={`branch_${i}`}
              id={`branch_${i}`}
              type="source"
              position={Position.Right}
              style={{ top: `${20 + (i * 60 / (splitN - 1 || 1))}%`, background: '#ec4899', width: 9, height: 9 }}
            />
          ))
        : <Handle
            type="source"
            position={Position.Right}
            style={{
              width: 12, height: 12, borderRadius: '50%',
              background: 'var(--bg-3)',
              border: `2px solid var(--border-2)`,
            }}
          />
      }
    </div>
  )
}

// ── LegacyFormNode — v1 manifest with RJSF form ───────────────────────────
function LegacyFormNode({
  id, data, selected, manifest,
}: NodeProps & { manifest: ChampIQManifest; kindHint?: string }) {
  const meta = getNodeMeta(manifest)
  const action = getRestAction(manifest)
  const configSchema = getConfigSchema(manifest)
  const populateEndpoints = getPopulateEndpoints(manifest)

  const { nodeRuntimeStates, setNodeRuntime, addLog } = useExecutionStore()
  const { updateNodeConfig, setSelectedNode } = useCanvasStore()
  const runtime = nodeRuntimeStates[id] ?? { status: 'idle' as NodeStatus }

  const [collapsed, setCollapsed] = useState(false)
  const [populateData, setPopulateData] = useState<Record<string, unknown[]>>({})
  const [formData, setFormData] = useState<Record<string, unknown>>(
    (data.config as Record<string, unknown>) ?? {}
  )

  const IconComponent = resolveIcon(meta.icon)
  const statusDot = STATUS_DOT[runtime.status as NodeStatus] ?? STATUS_DOT.idle
  const color = meta.color

  useEffect(() => {
    const toolId = getToolId(manifest)
    for (const key of Object.keys(populateEndpoints)) {
      api.getPopulateData(toolId, key).then((items) => {
        setPopulateData((prev) => ({ ...prev, [key]: items }))
      }).catch(() => {})
    }
  }, [manifest]) // eslint-disable-line react-hooks/exhaustive-deps

  const uiSchema: Record<string, unknown> = {}
  if (configSchema) {
    for (const [fieldKey, fieldDef] of Object.entries(configSchema.properties ?? {})) {
      const ext = (fieldDef as Record<string, unknown>)['x-champiq-field'] as
        | { widget: string; populate_from?: string }
        | undefined
      if (!ext) continue
      const entry: Record<string, unknown> = {}
      if (ext.widget === 'select' && ext.populate_from && populateData[ext.populate_from]) {
        const opts = populateData[ext.populate_from] as Array<{ value: string; label: string } | string>
        entry['ui:widget'] = 'select'
        entry['ui:options'] = {
          enumOptions: opts.map((o) => (typeof o === 'string' ? { value: o, label: o } : o)),
        }
      } else if (ext.widget === 'number') {
        entry['ui:widget'] = 'updown'
      }
      uiSchema[fieldKey] = entry
    }
  }

  useJobPolling(runtime.jobId, id, getToolId(manifest))

  useEffect(() => {
    if (runtime.pendingRun) {
      setNodeRuntime(id, { pendingRun: false })
      handleAction()
    }
  }, [runtime.pendingRun]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAction() {
    if (!action) return
    const toolId = getToolId(manifest)
    const actionPath = action.endpoint.split('/').pop()!
    setNodeRuntime(id, { status: 'running' })
    addLog({ nodeId: id, nodeName: meta.label, status: 'running', message: `${meta.label}: ${action.button_label}` })
    try {
      const inputPayload = runtime.inputPayload ?? {}
      const result = await api.runAction(toolId, actionPath, { ...inputPayload, config: formData })
      setNodeRuntime(id, { jobId: result.job_id })
    } catch (err) {
      setNodeRuntime(id, { status: 'error', error: String(err) })
      addLog({ nodeId: id, nodeName: meta.label, status: 'error', message: String(err) })
    }
  }

  const outputRecords = runtime.output
    ? ((runtime.output as Record<string, unknown>).records as unknown[] | undefined)
    : null
  const preview = outputRecords
    ? outputRecords.slice(0, 3).map((r) => JSON.stringify(r)).join('\n')
    : null

  return (
    <div
      style={{
        width: 240,
        background: 'var(--bg-2)',
        border: `1px solid ${selected ? color : 'var(--border-1)'}`,
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: selected
          ? `0 0 0 1px ${color}, 0 8px 30px rgba(0,0,0,.45), 0 0 20px -6px ${color}55`
          : '0 4px 20px rgba(0,0,0,.35)',
        transition: 'border-color .15s, box-shadow .15s',
      }}
    >
      <div style={{ height: 3, background: `linear-gradient(90deg, ${color}, ${color}88)` }}/>

      {meta.accepts_input_from.length > 0 && (
        <Handle type="target" position={Position.Left} style={{ width: 10, height: 10, background: 'var(--bg-3)', border: `2px solid ${color}66` }}/>
      )}

      {/* Header */}
      <div
        onClick={() => setCollapsed((c) => !c)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer' }}
      >
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: `color-mix(in srgb, ${color} 15%, var(--bg-3))`,
          border: `1px solid ${color}35`,
          display: 'grid', placeItems: 'center', color,
        }}>
          <IconComponent size={15} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '.14em', textTransform: 'uppercase', color, opacity: .9, marginBottom: 2 }}>
            {meta.label}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%', background: statusDot.color,
            boxShadow: statusDot.glow ? `0 0 6px ${statusDot.glow}` : 'none',
            animation: statusDot.pulse ? 'glow-pulse 1s ease-in-out infinite' : 'none',
          }}/>
          <button
            onClick={(e) => {
              e.stopPropagation()
              useCanvasStore.setState((s) => ({
                nodes: s.nodes.filter((n) => n.id !== id),
                edges: s.edges.filter((edge) => edge.source !== id && edge.target !== id),
              }))
            }}
            style={{ width: 18, height: 18, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none', color: 'var(--text-4)', cursor: 'pointer', borderRadius: 4 }}
          >
            <X size={11} />
          </button>
        </div>
      </div>

      {!collapsed && configSchema && (
        <div style={{ padding: '0 12px 12px' }}>
          <div className="node-form">
            <Form
              schema={configSchema as never}
              uiSchema={uiSchema}
              validator={validator}
              formData={formData}
              onChange={({ formData: fd }) => {
                setFormData(fd ?? {})
                updateNodeConfig(id, fd ?? {})
              }}
              onSubmit={() => handleAction()}
            >
              <button type="submit" style={{ display: 'none' }} />
            </Form>
          </div>
          {action && (
            <button
              onClick={handleAction}
              disabled={runtime.status === 'running'}
              style={{
                width: '100%', padding: '6px 0', borderRadius: 7,
                background: color, color: '#fff', border: 'none',
                fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600,
                cursor: runtime.status === 'running' ? 'not-allowed' : 'pointer',
                opacity: runtime.status === 'running' ? 0.6 : 1,
              }}
            >
              {runtime.status === 'running' ? 'Running…' : action.button_label}
            </button>
          )}
          {preview && (
            <pre style={{
              marginTop: 8, padding: '6px 8px', borderRadius: 6,
              background: 'var(--bg-3)', fontFamily: 'var(--font-mono)', fontSize: 10,
              color: 'var(--text-3)', overflowX: 'auto', maxHeight: 80, whiteSpace: 'pre-wrap',
            }}>
              {preview}
            </pre>
          )}
          <button
            style={{ marginTop: 6, fontSize: 11, color: 'var(--accent-2)', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            onClick={() => setSelectedNode(id)}
          >
            Inspect output
          </button>
        </div>
      )}

      <Handle type="source" position={Position.Right} style={{ width: 10, height: 10, background: 'var(--bg-3)', border: `2px solid ${color}66` }}/>
    </div>
  )
}
