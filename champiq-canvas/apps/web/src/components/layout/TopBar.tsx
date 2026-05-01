import { useState } from 'react'
import { useCanvasStore } from '@/store/canvasStore'
import { api } from '@/lib/api'
import { getToolId } from '@/lib/manifest'
import { saveCurrentCanvas } from '@/hooks/usePersistence'
import { Save, Play, Check, CalendarClock, Power, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import type { Node } from '@xyflow/react'

function extractCronTriggers(nodes: Node[]): Record<string, unknown>[] {
  return nodes
    .filter((n) => (n.data as Record<string, unknown>).kind === 'trigger.cron')
    .map((n) => {
      const cfg = ((n.data as Record<string, unknown>).config as Record<string, unknown>) ?? {}
      return { id: n.id, kind: 'cron', cron: cfg.cron ?? '0 9 * * 1-5', timezone: cfg.timezone ?? 'UTC' }
    })
}

interface TopBarProps {
  onHub?: () => void
  onCmdOpen?: () => void
}

export function TopBar({ onHub, onCmdOpen }: TopBarProps = {}) {
  const { canvasName, nodes, edges, toolHealthStatus, manifests, setCanvasName, setNodeRuntime, addLog } = useCanvasStore()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [running, setRunning] = useState(false)
  const [activating, setActivating] = useState(false)
  const [activeWorkflowId, setActiveWorkflowId] = useState<number | null>(null)

  async function handleSave() {
    if (saving) return
    setSaving(true)
    setSaved(false)
    try {
      saveCurrentCanvas()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      console.error('Save failed', e)
    } finally {
      setSaving(false)
    }
  }

  async function handleRunAll() {
    if (running || nodes.length === 0) return
    setRunning(true)
    for (const n of nodes) setNodeRuntime(n.id, { status: 'running', error: undefined })
    addLog({ nodeId: 'run', nodeName: 'Run All', status: 'running', message: `Starting execution of ${nodes.length} nodes…` })
    try {
      const { execution_id } = await api.runAdHoc(nodes, edges)
      const poll = async () => {
        const exec = await api.getExecution(execution_id) as Record<string, unknown>
        if (exec.status === 'running') { setTimeout(poll, 1000); return }
        const nodeRuns = await api.getNodeRuns(execution_id) as Array<Record<string, unknown>>
        for (const run of nodeRuns) {
          setNodeRuntime(run.node_id as string, {
            status: run.status === 'success' ? 'success' : 'error',
            output: run.output as Record<string, unknown>,
            error: run.error as string | undefined,
          })
        }
        const ranIds = new Set(nodeRuns.map((r) => r.node_id as string))
        for (const n of nodes) if (!ranIds.has(n.id)) setNodeRuntime(n.id, { status: 'idle' })
        addLog({
          nodeId: 'run', nodeName: 'Run All',
          status: exec.status === 'success' ? 'success' : 'error',
          message: exec.status === 'success'
            ? `Execution complete — ${nodeRuns.length} nodes ran`
            : `Execution failed: ${(exec.error as string) ?? 'unknown error'}`,
        })
        setRunning(false)
      }
      setTimeout(poll, 800)
    } catch (e) {
      for (const n of nodes) setNodeRuntime(n.id, { status: 'idle' })
      addLog({ nodeId: 'run', nodeName: 'Run All', status: 'error', message: String(e) })
      setRunning(false)
    }
  }

  async function handleActivate() {
    if (activating || nodes.length === 0) return
    setActivating(true)
    addLog({ nodeId: 'activate', nodeName: 'Activate', status: 'running', message: 'Registering workflow…' })
    try {
      const triggers = extractCronTriggers(nodes)
      const body = { name: canvasName, description: `From canvas: ${canvasName}`, active: true, nodes, edges, triggers }
      let wf: Record<string, unknown>
      if (activeWorkflowId) {
        wf = await api.updateWorkflow(activeWorkflowId, body) as Record<string, unknown>
      } else {
        wf = await api.createWorkflow(body) as Record<string, unknown>
        setActiveWorkflowId(wf.id as number)
      }
      addLog({
        nodeId: 'activate', nodeName: 'Activate', status: 'success',
        message: triggers.length > 0
          ? `Workflow #${wf.id as number} active — ${triggers.length} cron schedule(s) registered`
          : `Workflow #${wf.id as number} active`,
      })
    } catch (e) {
      addLog({ nodeId: 'activate', nodeName: 'Activate', status: 'error', message: String(e) })
    } finally {
      setActivating(false)
    }
  }

  return (
    <div style={{
      height: 48,
      flexShrink: 0,
      background: 'var(--bg-1)',
      borderBottom: '1px solid var(--border-1)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 14px',
      gap: 12,
    }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-3)', flexShrink: 0 }}>
        {onHub && (
          <>
            <button
              onClick={onHub}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none',
                color: 'var(--text-3)', fontFamily: 'var(--font-body)', fontSize: 12, cursor: 'pointer', padding: '2px 4px', borderRadius: 4,
                transition: 'color .15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-1)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)' }}
            >
              <ChevronLeft size={12} />
              Stages
            </button>
            <ChevronRight size={11} />
          </>
        )}
        <input
          value={canvasName}
          onChange={(e) => setCanvasName(e.target.value)}
          aria-label="Canvas name"
          style={{
            background: 'transparent', border: 'none', outline: 'none',
            fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600,
            color: 'var(--text-1)', width: 160, minWidth: 0,
          }}
        />
      </div>

      {/* ⌘K search trigger */}
      {onCmdOpen && (
        <button
          onClick={onCmdOpen}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px 4px 8px',
            background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 7,
            color: 'var(--text-3)', fontFamily: 'var(--font-body)', fontSize: 12, cursor: 'pointer',
          }}
        >
          <Search size={12} />
          <span>Search…</span>
          <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '1px 4px', borderRadius: 3, background: 'var(--bg-3)', border: '1px solid var(--border-1)', color: 'var(--text-4)' }}>⌘K</kbd>
        </button>
      )}

      {/* Tool health dots */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {manifests.map((m) => {
          const toolId = getToolId(m)
          if (!toolId) return null
          const status = toolHealthStatus[toolId] ?? 'unknown'
          const color = status === 'ok' ? 'var(--success)' : status === 'error' ? 'var(--danger)' : 'var(--text-4)'
          return (
            <div
              key={toolId}
              title={`${toolId}: ${status}`}
              style={{
                width: 7, height: 7, borderRadius: '50%', background: color,
                boxShadow: status === 'ok' ? `0 0 6px ${color}` : 'none',
              }}
            />
          )
        })}
      </div>

      <div style={{ flex: 1 }} />

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Run All */}
        <TopBtn
          onClick={handleRunAll}
          disabled={running || nodes.length === 0}
          variant={running ? 'accent' : 'ghost'}
          title="Run all nodes"
        >
          {running
            ? <><Loader size/> Running…</>
            : <><Play size={13} /> Run All</>
          }
        </TopBtn>

        {/* Activate */}
        <TopBtn
          onClick={handleActivate}
          disabled={activating || nodes.length === 0}
          variant={activeWorkflowId ? 'success' : 'ghost'}
          title={activeWorkflowId ? `Re-sync #${activeWorkflowId}` : 'Register cron + activate'}
        >
          {activating
            ? <><Loader size/> Activating…</>
            : activeWorkflowId
              ? <><Power size={13} /> Active</>
              : <><CalendarClock size={13} /> Activate</>
          }
        </TopBtn>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 7, fontSize: 13,
            fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer',
            background: saved ? 'rgba(74,222,128,.12)' : 'var(--bg-2)',
            color: saved ? 'var(--success)' : 'var(--text-1)',
            border: `1px solid ${saved ? 'rgba(74,222,128,.3)' : 'var(--border-1)'}`,
            transition: 'all .15s',
          }}
        >
          {saved ? <><Check size={13} /> Saved</> : <><Save size={13} /> Save</>}
        </button>
      </div>
    </div>
  )
}

function Loader({ size: _ }: { size?: boolean }) {
  return <div style={{ width: 13, height: 13, border: '1.5px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
}

function TopBtn({
  children, onClick, disabled, variant = 'ghost', title,
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'ghost' | 'accent' | 'success'
  title?: string
}) {
  const styles: Record<string, React.CSSProperties> = {
    ghost:   { background: 'transparent', color: 'var(--text-2)', border: '1px solid transparent' },
    accent:  { background: 'rgba(var(--accent-2-rgb),.14)', color: 'var(--accent-1)', border: '1px solid rgba(var(--accent-2-rgb),.25)' },
    success: { background: 'rgba(74,222,128,.1)', color: 'var(--success)', border: '1px solid rgba(74,222,128,.25)' },
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '5px 12px', borderRadius: 7, fontSize: 13,
        fontFamily: 'var(--font-display)', fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all .15s',
        ...styles[variant],
      }}
    >
      {children}
    </button>
  )
}
