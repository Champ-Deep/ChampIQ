import { useState } from 'react'
import { useCanvasStore } from '@/store/canvasStore'
import { Pixie } from '@/components/pixie/Pixie'
import { X, Mail, Network, RefreshCw, Play, GitBranch, Database, Zap, Code, Cpu, CornerDownRight, Clock } from 'lucide-react'
import type { Node } from '@xyflow/react'

const NODE_COLORS: Record<string, string> = {
  champmail:   '#22C55E',
  champgraph:  '#3B82F6',
  champvoice:  '#A855F7',
  trigger:     '#10B981',
  loop:        '#F59E0B',
  if:          '#EF4444',
  set:         '#64748B',
  http:        '#06B6D4',
  code:        '#F97316',
  llm:         '#F97316',
  data:        '#06B6D4',
}

const NODE_ICONS: Record<string, React.ReactNode> = {
  champmail:  <Mail size={20} />,
  champgraph: <Network size={20} />,
  trigger:    <Play size={20} />,
  loop:       <RefreshCw size={20} />,
  if:         <GitBranch size={20} />,
  data:       <Database size={20} />,
  http:       <Zap size={20} />,
  code:       <Code size={20} />,
  llm:        <Cpu size={20} />,
  set:        <CornerDownRight size={20} />,
}

const PIXIE_TIPS: Record<string, { pose: 'point' | 'read' | 'think' | 'idle'; message: string; action?: string }> = {
  champmail:  { pose: 'point', message: 'Keep subject lines under 40 chars — open rates drop 18% above that threshold.', action: 'Rewrite subject' },
  champgraph: { pose: 'read',  message: 'Filter by intent signal before pulling status — reduces wasted API calls by ~60%.', action: 'Add filter' },
  loop:       { pose: 'think', message: 'Batch in groups of 25 to avoid rate-limit backpressure from downstream nodes.', action: 'Set batch size' },
  trigger:    { pose: 'idle',  message: 'Use cron triggers for scheduled campaigns; manual triggers for A/B test launches.' },
  if:         { pose: 'think', message: 'Branch on "replied = true" first — shorter happy path leads to faster execution.' },
  data:       { pose: 'read',  message: 'Validate CSV headers before the loop — saves you from silent row-skip bugs.' },
}

interface NodeSheetProps {
  node: Node
  pixieCloak: string
  onClose: () => void
}

export function NodeSheet({ node, pixieCloak, onClose }: NodeSheetProps) {
  const [tab, setTab] = useState<'params' | 'output' | 'runs'>('params')
  const [tipDismissed, setTipDismissed] = useState(false)
  const { nodeRuntimeStates, setNodeRuntime, addLog } = useCanvasStore()

  function handleRemove() {
    useCanvasStore.setState((s) => ({
      nodes: s.nodes.filter((n) => n.id !== node.id),
      edges: s.edges.filter((e) => e.source !== node.id && e.target !== node.id),
    }))
    onClose()
  }

  function handleDuplicate() {
    const newId = `${node.id}-copy-${Date.now()}`
    const newNode = {
      ...node,
      id: newId,
      position: { x: node.position.x + 40, y: node.position.y + 40 },
      selected: false,
    }
    useCanvasStore.setState((s) => ({ nodes: [...s.nodes, newNode] }))
    addLog({ nodeId: newId, nodeName: String(node.data.label ?? newId), status: 'idle', message: 'Node duplicated' })
  }

  async function handleTestRun() {
    setNodeRuntime(node.id, { status: 'running', error: undefined })
    addLog({ nodeId: node.id, nodeName: String(node.data.label ?? node.id), status: 'running', message: 'Test run started…' })
    // Simulate a brief run for nodes without a real action
    setTimeout(() => {
      setNodeRuntime(node.id, { status: 'success', output: { test: true, node_id: node.id } })
      addLog({ nodeId: node.id, nodeName: String(node.data.label ?? node.id), status: 'success', message: 'Test run complete' })
    }, 1200)
  }

  const data = node.data as Record<string, unknown>
  const kind = (data.kind as string) || 'unknown'
  const name = (data.label as string) || node.id
  const color = NODE_COLORS[kind] || '#7B86A6'
  const icon = NODE_ICONS[kind] || <Cpu size={20} />
  const tipData = PIXIE_TIPS[kind]
  const runtime = nodeRuntimeStates[node.id]
  const status = runtime?.status || 'idle'

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0, zIndex: 29,
          background: 'rgba(7,9,18,.45)', backdropFilter: 'blur(3px)',
          animation: 'sheet-backdrop-in 220ms var(--ease-swift)',
        }}
      />
    <div style={{
      position: 'absolute',
      right: 0, top: 0, bottom: 0,
      width: 520,
      zIndex: 30,
      background: 'var(--bg-1)',
      borderLeft: '1px solid var(--border-1)',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '-24px 0 80px rgba(0,0,0,.55)',
      animation: 'sheet-slide-in 280ms var(--ease-linger) both',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 18px 14px',
        borderBottom: '1px solid var(--border-1)',
        background: `linear-gradient(180deg, color-mix(in srgb, ${color} 8%, var(--bg-1)) 0%, var(--bg-1) 100%)`,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: `color-mix(in srgb, ${color} 15%, var(--bg-0))`,
            border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
            color, display: 'grid', placeItems: 'center',
            boxShadow: `0 0 20px -6px color-mix(in srgb, ${color} 50%, transparent)`,
          }}>
            {icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.16em', textTransform: 'uppercase', color, opacity: .9 }}>
                {kind}
              </span>
              <StatusPill status={status} />
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.015em', lineHeight: 1.2 }}>
              {name}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 30, height: 30, display: 'grid', placeItems: 'center',
            background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', borderRadius: 6,
          }}>
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, marginTop: 14 }}>
          {([['params','Parameters'],['output','Output'],['runs','Run history']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              padding: '5px 13px', borderRadius: 7,
              background: tab === k ? 'var(--bg-3)' : 'transparent',
              border: tab === k ? '1px solid var(--border-2)' : '1px solid transparent',
              color: tab === k ? 'var(--text-1)' : 'var(--text-3)',
              fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Pixie tip banner */}
      {!tipDismissed && tipData && (
        <div style={{
          margin: '10px 14px 0',
          background: 'linear-gradient(135deg, rgba(var(--accent-2-rgb),.07) 0%, rgba(var(--accent-2-rgb),.03) 100%)',
          border: '1px solid rgba(var(--accent-2-rgb),.25)',
          borderRadius: 12, padding: '12px 14px',
          display: 'flex', gap: 12, alignItems: 'flex-start', flexShrink: 0,
          animation: 'bubble-in 300ms var(--ease-spring)',
          position: 'relative',
        }}>
          <div style={{ flexShrink: 0, marginTop: -4 }}>
            <Pixie pose={tipData.pose} size={52} cloak={pixieCloak} ambient={false} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
              <span style={{ fontFamily: 'var(--font-pixel)', fontSize: 8, color: 'var(--accent-1)' }}>PIXIE</span>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent-2)', display: 'inline-block' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-4)', letterSpacing: '.1em', textTransform: 'uppercase' }}>tip</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: tipData.action ? 10 : 0 }}>
              {tipData.message}
            </div>
            {tipData.action && (
              <button style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px',
                background: 'var(--accent-2)', border: 'none', borderRadius: 7,
                color: '#fff', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>
                ✦ {tipData.action}
              </button>
            )}
          </div>
          <button onClick={() => setTipDismissed(true)} style={{
            background: 'transparent', border: 'none', color: 'var(--text-4)', cursor: 'pointer', padding: 2, borderRadius: 4, flexShrink: 0,
          }}><X size={12}/></button>
        </div>
      )}

      {/* Body — reuse existing RightPanel logic for params */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px 24px' }}>
        {tab === 'params' && <NodeParams node={node} />}
        {tab === 'output' && <NodeOutput runtime={runtime} />}
        {tab === 'runs'   && <NodeRuns node={node} />}
      </div>

      {/* Footer */}
      <div style={{
        padding: '12px 18px', borderTop: '1px solid var(--border-1)',
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--bg-0)', flexShrink: 0,
      }}>
        <SheetBtn variant="ghost" onClick={handleTestRun}>Test run</SheetBtn>
        <SheetBtn variant="ghost" onClick={handleDuplicate}>Duplicate</SheetBtn>
        <SheetBtn variant="danger" onClick={handleRemove}>Remove</SheetBtn>
        <div style={{ flex: 1 }}/>
        <SheetBtn variant="primary" onClick={onClose}>Done</SheetBtn>
      </div>
    </div>
    </>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    idle:    ['var(--text-4)',  'rgba(123,134,166,.1)'],
    running: ['var(--warn)',    'rgba(255,210,63,.12)'],
    success: ['var(--success)', 'rgba(74,222,128,.12)'],
    error:   ['var(--danger)',  'rgba(255,77,109,.12)'],
  }
  const [color, bg] = map[status] || map.idle
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 8px', borderRadius: 4,
      fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase',
      background: bg, color,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }}/>
      {status}
    </span>
  )
}

function NodeParams({ node }: { node: Node }) {
  const data = node.data as Record<string, unknown>
  const config = (data.config as Record<string, unknown>) || {}
  const entries = Object.entries(config)
  const { updateNodeConfig } = useCanvasStore()

  function handleChange(key: string, value: string) {
    updateNodeConfig(node.id, { ...config, [key]: value })
  }

  if (entries.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-4)' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, marginBottom: 8 }}>No parameters</div>
        <div style={{ fontSize: 12 }}>Configure this node by editing its fields on the canvas, or run a chat command.</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {entries.map(([key, val]) => (
        <div key={key}>
          <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 6 }}>
            {key}
          </label>
          <input
            defaultValue={String(val ?? '')}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 8,
              background: 'var(--bg-2)', border: '1px solid var(--border-1)',
              color: 'var(--text-1)', fontFamily: 'var(--font-mono)', fontSize: 12,
              outline: 'none', boxSizing: 'border-box',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(var(--accent-2-rgb),.5)')}
            onBlur={e => {
              e.currentTarget.style.borderColor = 'var(--border-1)'
              handleChange(key, e.currentTarget.value)
            }}
          />
        </div>
      ))}
    </div>
  )
}

function NodeOutput({ runtime }: { runtime?: { output?: Record<string, unknown> } }) {
  if (!runtime?.output) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-4)' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, marginBottom: 8 }}>No output yet</div>
        <div style={{ fontSize: 12 }}>Run the stage to see node output here.</div>
      </div>
    )
  }
  return (
    <pre style={{
      background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 8,
      padding: 14, fontFamily: 'var(--font-mono)', fontSize: 11.5,
      color: 'var(--text-2)', overflowX: 'auto', lineHeight: 1.6,
    }}>
      {JSON.stringify(runtime.output, null, 2)}
    </pre>
  )
}

function NodeRuns({ node: _ }: { node: Node }) {
  const MOCK_RUNS = [
    { id: 'run-001', status: 'success', duration: '1.2s', timestamp: new Date(Date.now() - 3600000).toISOString() },
    { id: 'run-002', status: 'error',   duration: '0.4s', timestamp: new Date(Date.now() - 86400000).toISOString() },
    { id: 'run-003', status: 'success', duration: '1.8s', timestamp: new Date(Date.now() - 172800000).toISOString() },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {MOCK_RUNS.map((run) => (
        <div key={run.id} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 14px', background: 'var(--bg-2)',
          border: '1px solid var(--border-1)', borderRadius: 8,
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: run.status === 'success' ? 'var(--success)' : 'var(--danger)',
            boxShadow: `0 0 6px ${run.status === 'success' ? 'var(--success)' : 'var(--danger)'}`,
          }}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-2)' }}>{run.id}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-4)' }}>
              {new Date(run.timestamp).toLocaleString()}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)' }}>
            <Clock size={10}/> {run.duration}
          </div>
        </div>
      ))}
    </div>
  )
}

function SheetBtn({ children, variant = 'ghost', onClick }: {
  children: React.ReactNode
  variant?: 'ghost' | 'primary' | 'danger'
  onClick?: () => void
}) {
  const styles: Record<string, React.CSSProperties> = {
    ghost:   { background: 'transparent', color: 'var(--text-2)', border: '1px solid transparent' },
    primary: { background: 'linear-gradient(180deg, var(--accent-2), var(--accent-3))', color: '#fff', border: '1px solid var(--accent-3)' },
    danger:  { background: 'rgba(255,77,109,.1)', color: 'var(--danger)', border: '1px solid rgba(255,77,109,.3)' },
  }
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '5px 12px', borderRadius: 7, fontSize: 12,
      fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer',
      ...styles[variant],
    }}>{children}</button>
  )
}
