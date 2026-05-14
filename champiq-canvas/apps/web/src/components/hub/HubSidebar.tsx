import { useState, useRef, useEffect } from 'react'
import { Icon } from '@/components/atoms'
import type { IconName } from '@/components/atoms'
import { useCanvasStore } from '@/store/canvasStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { loadCanvasFromStorage } from '@/hooks/usePersistence'

interface NavItemProps {
  icon: IconName
  label: string
  active?: boolean
  badge?: string | number
  onClick?: () => void
}

function NavItem({ icon, label, active, badge, onClick }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
        borderRadius: 7, marginBottom: 1, cursor: 'pointer', width: '100%',
        background: active ? 'var(--bg-3)' : 'transparent',
        color: active ? 'var(--text-1)' : 'var(--text-3)',
        fontFamily: active ? 'var(--font-display)' : 'var(--font-body)',
        fontWeight: active ? 600 : 400, fontSize: 13,
        border: 'none', textAlign: 'left',
        transition: 'background .14s, color .14s',
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-2)' }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
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
    </button>
  )
}

interface HubSidebarProps {
  activeView: string
  onNavigate: (view: string) => void
}

export function HubSidebar({ activeView, onNavigate }: HubSidebarProps) {
  const canvasList = useCanvasStore(s => s.canvasList)
  const { workspaces, currentWorkspaceId, createWorkspace, setCurrentWorkspace, renameWorkspace, deleteWorkspace } = useWorkspaceStore()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const editRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (creating) inputRef.current?.focus() }, [creating])
  useEffect(() => { if (editingId) editRef.current?.focus() }, [editingId])

  function handleCreateWorkspace() {
    if (!newName.trim()) { setCreating(false); return }
    createWorkspace(newName.trim())
    setNewName('')
    setCreating(false)
    // Reload canvas list for new (empty) workspace
    useCanvasStore.setState({ canvasList: [], nodes: [], edges: [] })
  }

  function handleSwitchWorkspace(id: string) {
    if (id === currentWorkspaceId) return
    setCurrentWorkspace(id)
    // Load the canvas list for the newly selected workspace
    const listKey = useWorkspaceStore.getState().canvasListKey()
    try {
      const raw = localStorage.getItem(listKey)
      const list = raw ? JSON.parse(raw) : []
      const first = list[0]
      if (first) {
        const saved = loadCanvasFromStorage(first.id)
        useCanvasStore.setState({ canvasList: list, currentCanvasId: first.id, canvasName: first.name, nodes: saved?.nodes ?? [], edges: saved?.edges ?? [] })
      } else {
        useCanvasStore.setState({ canvasList: [], nodes: [], edges: [] })
      }
    } catch { /* noop */ }
  }

  const activeCount = canvasList.filter(c => !c.archived).length

  return (
    <div style={{
      width: 200, flexShrink: 0, background: 'var(--bg-1)',
      borderRight: '1px solid var(--border-1)', padding: '14px 10px',
      display: 'flex', flexDirection: 'column',
    }}>
      <NavItem icon="home"      label="Home"         active={activeView === 'home'}      onClick={() => onNavigate('home')} />
      <NavItem icon="grid"      label="All Canvases" active={activeView === 'canvases'}  badge={activeCount} onClick={() => onNavigate('canvases')} />
      <NavItem icon="templates" label="Templates"    active={activeView === 'templates'} onClick={() => onNavigate('templates')} />
      <NavItem icon="user"      label="Bullpen"      active={activeView === 'bullpen'}   onClick={() => onNavigate('bullpen')} />
      <NavItem icon="archive"   label="Archive"      active={activeView === 'archive'}   onClick={() => onNavigate('archive')} />

      <div style={{ height: 1, background: 'var(--border-1)', margin: '12px 6px' }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', marginBottom: 6 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-4)', letterSpacing: '.14em', textTransform: 'uppercase' }}>
          Workspaces
        </span>
        <button
          onClick={() => setCreating(true)}
          title="New workspace"
          style={{ width: 18, height: 18, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none', color: 'var(--text-4)', cursor: 'pointer', borderRadius: 4, padding: 0 }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.background = 'var(--bg-2)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)'; e.currentTarget.style.background = 'transparent' }}
        >
          <Icon name="plus" size={12} />
        </button>
      </div>

      {workspaces.map((ws) => (
        <div key={ws.id} style={{ position: 'relative', marginBottom: 1 }}>
          {editingId === ws.id ? (
            <input
              ref={editRef}
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onBlur={() => { if (editName.trim()) renameWorkspace(ws.id, editName.trim()); setEditingId(null) }}
              onKeyDown={e => {
                if (e.key === 'Enter') { if (editName.trim()) renameWorkspace(ws.id, editName.trim()); setEditingId(null) }
                if (e.key === 'Escape') setEditingId(null)
              }}
              style={{
                width: '100%', background: 'var(--bg-2)', border: '1px solid var(--accent-2)',
                borderRadius: 6, padding: '6px 10px', fontSize: 12,
                fontFamily: 'var(--font-display)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box',
              }}
            />
          ) : (
            <button
              onClick={() => handleSwitchWorkspace(ws.id)}
              onDoubleClick={() => { setEditingId(ws.id); setEditName(ws.name) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                borderRadius: 7, cursor: 'pointer', width: '100%',
                background: ws.id === currentWorkspaceId ? 'rgba(var(--accent-2-rgb),.1)' : 'transparent',
                color: ws.id === currentWorkspaceId ? 'var(--accent-1)' : 'var(--text-3)',
                fontFamily: ws.id === currentWorkspaceId ? 'var(--font-display)' : 'var(--font-body)',
                fontWeight: ws.id === currentWorkspaceId ? 600 : 400,
                fontSize: 13, border: 'none', textAlign: 'left',
                transition: 'background .14s',
              }}
              onMouseEnter={e => { if (ws.id !== currentWorkspaceId) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-2)' }}
              onMouseLeave={e => { if (ws.id !== currentWorkspaceId) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
            >
              <Icon name="folder" size={13} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ws.name}</span>
              {ws.id === currentWorkspaceId && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-2)', flexShrink: 0 }} />
              )}
            </button>
          )}
        </div>
      ))}

      {creating && (
        <input
          ref={inputRef}
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onBlur={handleCreateWorkspace}
          onKeyDown={e => {
            if (e.key === 'Enter') handleCreateWorkspace()
            if (e.key === 'Escape') { setCreating(false); setNewName('') }
          }}
          placeholder="Workspace name…"
          style={{
            width: '100%', background: 'var(--bg-2)', border: '1px solid var(--accent-2)',
            borderRadius: 6, padding: '6px 10px', fontSize: 12, marginTop: 2,
            fontFamily: 'var(--font-display)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box',
          }}
        />
      )}

      <div style={{ flex: 1 }} />
      <div style={{ padding: '4px 10px', fontSize: 10, color: 'var(--text-4)', fontFamily: 'var(--font-mono)' }}>
        Double-click to rename
      </div>
    </div>
  )
}
