import { Icon } from '@/components/atoms'
import type { IconName } from '@/components/atoms'
import { useCanvasStore } from '@/store/canvasStore'

interface NavItemProps {
  icon: IconName
  label: string
  active?: boolean
  badge?: string | number
  onClick?: () => void
}

function NavItem({ icon, label, active, badge, onClick }: NavItemProps) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
        borderRadius: 7, marginBottom: 1, cursor: 'pointer',
        background: active ? 'var(--bg-3)' : 'transparent',
        color: active ? 'var(--text-1)' : 'var(--text-3)',
        fontFamily: active ? 'var(--font-display)' : 'var(--font-body)',
        fontWeight: active ? 600 : 400, fontSize: 13,
        transition: 'background .14s, color .14s',
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-2)' }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
    >
      <Icon name={icon} size={15} />
      <span style={{ flex: 1 }}>{label}</span>
      {badge !== undefined && (
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, padding: '1px 6px',
          borderRadius: 8, background: 'var(--bg-2)', color: 'var(--text-3)',
        }}>
          {badge}
        </span>
      )}
    </div>
  )
}

interface HubSidebarProps {
  activeView: string
  onNavigate: (view: string) => void
}

export function HubSidebar({ activeView, onNavigate }: HubSidebarProps) {
  const canvasList = useCanvasStore(s => s.canvasList)

  return (
    <div style={{
      width: 200, flexShrink: 0, background: 'var(--bg-1)',
      borderRight: '1px solid var(--border-1)', padding: '14px 10px',
    }}>
      <NavItem icon="home"      label="Home"         active={activeView === 'home'}      onClick={() => onNavigate('home')} />
      <NavItem icon="grid"      label="All Canvases" active={activeView === 'canvases'}  badge={canvasList.length} onClick={() => onNavigate('canvases')} />
      <NavItem icon="templates" label="Templates"    active={activeView === 'templates'} onClick={() => onNavigate('templates')} />
      <NavItem icon="user"      label="Bullpen"      active={activeView === 'bullpen'}   onClick={() => onNavigate('bullpen')} />
      <NavItem icon="archive"   label="Archive"      active={activeView === 'archive'}   onClick={() => onNavigate('archive')} />
      <div style={{ height: 1, background: 'var(--border-1)', margin: '12px 6px' }} />
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)',
        padding: '6px 10px', letterSpacing: '.14em', textTransform: 'uppercase',
      }}>
        WORKSPACES
      </div>
      <NavItem icon="folder" label="Champions Lab" active />
      <NavItem icon="folder" label="Sandbox" />
    </div>
  )
}
