import { useState, useEffect } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import Form from '@rjsf/core'
import validator from '@rjsf/validator-ajv8'
import { resolveIcon, X } from '@/lib/icons'
import { useCanvasStore } from '@/store/canvasStore'
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

// ── Kind metadata ──────────────────────────────────────────────────────────
const KIND_META: Record<string, { label: string; color: string; icon: string }> = {
  'trigger.manual':  { label: 'Manual Trigger',  color: '#10b981', icon: 'play_node' },
  'trigger.webhook': { label: 'Webhook Trigger', color: '#10b981', icon: 'webhook' },
  'trigger.cron':    { label: 'Cron Schedule',   color: '#10b981', icon: 'cron' },
  'trigger.event':   { label: 'Event Trigger',   color: '#10b981', icon: 'bolt' },
  'http':            { label: 'HTTP Request',     color: '#3b82f6', icon: 'webhook' },
  'set':             { label: 'Set / Map',        color: '#8b5cf6', icon: 'set_node' },
  'merge':           { label: 'Merge',            color: '#8b5cf6', icon: 'merge' },
  'if':              { label: 'If / Branch',      color: '#f59e0b', icon: 'if_node' },
  'switch':          { label: 'Switch',           color: '#f59e0b', icon: 'branch' },
  'loop':            { label: 'Loop',             color: '#f59e0b', icon: 'loop' },
  'split':           { label: 'Split / A-B',      color: '#ec4899', icon: 'branch' },
  'wait':            { label: 'Wait',             color: '#6b7280', icon: 'timer' },
  'code':            { label: 'Code',             color: '#06b6d4', icon: 'code' },
  'llm':             { label: 'LLM',              color: '#a855f7', icon: 'sparkle' },
  'champmail_reply': { label: 'Reply Classifier', color: '#ef4444', icon: 'mail' },
  'champmail':       { label: 'ChampMail',        color: '#22C55E', icon: 'mail' },
  'champgraph':      { label: 'ChampGraph',       color: '#3B82F6', icon: 'graph' },
  'champvoice':      { label: 'ChampVoice',       color: '#a855f7', icon: 'voice' },
  'lakeb2b_pulse':   { label: 'LakeB2B Pulse',   color: '#64748b', icon: 'db' },
}

function configSummary(config: Record<string, unknown>, kind: string): string | null {
  if (!config) return null
  if (kind === 'if') return config.condition ? `if ${String(config.condition).slice(0, 32)}` : null
  if (kind === 'loop') return config.items ? `loop: ${String(config.items).slice(0, 32)}` : null
  if (kind === 'split') return `split into ${config.n ?? 2} branches`
  if (kind === 'wait') return config.seconds ? `wait ${config.seconds}s` : null
  if (kind.startsWith('trigger.cron')) return config.cron ? String(config.cron) : null
  if (['champmail', 'champgraph', 'champvoice', 'lakeb2b_pulse'].includes(kind)) {
    return config.action ? `action: ${config.action}` : null
  }
  if (kind === 'http') return config.url ? String(config.url).slice(0, 35) : null
  if (kind === 'llm') return config.prompt ? String(config.prompt).slice(0, 35) + '…' : null
  return null
}

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

// ── SimpleNode — ChampIQ-styled card ──────────────────────────────────────
function SimpleNode({ id, data, selected }: NodeProps) {
  const manifest = data.manifest as ChampIQManifest | undefined
  const kind = (data.kind as string | undefined) ?? (data.toolId as string | undefined) ?? 'unknown'
  const kindMeta = KIND_META[kind]

  const metaLabel = (data.label as string) ?? kindMeta?.label ?? kind
  const metaColor = kindMeta?.color ?? '#6366F1'
  const metaIcon = kindMeta?.icon ?? 'box'

  const meta = manifest
    ? getNodeMeta(manifest)
    : { label: metaLabel, icon: metaIcon, color: metaColor, accepts_input_from: [] as string[] }

  const { nodeRuntimeStates, setSelectedNode } = useCanvasStore()
  const runtime = nodeRuntimeStates[id] ?? { status: 'idle' as NodeStatus }
  const IconComponent = resolveIcon(meta.icon)
  const config = (data.config as Record<string, unknown>) ?? {}
  const summary = configSummary(config, kind)
  const statusDot = STATUS_DOT[runtime.status as NodeStatus] ?? STATUS_DOT.idle

  const isSplit = kind === 'split'
  const splitN = isSplit ? Math.max(Number(config.n ?? 2), 2) : 0
  const isRootTrigger = kind.startsWith('trigger.')

  const isSelected = selected
  const color = meta.color

  return (
    <div
      onDoubleClick={() => setSelectedNode(id)}
      style={{
        width: 210,
        background: 'var(--bg-2)',
        border: `1px solid ${isSelected ? color : 'var(--border-1)'}`,
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: isSelected
          ? `0 0 0 1px ${color}, 0 8px 30px rgba(0,0,0,.45), 0 0 20px -6px ${color}55`
          : '0 4px 20px rgba(0,0,0,.35)',
        transition: 'border-color .15s, box-shadow .15s',
        cursor: 'default',
      }}
    >
      {/* Color ribbon */}
      <div style={{
        height: 3,
        background: `linear-gradient(90deg, ${color}, ${color}88)`,
        flexShrink: 0,
      }}/>

      {!isRootTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          style={{
            width: 10, height: 10, borderRadius: 3,
            background: 'var(--bg-3)',
            border: `2px solid ${color}66`,
            transition: 'border-color .12s',
          }}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px 8px' }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: `color-mix(in srgb, ${color} 15%, var(--bg-3))`,
          border: `1px solid ${color}35`,
          display: 'grid', placeItems: 'center',
          color,
        }}>
          <IconComponent size={15} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '.14em',
            textTransform: 'uppercase', color, opacity: .9, marginBottom: 2,
          }}>
            {kindMeta?.label || kind}
          </div>
          <div style={{
            fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13,
            color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {meta.label}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: statusDot.color,
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
            style={{
              width: 18, height: 18, display: 'grid', placeItems: 'center',
              background: 'transparent', border: 'none', color: 'var(--text-4)',
              cursor: 'pointer', borderRadius: 4, opacity: 0,
              transition: 'opacity .15s',
            }}
            className="node-delete-btn"
          >
            <X size={11} />
          </button>
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <div style={{
          margin: '0 12px 8px',
          padding: '4px 8px', borderRadius: 5,
          background: 'var(--bg-3)',
          fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-3)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {summary}
        </div>
      )}

      {/* Runtime error */}
      {runtime.status === 'error' && runtime.error && (
        <div style={{
          margin: '0 12px 8px', padding: '4px 8px', borderRadius: 5,
          background: 'rgba(255,77,109,.1)', border: '1px solid rgba(255,77,109,.2)',
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--danger)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {runtime.error}
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
              width: 10, height: 10, borderRadius: 3,
              background: 'var(--bg-3)',
              border: `2px solid ${color}66`,
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

  const { nodeRuntimeStates, setNodeRuntime, updateNodeConfig, addLog, setSelectedNode } = useCanvasStore()
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
