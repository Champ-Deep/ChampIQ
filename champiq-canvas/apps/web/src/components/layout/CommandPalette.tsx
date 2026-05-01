import { useState, useEffect, useRef } from 'react'
import { Search, Layers, Play, Plus, Upload, Sparkles, User } from 'lucide-react'
import { useCanvasStore } from '@/store/canvasStore'
import { useUIStore } from '@/store/uiStore'
import { Pixie } from '@/components/pixie/Pixie'

interface CmdItem {
  group: string
  icon: React.ReactNode
  label: string
  meta: string
  color: string
  action?: () => void
}

interface CommandPaletteProps {
  onClose: () => void
  onOpenCanvas: (id: string) => void
  onNewCanvas: () => void
}

export function CommandPalette({ onClose, onOpenCanvas, onNewCanvas }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const { canvasList } = useCanvasStore()
  const { cloak, accent, setSettingsOpen, setActiveRail } = useUIStore()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowDown') setActiveIdx((i) => Math.min(i + 1, filtered.length - 1))
      if (e.key === 'ArrowUp') setActiveIdx((i) => Math.max(i - 1, 0))
      if (e.key === 'Enter') {
        const item = filtered[activeIdx]
        if (item?.action) { item.action(); onClose() }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  const allItems: CmdItem[] = [
    ...canvasList.map((c) => ({
      group: 'Canvases',
      icon: <Layers size={13} />,
      label: c.name,
      meta: `Canvas · ${new Date(c.updatedAt || '').toLocaleDateString()}`,
      color: 'var(--accent-2)',
      action: () => onOpenCanvas(c.id),
    })),
    {
      group: 'Actions',
      icon: <Plus size={13} />,
      label: 'New Canvas',
      meta: '⌘N',
      color: 'var(--accent-2)',
      action: onNewCanvas,
    },
    {
      group: 'Actions',
      icon: <Play size={13} />,
      label: 'Run All — current stage',
      meta: '⌘⏎',
      color: 'var(--accent-2)',
      action: undefined,
    },
    {
      group: 'Actions',
      icon: <Upload size={13} />,
      label: 'Import CSV to Bullpen',
      meta: '',
      color: 'var(--accent-2)',
      action: undefined,
    },
    {
      group: 'Actions',
      icon: <User size={13} />,
      label: 'Open Settings',
      meta: '⌘,',
      color: 'var(--accent-2)',
      action: () => setSettingsOpen(true),
    },
    {
      group: 'Pixie',
      icon: <Sparkles size={13} />,
      label: 'Ask Pixie anything',
      meta: 'AI',
      color: 'var(--mint-2)',
      action: () => setActiveRail('chat'),
    },
    {
      group: 'Pixie',
      icon: <Sparkles size={13} />,
      label: 'Enrich Bullpen with Pixie',
      meta: 'AI',
      color: 'var(--mint-2)',
      action: undefined,
    },
  ]

  const filtered = query
    ? allItems.filter((i) =>
        i.label.toLowerCase().includes(query.toLowerCase()) ||
        i.group.toLowerCase().includes(query.toLowerCase())
      )
    : allItems

  const groups: Record<string, CmdItem[]> = {}
  filtered.forEach((item) => {
    if (!groups[item.group]) groups[item.group] = []
    groups[item.group].push(item)
  })

  let globalIdx = 0

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(7,9,18,.65)', backdropFilter: 'blur(8px)',
        display: 'grid', placeItems: 'center',
      }}
    >
      <div
        data-accent={accent}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 600, background: 'var(--bg-1)', border: '1px solid var(--border-2)',
          borderRadius: 16, overflow: 'hidden',
          boxShadow: '0 32px 80px rgba(0,0,0,.65), 0 0 0 1px rgba(var(--accent-2-rgb),.15)',
          animation: 'bubble-in 180ms var(--ease-spring)',
        }}
      >
        {/* Search input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
          borderBottom: '1px solid var(--border-1)',
          background: 'linear-gradient(180deg, rgba(var(--accent-2-rgb),.05) 0%, transparent 100%)',
        }}>
          <Search size={18} color="var(--accent-2)" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(0) }}
            placeholder="Search stages, prospects, actions…"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text-1)', fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 500,
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Pixie pose="idle" size={28} cloak={cloak} ambient={false} />
            <kbd style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, padding: '3px 6px', borderRadius: 4,
              background: 'var(--bg-3)', border: '1px solid var(--border-1)', color: 'var(--text-3)',
            }}>Esc</kbd>
          </div>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <div style={{
                padding: '8px 16px 4px',
                fontFamily: 'var(--font-mono)', fontSize: 9.5,
                letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-4)',
              }}>{group}</div>
              {items.map((item) => {
                const idx = globalIdx++
                const isActive = idx === activeIdx
                return (
                  <div
                    key={idx}
                    onClick={() => { item.action?.(); onClose() }}
                    onMouseEnter={() => setActiveIdx(idx)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                      background: isActive ? 'rgba(var(--accent-2-rgb),.10)' : 'transparent',
                      cursor: 'pointer', transition: 'background .12s',
                      borderLeft: isActive ? '2px solid var(--accent-2)' : '2px solid transparent',
                    }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                      background: `color-mix(in oklch, ${item.color} 16%, var(--bg-0))`,
                      color: item.color, display: 'grid', placeItems: 'center',
                    }}>
                      {item.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13.5, color: 'var(--text-1)' }}>{item.label}</div>
                      {item.meta && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-4)', marginTop: 1 }}>{item.meta}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center' }}>
              <Pixie pose="think" size={56} cloak={cloak} ambient={false} />
              <div style={{ marginTop: 12, fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--text-3)' }}>
                No results for "{query}"
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 4 }}>
                Try a canvas name or action.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '8px 16px', borderTop: '1px solid var(--border-1)',
          display: 'flex', gap: 16, alignItems: 'center', background: 'var(--bg-0)',
        }}>
          {[['↑↓', 'Navigate'], ['↵', 'Open'], ['Esc', 'Close']].map(([k, l]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--bg-2)', border: '1px solid var(--border-1)', color: 'var(--text-3)' }}>{k}</kbd>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-4)' }}>{l}</span>
            </div>
          ))}
          <span style={{ flex: 1 }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-4)' }}>
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  )
}
