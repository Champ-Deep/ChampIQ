import { useState, useEffect } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import Form from '@rjsf/core'
import validator from '@rjsf/validator-ajv8'
import * as LucideIcons from 'lucide-react'
import { Box, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
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

const STATUS_COLORS: Record<NodeStatus, string> = {
  idle: 'bg-slate-500',
  running: 'bg-blue-500 animate-pulse',
  success: 'bg-green-500',
  error: 'bg-red-500',
}

export function ToolNode(props: NodeProps) {
  const { id, data } = props
  const manifest = data.manifest as ChampIQManifest | undefined
  const kind = (data.kind as string | undefined) ?? (data.toolId as string | undefined)

  // Two modes:
  //  - v1 manifest  -> full JSON-Schema form (legacy canvas flow)
  //  - v2 / no manifest -> minimal card for orchestrator nodes. The inspector
  //    panel is where config gets edited (future work).
  if (!manifest || isV2(manifest)) {
    return <SimpleNode {...props} />
  }
  return <LegacyFormNode {...props} manifest={manifest} kindHint={kind} />
}

function SimpleNode({ id, data, selected }: NodeProps) {
  const manifest = data.manifest as ChampIQManifest | undefined
  const meta = manifest
    ? getNodeMeta(manifest)
    : {
        label: (data.label as string) ?? (data.kind as string) ?? 'Node',
        icon: 'box',
        color: '#6366F1',
        accepts_input_from: [] as string[],
      }
  const { nodeRuntimeStates, setSelectedNode } = useCanvasStore()
  const runtime = nodeRuntimeStates[id] ?? { status: 'idle' as NodeStatus }
  const iconName = meta.icon as keyof typeof LucideIcons
  const IconComponent = (LucideIcons[iconName] as LucideIcon | undefined) ?? Box

  return (
    <div
      className={`group border rounded-lg w-56 text-sm select-none shadow-lg ${
        selected ? 'border-slate-400' : 'border-slate-700'
      }`}
      style={{
        background: 'var(--bg-surface)',
        borderTopColor: meta.color,
        borderTopWidth: 3,
      }}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-500 !w-3 !h-3 !border-slate-400" />
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <span style={{ color: meta.color }}><IconComponent size={14} /></span>
          <span className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>{meta.label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[runtime.status as NodeStatus] ?? STATUS_COLORS.idle}`}
            aria-label={`Status: ${runtime.status ?? 'idle'}`}
          />
          <button
            onClick={(e) => {
              e.stopPropagation()
              useCanvasStore.setState((s) => ({
                nodes: s.nodes.filter((n) => n.id !== id),
                edges: s.edges.filter((edge) => edge.source !== id && edge.target !== id),
              }))
            }}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-400 transition-opacity"
            style={{ color: 'var(--text-3)' }}
            aria-label="Delete node"
          >
            <X size={12} />
          </button>
        </div>
      </div>
      <div className="px-3 pb-2">
        <button
          className="text-xs underline"
          onClick={() => setSelectedNode(id)}
          style={{ color: 'var(--text-3)' }}
        >
          Configure
        </button>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-slate-500 !w-3 !h-3 !border-slate-400" />
    </div>
  )
}

function LegacyFormNode({
  id,
  data,
  selected,
  manifest,
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

  const iconName = meta.icon as keyof typeof LucideIcons
  const IconComponent = (LucideIcons[iconName] as LucideIcon | undefined) ?? Box

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
    addLog({ nodeId: id, nodeName: meta.label, status: 'running', message: `${meta.label} started: ${action.button_label}` })
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
      className={`group bg-[#1a1d27] border rounded-lg w-64 text-sm select-none shadow-lg ${
        selected ? 'border-slate-400' : 'border-slate-700'
      }`}
      style={{ borderTopColor: meta.color, borderTopWidth: 3 }}
    >
      {meta.accepts_input_from.length > 0 && (
        <Handle type="target" position={Position.Left} className="!bg-slate-500 !w-3 !h-3 !border-slate-400" />
      )}

      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer"
        onClick={() => setCollapsed((c) => !c)}
        role="button" tabIndex={0}
      >
        <div className="flex items-center gap-2">
          <span style={{ color: meta.color }}><IconComponent size={14} /></span>
          <span className="text-white font-semibold text-sm">{meta.label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[runtime.status as NodeStatus] ?? STATUS_COLORS.idle}`} />
          <button
            onClick={(e) => {
              e.stopPropagation()
              useCanvasStore.setState((s) => ({
                nodes: s.nodes.filter((n) => n.id !== id),
                edges: s.edges.filter((edge) => edge.source !== id && edge.target !== id),
              }))
            }}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-400 transition-opacity"
            style={{ color: 'var(--text-3)' }}
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {!collapsed && configSchema && (
        <div className="px-3 pb-3 space-y-2">
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
              <button type="submit" className="hidden" aria-hidden="true" />
            </Form>
          </div>
          {action && (
            <button
              onClick={handleAction}
              disabled={runtime.status === 'running'}
              className="w-full py-1.5 rounded text-white text-sm font-medium disabled:opacity-50 transition-colors"
              style={{ backgroundColor: meta.color }}
            >
              {runtime.status === 'running' ? 'Running...' : action.button_label}
            </button>
          )}
          {preview && (
            <pre className="text-xs text-slate-300 bg-slate-900 rounded p-2 overflow-x-auto max-h-20 whitespace-pre-wrap">
              {preview}
            </pre>
          )}
          <button className="text-xs text-slate-400 hover:text-white underline" onClick={() => setSelectedNode(id)}>
            Inspect output
          </button>
        </div>
      )}

      <Handle type="source" position={Position.Right} className="!bg-slate-500 !w-3 !h-3 !border-slate-400" />
    </div>
  )
}
