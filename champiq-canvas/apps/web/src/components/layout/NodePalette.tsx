import { useState } from 'react'
import { useCanvasStore } from '@/store/canvasStore'
import { useUIStore } from '@/store/uiStore'
import { getToolId, getNodeMeta } from '@/lib/manifest'
import { saveCurrentCanvas } from '@/hooks/usePersistence'
import { resolveIcon, Plus, Trash2 } from '@/lib/icons'
import type { ChampIQManifest, CanvasMeta } from '@/types'
import type { Node, Edge } from '@xyflow/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaletteItem {
  dragId: string
  label: string
  icon: string
  color: string
  group?: string
}

const GROUP_ORDER = ['triggers', 'control', 'data', 'code', 'ai', 'tools', 'outreach']

const GROUP_LABELS: Record<string, string> = {
  triggers: 'Triggers',
  control:  'Control',
  data:     'Data',
  code:     'Code',
  ai:       'AI',
  tools:    'Tools',
  outreach: 'Outreach',
}

function buildPalette(manifests: ChampIQManifest[]): { group: string; items: PaletteItem[] }[] {
  const grouped: Record<string, PaletteItem[]> = {}
  for (const m of manifests) {
    const toolId = getToolId(m)
    const meta = getNodeMeta(m)
    if (m.manifest_version === 2 && Array.isArray(m.nodes) && m.nodes.length > 0) {
      for (const n of m.nodes) {
        const kind = n.kind as string
        const label = (n.label as string) ?? kind
        const group = (n.group as string) ?? 'other'
        if (!grouped[group]) grouped[group] = []
        grouped[group].push({ dragId: kind, label, icon: meta.icon, color: meta.color, group })
      }
    } else if (toolId) {
      const group = 'tools'
      if (!grouped[group]) grouped[group] = []
      grouped[group].push({ dragId: toolId, label: meta.label, icon: meta.icon, color: meta.color, group })
    }
  }
  return GROUP_ORDER
    .filter((g) => grouped[g]?.length)
    .map((g) => ({ group: g, items: grouped[g] }))
}

// Canvas switching helpers
function switchCanvas(targetId: string) {
  saveCurrentCanvas()
  const { canvasList } = useCanvasStore.getState()
  const target = canvasList.find((c) => c.id === targetId)
  if (!target) return
  useCanvasStore.setState({
    currentCanvasId: targetId, canvasName: target.name,
    nodes: [], edges: [], nodeRuntimeStates: {}, logs: [],
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
  const existingBlank = canvasList.find(
    (c) => c.id !== currentCanvasId && !localStorage.getItem(`champiq:canvas:${c.id}`)
  )
  if (existingBlank) { switchCanvas(existingBlank.id); return }
  saveCurrentCanvas()
  const id = crypto.randomUUID()
  const meta: CanvasMeta = { id, name: 'New Canvas', updatedAt: new Date().toISOString() }
  localStorage.setItem(`champiq:canvas:${id}`, JSON.stringify({ nodes: [], edges: [] }))
  useCanvasStore.setState((s) => ({
    canvasList: [...s.canvasList, meta],
    currentCanvasId: id, canvasName: meta.name,
    nodes: [], edges: [], nodeRuntimeStates: {}, logs: [],
  }))
  localStorage.setItem('champiq:canvas:list', JSON.stringify(useCanvasStore.getState().canvasList))
}

function deleteCanvas(id: string) {
  const { canvasList, currentCanvasId } = useCanvasStore.getState()
  if (canvasList.length <= 1) return
  const updated = canvasList.filter((c) => c.id !== id)
  localStorage.removeItem(`champiq:canvas:${id}`)
  localStorage.setItem('champiq:canvas:list', JSON.stringify(updated))
  useCanvasStore.setState({ canvasList: updated })
  if (id === currentCanvasId) switchCanvas(updated[0].id)
}

export function NodePalette() {
  const { manifests, canvasList, currentCanvasId } = useCanvasStore()
  const { paletteOpen, setPaletteOpen } = useUIStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  function onDragStart(e: React.DragEvent, dragId: string) {
    e.dataTransfer.setData('application/champiq-tool', dragId)
    e.dataTransfer.effectAllowed = 'move'
  }

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

  const palette = buildPalette(manifests)

  if (!paletteOpen) {
    return (
      <div style={{
        width: 28, flexShrink: 0,
        background: 'var(--bg-1)', borderRight: '1px solid var(--border-1)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingTop: 12,
      }}>
        <button
          onClick={() => setPaletteOpen(true)}
          title="Show node palette"
          style={{
            width: 24, height: 24, display: 'grid', placeItems: 'center',
            background: 'transparent', border: 'none', color: 'var(--text-4)',
            cursor: 'pointer', borderRadius: 4,
          }}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    )
  }

  return (
    <aside style={{
      width: 200,
      flexShrink: 0,
      background: 'var(--bg-1)',
      borderRight: '1px solid var(--border-1)',
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px 8px',
        borderBottom: '1px solid var(--border-1)',
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-4)' }}>
          Nodes
        </span>
        <button
          onClick={() => setPaletteOpen(false)}
          style={{ width: 20, height: 20, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none', color: 'var(--text-4)', cursor: 'pointer' }}
        >
          <ChevronLeft size={12} />
        </button>
      </div>

      {/* Canvases */}
      <div style={{ padding: '10px 12px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-4)' }}>
            Canvases
          </span>
          <button
            onClick={createCanvas}
            style={{ width: 18, height: 18, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer' }}
          >
            <Plus size={12} />
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 }}>
          {canvasList.map((c) => (
            <div
              key={c.id}
              onClick={() => c.id !== currentCanvasId && switchCanvas(c.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
                background: c.id === currentCanvasId ? 'rgba(var(--accent-2-rgb),.12)' : 'transparent',
                border: c.id === currentCanvasId ? '1px solid rgba(var(--accent-2-rgb),.2)' : '1px solid transparent',
              }}
            >
              {editingId === c.id ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => commitRename(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(c.id)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  onClick={(e) => e.stopPropagation()}
                  style={{ flex: 1, fontSize: 11, background: 'transparent', border: 'none', color: 'var(--text-1)', outline: 'none' }}
                />
              ) : (
                <span
                  onDoubleClick={() => startRename(c)}
                  style={{
                    flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    color: c.id === currentCanvasId ? 'var(--accent-1)' : 'var(--text-2)',
                    fontFamily: 'var(--font-display)', fontWeight: 500,
                  }}
                >
                  {c.name}
                </span>
              )}
              {canvasList.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); deleteCanvas(c.id) }}
                  style={{ width: 14, height: 14, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none', color: 'var(--text-4)', cursor: 'pointer', opacity: 0, flexShrink: 0 }}
                  className="group-hover-show"
                >
                  <Trash2 size={10} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border-1)' }} />

      {/* Node palette groups */}
      {palette.map(({ group, items }) => (
        <div key={group} style={{ padding: '10px 12px' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 6 }}>
            {GROUP_LABELS[group] || group}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {items.map((item) => {
              const IconComponent = resolveIcon(item.icon)
              return (
                <div
                  key={item.dragId}
                  draggable
                  onDragStart={(e) => onDragStart(e, item.dragId)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 8px', borderRadius: 8,
                    background: 'var(--bg-2)',
                    border: '1px solid var(--border-1)',
                    borderLeft: `3px solid ${item.color}`,
                    cursor: 'grab',
                    transition: 'all .15s ease',
                  }}
                  onMouseEnter={(e) => {
                    const t = e.currentTarget as HTMLElement
                    t.style.background = 'var(--bg-3)'
                    t.style.borderColor = item.color
                  }}
                  onMouseLeave={(e) => {
                    const t = e.currentTarget as HTMLElement
                    t.style.background = 'var(--bg-2)'
                    t.style.borderColor = 'var(--border-1)'
                    t.style.borderLeftColor = item.color
                  }}
                >
                  <span style={{ color: item.color, flexShrink: 0 }}>
                    <IconComponent size={13} />
                  </span>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 500, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </aside>
  )
}
