import { useState } from 'react'
import { useCanvasStore } from '@/store/canvasStore'
import { api } from '@/lib/api'
import { useTheme } from '@/hooks/useTheme'
import { getToolId } from '@/lib/manifest'
import { saveCurrentCanvas } from '@/hooks/usePersistence'
import { Button } from '@/components/ui/button'
import { Save, Play, ZoomIn, ZoomOut, Moon, Sun, Check, Loader2 } from '@/lib/icons'
import { useReactFlow } from '@xyflow/react'

export function TopBar() {
  const { canvasName, nodes, edges, toolHealthStatus, manifests, setCanvasName, setNodeRuntime, addLog } = useCanvasStore()
  const { zoomIn, zoomOut } = useReactFlow()
  const { dark, toggle } = useTheme()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [running, setRunning] = useState(false)

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

    // Mark all nodes as running
    for (const n of nodes) setNodeRuntime(n.id, { status: 'running', error: undefined })

    addLog({ nodeId: 'run', nodeName: 'Run All', status: 'running', message: `Starting execution of ${nodes.length} nodes…` })

    try {
      const { execution_id } = await api.runAdHoc(nodes, edges)

      // Poll until finished
      const poll = async () => {
        const exec = await api.getExecution(execution_id) as Record<string, unknown>
        const status = exec.status as string

        if (status === 'running') {
          setTimeout(poll, 1000)
          return
        }

        // Fetch per-node results and update status indicators
        const nodeRuns = await api.getNodeRuns(execution_id) as Array<Record<string, unknown>>
        for (const run of nodeRuns) {
          setNodeRuntime(run.node_id as string, {
            status: run.status === 'success' ? 'success' : 'error',
            output: run.output as Record<string, unknown>,
            error: run.error as string | undefined,
          })
        }

        // Mark any nodes not in nodeRuns (didn't execute) as idle
        const ranIds = new Set(nodeRuns.map((r) => r.node_id as string))
        for (const n of nodes) {
          if (!ranIds.has(n.id)) setNodeRuntime(n.id, { status: 'idle' })
        }

        const finalStatus = status === 'success' ? 'success' : 'error'
        addLog({
          nodeId: 'run',
          nodeName: 'Run All',
          status: finalStatus,
          message: status === 'success'
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

  return (
    <div
      className="flex items-center justify-between h-12 px-4 border-b shrink-0"
      style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}
    >
      <input
        className="bg-transparent text-sm font-semibold focus:outline-none w-48 min-w-0"
        style={{ color: 'var(--text-1)' }}
        value={canvasName}
        onChange={(e) => setCanvasName(e.target.value)}
        aria-label="Canvas name"
      />

      {/* Tool health dots */}
      <div className="flex items-center gap-2">
        {manifests.map((m) => {
          const toolId = getToolId(m)
          if (!toolId) return null
          const status = toolHealthStatus[toolId] ?? 'unknown'
          const color =
            status === 'ok' ? 'bg-green-500' :
            status === 'error' ? 'bg-red-500' : 'bg-slate-500'
          return (
            <span
              key={toolId}
              className={`inline-block w-2.5 h-2.5 rounded-full ${color}`}
              title={`${toolId}: ${status}`}
              aria-label={`${toolId} health: ${status}`}
            />
          )
        })}
      </div>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={() => zoomOut()} aria-label="Zoom out"
          style={{ color: 'var(--text-2)' }}>
          <ZoomOut size={16} />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => zoomIn()} aria-label="Zoom in"
          style={{ color: 'var(--text-2)' }}>
          <ZoomIn size={16} />
        </Button>
        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme"
          style={{ color: 'var(--text-2)' }}>
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </Button>
        <Button
          variant="ghost" size="sm"
          onClick={handleRunAll}
          disabled={running || nodes.length === 0}
          aria-label="Run all nodes"
          style={{ color: running ? '#60a5fa' : 'var(--text-2)' }}
        >
          {running
            ? <><Loader2 size={14} className="mr-1 animate-spin" /> Running…</>
            : <><Play size={14} className="mr-1" /> Run All</>}
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving}
          aria-label="Save canvas"
          style={{ background: saved ? '#16a34a22' : 'var(--bg-surface)', color: saved ? '#4ade80' : 'var(--text-1)', border: `1px solid ${saved ? '#16a34a55' : 'var(--border)'}` }}
        >
          {saved
            ? <><Check size={14} className="mr-1" /> Saved</>
            : <><Save size={14} className="mr-1" /> Save</>}
        </Button>
      </div>
    </div>
  )
}
