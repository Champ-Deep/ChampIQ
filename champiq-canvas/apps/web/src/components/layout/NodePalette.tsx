import { useCanvasStore } from '@/store/canvasStore'
import { useUIStore } from '@/store/uiStore'
import { getToolId, getNodeMeta } from '@/lib/manifest'
import { resolveIcon } from '@/lib/icons'
import type { ChampIQManifest } from '@/types'
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

export function NodePalette({ embedded = false }: { embedded?: boolean }) {
  const { manifests } = useCanvasStore()
  const { paletteOpen, setPaletteOpen } = useUIStore()
  const palette = buildPalette(manifests)

  function onDragStart(e: React.DragEvent, dragId: string) {
    e.dataTransfer.setData('application/champiq-tool', dragId)
    e.dataTransfer.effectAllowed = 'move'
  }

  // Embedded mode: used as a tab inside LeftPanel — no toggle, fill parent
  if (embedded) {
    return (
      <div style={{
        flex: 1, minHeight: 0,
        background: 'var(--bg-1)',
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        <PaletteItems palette={palette} onDragStart={onDragStart} />
      </div>
    )
  }

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
      width: 200, flexShrink: 0,
      background: 'var(--bg-1)', borderRight: '1px solid var(--border-1)',
      display: 'flex', flexDirection: 'column', overflowY: 'auto',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px 8px', borderBottom: '1px solid var(--border-1)',
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
      <PaletteItems palette={palette} onDragStart={onDragStart} />
    </aside>
  )
}

function PaletteItems({
  palette,
  onDragStart,
}: {
  palette: { group: string; items: PaletteItem[] }[]
  onDragStart: (e: React.DragEvent, dragId: string) => void
}) {
  return (
    <>
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
                    background: 'var(--bg-2)', border: '1px solid var(--border-1)',
                    borderLeft: `3px solid ${item.color}`, cursor: 'grab',
                    transition: 'all .15s ease',
                  }}
                  onMouseEnter={(e) => { const t = e.currentTarget as HTMLElement; t.style.background = 'var(--bg-3)'; t.style.borderColor = item.color }}
                  onMouseLeave={(e) => { const t = e.currentTarget as HTMLElement; t.style.background = 'var(--bg-2)'; t.style.borderColor = 'var(--border-1)'; t.style.borderLeftColor = item.color }}
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
    </>
  )
}
