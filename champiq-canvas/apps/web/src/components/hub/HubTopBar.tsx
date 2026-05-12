import { Wordmark, Hotkey, Icon } from '@/components/atoms'
import { useUIStore } from '@/store/uiStore'

interface HubTopBarProps { onOpenSettings: () => void }

export function HubTopBar({ onOpenSettings }: HubTopBarProps) {
  const setPaletteOpen = useUIStore(s => s.setPaletteOpen)

  return (
    <div style={{
      height: 52, flexShrink: 0, background: 'var(--bg-1)',
      borderBottom: '1px solid var(--border-1)',
      display: 'flex', alignItems: 'center', padding: '0 18px', gap: 14,
    }}>
      <Wordmark size={20} />
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={() => setPaletteOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px 6px 12px',
            background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 8,
            color: 'var(--text-3)', fontFamily: 'var(--font-body)', fontSize: 12,
            cursor: 'pointer', width: 380, textAlign: 'left',
          }}
        >
          <Icon name="search" size={14} />
          <span style={{ flex: 1 }}>Ask Pixie or search canvases…</span>
          <Hotkey>⌘K</Hotkey>
        </button>
      </div>
      <button
        onClick={onOpenSettings}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
          background: 'transparent', border: '1px solid transparent', borderRadius: 8,
          color: 'var(--text-2)', fontFamily: 'var(--font-display)', fontSize: 13,
          fontWeight: 600, cursor: 'pointer',
        }}
      >
        <Icon name="settings" size={15} />
        Settings
      </button>
      <div style={{
        width: 32, height: 32, borderRadius: 16, background: 'var(--accent-2)',
        display: 'grid', placeItems: 'center', color: '#fff',
        fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13,
      }}>
        D
      </div>
    </div>
  )
}
