import { useState } from 'react'
import { useCanvasStore } from '@/store/canvasStore'
import { getToolId, getNodeMeta } from '@/lib/manifest'
import { saveCurrentCanvas } from '@/hooks/usePersistence'
import { resolveIcon, Plus, Trash2 } from '@/lib/icons'
import { CredentialsPanel } from './CredentialsPanel'
import { ChampMailPanel } from './ChampMailPanel'
import type { ChampIQManifest, CanvasMeta } from '@/types'
import type { Node, Edge } from '@xyflow/react'

// ── Palette item shape ────────────────────────────────────────────────────────
// For tool manifests (champmail, champgraph etc): one item, dragId = tool_id
// For the system manifest: one item per node kind, dragId = kind

interface PaletteItem {
  dragId: string   // what gets set on dataTransfer — kind for system nodes, tool_id for tools
  label: string
  icon: string
  color: string
  group?: string
}

const GROUP_ORDER = ['triggers', 'control', 'data', 'code', 'ai', 'tools', 'outreach']

function buildPalette(manifests: ChampIQManifest[]): { group: string; items: PaletteItem[] }[] {
  const grouped: Record<string, PaletteItem[]> = {}

  for (const m of manifests) {
    const toolId = getToolId(m)
    const meta = getNodeMeta(m)

    if (m.manifest_version === 2 && Array.isArray(m.nodes) && m.nodes.length > 0) {
      // Expand into per-kind items
      for (const n of m.nodes) {
        const kind = n.kind as string
        const label = (n.label as string) ?? kind
        const group = (n.group as string) ?? 'other'
        if (!grouped[group]) grouped[group] = []
        grouped[group].push({ dragId: kind, label, icon: meta.icon, color: meta.color, group })
      }
    } else if (toolId) {
      // Single tool item (champmail, champgraph, lakeb2b_pulse)
      const group = 'tools'
      if (!grouped[group]) grouped[group] = []
      grouped[group].push({ dragId: toolId, label: meta.label, icon: meta.icon, color: meta.color, group })
    }
  }

  return GROUP_ORDER
    .filter((g) => grouped[g]?.length)
    .map((g) => ({ group: g, items: grouped[g] }))
}

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
  const { canvasList, currentCanvasId } = useCanvasStore.getState()

  // Don't create a duplicate blank canvas — switch to existing blank one instead
  const existingBlank = canvasList.find(
    (c) => c.id !== currentCanvasId && !localStorage.getItem(`champiq:canvas:${c.id}`)
  )
  if (existingBlank) {
    switchCanvas(existingBlank.id)
    return
  }

  saveCurrentCanvas()
  const id = crypto.randomUUID()
  const meta: CanvasMeta = { id, name: 'New Canvas', updatedAt: new Date().toISOString() }

  // Write empty state immediately so saveCurrentCanvas never inherits old nodes
  localStorage.setItem(`champiq:canvas:${id}`, JSON.stringify({ nodes: [], edges: [] }))

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

  function onDragStart(e: React.DragEvent, dragId: string) {
    e.dataTransfer.setData('application/champiq-tool', dragId)
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

      {/* ── Credentials ───────────────────────────────────────────────────── */}
      <CredentialsPanel />

      <div style={{ borderTop: '1px solid var(--border)' }} />

      {/* ── ChampMail (inline) ────────────────────────────────────────────── */}
      <ChampMailPanel />

      {/* ── Node palette ──────────────────────────────────────────────────── */}
      {buildPalette(manifests).map(({ group, items }) => (
        <div key={group} className="px-3 pb-3">
          <p className="text-xs font-semibold uppercase tracking-wide mb-2 mt-1" style={{ color: 'var(--text-3)' }}>
            {group}
          </p>
          <div className="flex flex-col gap-1.5">
            {items.map((item) => {
              const IconComponent = resolveIcon(item.icon)
              return (
                <div
                  key={item.dragId}
                  draggable
                  onDragStart={(e) => onDragStart(e, item.dragId)}
                  className="flex items-center gap-2 p-2 rounded-md cursor-grab active:cursor-grabbing select-none"
                  style={{ border: '1px solid var(--border)', borderLeftColor: item.color, borderLeftWidth: 3 }}
                  aria-label={`Drag ${item.label} node to canvas`}
                  role="button"
                  tabIndex={0}
                >
                  <span style={{ color: item.color }}><IconComponent size={14} /></span>
                  <span className="text-xs font-medium" style={{ color: 'var(--text-1)' }}>{item.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </aside>
  )
}
