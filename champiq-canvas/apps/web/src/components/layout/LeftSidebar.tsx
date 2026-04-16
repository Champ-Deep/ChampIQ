import { useState } from 'react'
import { useCanvasStore } from '@/store/canvasStore'
import { getToolId, getNodeMeta } from '@/lib/manifest'
import { saveCurrentCanvas } from '@/hooks/usePersistence'
import { Plus, Trash2 } from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import { Box } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { CanvasMeta } from '@/types'
import type { Node, Edge } from '@xyflow/react'

// ── Canvas switching helpers ──────────────────────────────────────────────────

function switchCanvas(targetId: string) {
  saveCurrentCanvas()
  const { canvasList } = useCanvasStore.getState()
  const target = canvasList.find((c) => c.id === targetId)
  if (!target) return
  useCanvasStore.setState({
    currentCanvasId: targetId,
    canvasName: target.name,
    nodes: [], edges: [],
    nodeRuntimeStates: {}, logs: [],
  })
  const raw = localStorage.getItem(`champiq:canvas:${targetId}`)
  if (raw) {
    try {
      const { nodes, edges } = JSON.parse(raw) as { nodes: Node[]; edges: Edge[] }
      useCanvasStore.setState({ nodes, edges })
    } catch { /* ignore */ }
  }
}

function createCanvas() {
  saveCurrentCanvas()
  const id = crypto.randomUUID()
  const meta: CanvasMeta = { id, name: 'Untitled Canvas', updatedAt: new Date().toISOString() }
  useCanvasStore.setState((s) => ({
    canvasList: [...s.canvasList, meta],
    currentCanvasId: id,
    canvasName: meta.name,
    nodes: [], edges: [],
    nodeRuntimeStates: {}, logs: [],
  }))
  localStorage.setItem('champiq:canvas:list', JSON.stringify(useCanvasStore.getState().canvasList))
}

function deleteCanvas(id: string) {
  const { canvasList, currentCanvasId } = useCanvasStore.getState()
  if (canvasList.length <= 1) return // always keep at least one
  const updated = canvasList.filter((c) => c.id !== id)
  localStorage.removeItem(`champiq:canvas:${id}`)
  localStorage.setItem('champiq:canvas:list', JSON.stringify(updated))
  useCanvasStore.setState({ canvasList: updated })
  if (id === currentCanvasId) switchCanvas(updated[0].id)
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LeftSidebar() {
  const { manifests, canvasList, currentCanvasId } = useCanvasStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  function startRename(c: CanvasMeta) {
    setEditingId(c.id)
    setEditName(c.name)
  }

  function commitRename(id: string) {
    if (editName.trim()) {
      useCanvasStore.setState((s) => ({
        canvasList: s.canvasList.map((c) => (c.id === id ? { ...c, name: editName.trim() } : c)),
        canvasName: s.currentCanvasId === id ? editName.trim() : s.canvasName,
      }))
      localStorage.setItem('champiq:canvas:list', JSON.stringify(useCanvasStore.getState().canvasList))
    }
    setEditingId(null)
  }

  function onDragStart(e: React.DragEvent, toolId: string) {
    e.dataTransfer.setData('application/champiq-tool', toolId)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <aside
      className="w-56 shrink-0 flex flex-col overflow-y-auto"
      style={{ background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border)' }}
      aria-label="Tool palette"
    >
      {/* ── Canvases ──────────────────────────────────────────────────────── */}
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
            Canvases
          </p>
          <button
            onClick={createCanvas}
            className="p-0.5 rounded hover:opacity-70"
            style={{ color: 'var(--text-2)' }}
            aria-label="New canvas"
          >
            <Plus size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-1">
          {canvasList.map((c) => (
            <div
              key={c.id}
              className="group flex items-center gap-1 px-2 py-1 rounded-md cursor-pointer"
              style={{
                background: c.id === currentCanvasId ? 'var(--border)' : 'transparent',
                color: 'var(--text-1)',
              }}
              onClick={() => c.id !== currentCanvasId && switchCanvas(c.id)}
            >
              {editingId === c.id ? (
                <input
                  autoFocus
                  className="flex-1 text-xs bg-transparent focus:outline-none"
                  style={{ color: 'var(--text-1)' }}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => commitRename(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(c.id)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="flex-1 text-xs truncate" onDoubleClick={() => startRename(c)}>
                  {c.name}
                </span>
              )}
              {canvasList.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); deleteCanvas(c.id) }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-400"
                  style={{ color: 'var(--text-3)' }}
                  aria-label={`Delete ${c.name}`}
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)' }} />

      {/* ── Tools ─────────────────────────────────────────────────────────── */}
      <div className="p-3 flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-3)' }}>
          Tools
        </p>
        {manifests.map((m) => {
          const toolId = getToolId(m)
          const meta = getNodeMeta(m)
          const iconName = meta.icon as keyof typeof LucideIcons
          const IconComponent = (LucideIcons[iconName] as LucideIcon | undefined) ?? Box

          return (
            <div
              key={toolId}
              draggable
              onDragStart={(e) => onDragStart(e, toolId)}
              className="flex items-center gap-2 p-2 rounded-md cursor-grab active:cursor-grabbing select-none"
              style={{ border: '1px solid var(--border)', borderLeftColor: meta.color, borderLeftWidth: 3 }}
              aria-label={`Drag ${meta.label} node to canvas`}
              role="button"
              tabIndex={0}
            >
              <span style={{ color: meta.color }}><IconComponent size={16} /></span>
              <span className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{meta.label}</span>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
