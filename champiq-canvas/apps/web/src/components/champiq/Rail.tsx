import type { RailTab, RailStyle } from '@/store/uiStore'
import {
  MessageSquare, Mail, Network, Settings, ChevronLeft,
} from 'lucide-react'

interface RailItem {
  id: RailTab
  icon: React.ReactNode
  label: string
  hotkey: string
}

const RAIL_ITEMS: RailItem[] = [
  { id: 'chat',  icon: <MessageSquare size={18} />, label: 'Pixie',     hotkey: '⌘1' },
  { id: 'mail',  icon: <Mail size={18} />,          label: 'ChampMail', hotkey: '⌘2' },
  { id: 'graph', icon: <Network size={18} />,       label: 'ChampGraph', hotkey: '⌘3' },
]

interface RailProps {
  active: RailTab
  onSelect: (tab: RailTab) => void
  onSettings: () => void
  variant?: RailStyle
}

export function Rail({ active, onSelect, onSettings, variant = 'glyph' }: RailProps) {
  return (
    <div style={{
      width: 56,
      flexShrink: 0,
      background: 'var(--bg-1)',
      borderRight: '1px solid var(--border-1)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '10px 0',
      gap: 0,
    }}>
      {/* Logo mark */}
      <div style={{ marginBottom: 16 }}>
        <ChampMark size={22} />
      </div>

      {/* Nav items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
        {RAIL_ITEMS.map((item) => (
          <RailButton
            key={item.id}
            item={item}
            active={active === item.id}
            onClick={() => onSelect(item.id)}
            variant={variant}
          />
        ))}
      </div>

      {/* Bottom actions */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 4,
        paddingTop: 8, borderTop: '1px solid var(--border-1)', width: 40,
      }}>
        <button
          title="Settings  ⌘,"
          onClick={onSettings}
          style={railBtnStyle(false, variant)}
        >
          <Settings size={16} />
        </button>
        <button
          title="Collapse rail"
          style={railBtnStyle(false, variant)}
        >
          <ChevronLeft size={14} />
        </button>
      </div>
    </div>
  )
}

function railBtnStyle(active: boolean, variant: RailStyle = 'glyph'): React.CSSProperties {
  const isGlyph = variant === 'glyph'
  return {
    width: 40,
    height: 40,
    display: 'grid',
    placeItems: 'center',
    background: active
      ? isGlyph ? 'rgba(var(--accent-2-rgb),.16)' : 'var(--bg-3)'
      : 'transparent',
    color: active ? 'var(--accent-1)' : 'var(--text-3)',
    border: 'none',
    borderRadius: 10,
    cursor: 'pointer',
    position: 'relative',
    transition: 'all .18s var(--ease-swift)',
    boxShadow: active && isGlyph
      ? '0 0 16px -4px rgba(var(--accent-2-rgb),.7), inset 0 0 0 1px rgba(var(--accent-2-rgb),.35)'
      : 'none',
  }
}

interface RailButtonProps {
  item: RailItem
  active: boolean
  onClick: () => void
  variant: RailStyle
}

function RailButton({ item, active, onClick, variant }: RailButtonProps) {
  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
      {active && variant === 'classic' && (
        <div style={{
          position: 'absolute',
          left: -8,
          top: 7,
          bottom: 7,
          width: 3,
          borderRadius: 2,
          background: 'var(--accent-2)',
          boxShadow: '0 0 8px var(--accent-2)',
        }} />
      )}
      <button
        title={`${item.label}  ${item.hotkey}`}
        onClick={onClick}
        style={railBtnStyle(active, variant)}
      >
        {item.icon}
      </button>
    </div>
  )
}

// ── Wordmark pixel mark ────────────────────────────────────────────────────

function ChampMark({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} shapeRendering="crispEdges">
      <rect x="2" y="6" width="3" height="3" fill="var(--accent-2)" />
      <rect x="5" y="3" width="3" height="3" fill="var(--accent-1)" />
      <rect x="8" y="6" width="3" height="3" fill="var(--accent-2)" />
      <rect x="5" y="9" width="3" height="3" fill="var(--accent-3)" />
      <rect x="11" y="9" width="3" height="3" fill="var(--mint-2)" />
    </svg>
  )
}
