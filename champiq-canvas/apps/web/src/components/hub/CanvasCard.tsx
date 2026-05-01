import { useState, useRef, useEffect } from 'react'
import { Layers, MoreHorizontal, ExternalLink, Copy, Trash2, Pin } from 'lucide-react'
import type { CanvasMeta } from '@/types'
import { useCanvasStore } from '@/store/canvasStore'

function canvasAccent(id: string): string {
  const palette = ['#7C5CFF', '#00E5C7', '#FF7A59', '#5BC0FF', '#FFC23F', '#E63A87', '#10b981', '#06b6d4']
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return palette[Math.abs(hash) % palette.length]
}

function statusUI(canvas: CanvasMeta) {
  // Derive status from metadata if available
  const s = (canvas as unknown as Record<string, unknown>).status as string | undefined
  if (s === 'running') return { color: 'var(--warn)', label: 'Running' }
  if (s === 'error')   return { color: 'var(--danger)', label: 'Errors' }
  if (s === 'paused')  return { color: 'var(--text-4)', label: 'Paused' }
  if (s === 'draft')   return { color: 'var(--accent-2)', label: 'Draft' }
  return { color: 'var(--text-3)', label: 'Idle' }
}

interface CanvasCardProps {
  canvas: CanvasMeta
  delay?: number
  onClick: () => void
}

export function CanvasCard({ canvas, delay = 0, onClick }: CanvasCardProps) {
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const accent = canvasAccent(canvas.id)
  const status = statusUI(canvas)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    setMenuOpen(false)
    if (!confirm(`Delete "${canvas.name}"? This cannot be undone.`)) return
    const { canvasList, currentCanvasId, setCurrentCanvasId } = useCanvasStore.getState()
    const updated = canvasList.filter((c) => c.id !== canvas.id)
    useCanvasStore.setState({ canvasList: updated })
    localStorage.setItem('champiq:canvas:list', JSON.stringify(updated))
    localStorage.removeItem(`champiq:canvas:${canvas.id}`)
    if (currentCanvasId === canvas.id && updated.length > 0) {
      setCurrentCanvasId(updated[0].id)
      useCanvasStore.setState({ canvasName: updated[0].name })
    }
  }

  function handleDuplicate(e: React.MouseEvent) {
    e.stopPropagation()
    setMenuOpen(false)
    const raw = localStorage.getItem(`champiq:canvas:${canvas.id}`)
    const newId = crypto.randomUUID()
    const newMeta: CanvasMeta = { id: newId, name: `${canvas.name} (copy)`, updatedAt: new Date().toISOString() }
    if (raw) localStorage.setItem(`champiq:canvas:${newId}`, raw)
    const { canvasList } = useCanvasStore.getState()
    const updated = [...canvasList, newMeta]
    useCanvasStore.setState({ canvasList: updated })
    localStorage.setItem('champiq:canvas:list', JSON.stringify(updated))
  }

  const nodeCount = (() => {
    const raw = localStorage.getItem(`champiq:canvas:${canvas.id}`)
    if (!raw) return 0
    try { return (JSON.parse(raw) as { nodes: unknown[] }).nodes.length } catch { return 0 }
  })()

  const updatedLabel = (() => {
    if (!canvas.updatedAt) return 'Never'
    const d = new Date(canvas.updatedAt)
    const diff = Date.now() - d.getTime()
    if (diff < 60_000) return 'Just now'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  })()

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 12,
        padding: 16, cursor: 'pointer', position: 'relative', overflow: 'visible',
        animation: `hub-card-in 420ms var(--ease-spring) ${delay}ms backwards`,
        transition: 'transform .18s var(--ease-swift), border-color .18s var(--ease-swift), box-shadow .18s var(--ease-swift)',
        transform: hovered ? 'translateY(-2px)' : 'none',
        borderColor: hovered ? accent : undefined,
        boxShadow: hovered ? `0 8px 28px -10px ${accent}55` : undefined,
      }}
    >
      {/* Accent top bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: accent, borderRadius: '12px 12px 0 0' }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 9, flexShrink: 0,
          background: `color-mix(in oklch, ${accent} 22%, transparent)`,
          color: accent, display: 'grid', placeItems: 'center',
        }}>
          <Layers size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {canvas.name}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '.06em', color: 'var(--text-3)', marginTop: 2 }}>
            {nodeCount} nodes · {updatedLabel}
          </div>
        </div>

        {/* Status tag */}
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, flexShrink: 0,
          background: `color-mix(in oklch, ${status.color} 14%, transparent)`,
          border: `1px solid color-mix(in oklch, ${status.color} 30%, transparent)`,
          fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.1em', color: status.color,
        }}>
          <span style={{ width: 4, height: 4, borderRadius: '50%', background: status.color }} />
          {status.label}
        </span>

        {/* 3-dot menu */}
        <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o) }}
            style={{
              width: 28, height: 28, display: 'grid', placeItems: 'center',
              background: menuOpen ? 'var(--bg-3)' : 'transparent',
              border: '1px solid transparent', borderRadius: 6,
              color: 'var(--text-3)', cursor: 'pointer', transition: 'all .15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-2)'; e.currentTarget.style.borderColor = 'var(--border-1)' }}
            onMouseLeave={(e) => { if (!menuOpen) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' } }}
          >
            <MoreHorizontal size={14} />
          </button>

          {menuOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 200,
              background: 'var(--bg-2)', border: '1px solid var(--border-2)',
              borderRadius: 9, overflow: 'hidden', minWidth: 150,
              boxShadow: '0 8px 32px rgba(0,0,0,.5)',
              animation: 'bubble-in 150ms var(--ease-spring)',
            }}>
              {[
                { icon: <ExternalLink size={13} />, label: 'Open', action: () => { setMenuOpen(false); onClick() } },
                { icon: <Copy size={13} />, label: 'Duplicate', action: handleDuplicate },
                { icon: <Pin size={13} />, label: 'Pin', action: (e: React.MouseEvent) => { e.stopPropagation(); setMenuOpen(false) } },
              ].map((item, i) => (
                <button
                  key={i}
                  onClick={item.action as React.MouseEventHandler}
                  style={{
                    width: '100%', padding: '8px 12px', background: 'transparent',
                    border: 'none', borderBottom: '1px solid var(--border-1)',
                    color: 'var(--text-2)', fontFamily: 'var(--font-body)', fontSize: 13,
                    textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                    transition: 'background .12s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-3)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  {item.icon} {item.label}
                </button>
              ))}
              <button
                onClick={handleDelete}
                style={{
                  width: '100%', padding: '8px 12px', background: 'transparent',
                  border: 'none', color: 'var(--danger)',
                  fontFamily: 'var(--font-body)', fontSize: 13,
                  textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                  transition: 'background .12s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,77,109,.08)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <Trash2 size={13} /> Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
