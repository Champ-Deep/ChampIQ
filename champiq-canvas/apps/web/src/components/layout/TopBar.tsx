import { useCanvasStore } from '@/store/canvasStore'
import { api } from '@/lib/api'
import { useTheme } from '@/hooks/useTheme'
import { topoLayers } from '@/lib/execution'
import { getToolId } from '@/lib/manifest'
import { Button } from '@/components/ui/button'
import { Save, Play, ZoomIn, ZoomOut, Moon, Sun } from 'lucide-react'
import { useReactFlow } from '@xyflow/react'

export function TopBar() {
  const { canvasName, nodes, edges, toolHealthStatus, manifests, setCanvasName, setNodeRuntime } = useCanvasStore()
  const { zoomIn, zoomOut } = useReactFlow()
  const { dark, toggle } = useTheme()

  function handleSave() {
    api.saveCanvasState(nodes, edges).catch(console.error)
  }

  function handleRunAll() {
    const layers = topoLayers(nodes, edges)
    if (layers.length === 0) return
    useCanvasStore.setState({ isRunningAll: true })
    for (const id of layers[0]) {
      setNodeRuntime(id, { status: 'idle', pendingRun: true })
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
        <Button variant="ghost" size="sm" onClick={handleRunAll} aria-label="Run all nodes"
          style={{ color: 'var(--text-2)' }}>
          <Play size={14} className="mr-1" /> Run All
        </Button>
        <Button size="sm" onClick={handleSave} aria-label="Save canvas"
          style={{ background: 'var(--bg-surface)', color: 'var(--text-1)', border: '1px solid var(--border)' }}>
          <Save size={14} className="mr-1" /> Save
        </Button>
      </div>
    </div>
  )
}
