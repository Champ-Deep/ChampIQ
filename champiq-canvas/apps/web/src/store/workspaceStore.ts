import { create } from 'zustand'

export interface Workspace {
  id: string
  name: string
  createdAt: string
}

interface WorkspaceState {
  workspaces: Workspace[]
  currentWorkspaceId: string
  // Actions
  createWorkspace: (name: string) => Workspace
  renameWorkspace: (id: string, name: string) => void
  deleteWorkspace: (id: string) => void
  setCurrentWorkspace: (id: string) => void
  getCurrentWorkspace: () => Workspace
  // Canvas list key for the current workspace
  canvasListKey: () => string
}

const STORAGE_KEY = 'champiq:workspaces'
const DEFAULT_WORKSPACE_ID = 'default'

function defaultWorkspace(): Workspace {
  return { id: DEFAULT_WORKSPACE_ID, name: 'Champions Lab', createdAt: new Date().toISOString() }
}

function load(): { workspaces: Workspace[]; currentWorkspaceId: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { workspaces?: Workspace[]; currentWorkspaceId?: string }
      const workspaces = parsed.workspaces ?? [defaultWorkspace()]
      const currentWorkspaceId = parsed.currentWorkspaceId ?? DEFAULT_WORKSPACE_ID
      return { workspaces, currentWorkspaceId }
    }
  } catch { /* noop */ }
  return { workspaces: [defaultWorkspace()], currentWorkspaceId: DEFAULT_WORKSPACE_ID }
}

function save(workspaces: Workspace[], currentWorkspaceId: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ workspaces, currentWorkspaceId }))
  } catch { /* noop */ }
}

const { workspaces: initWorkspaces, currentWorkspaceId: initCurrent } = load()

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: initWorkspaces,
  currentWorkspaceId: initCurrent,

  createWorkspace(name) {
    const ws: Workspace = { id: crypto.randomUUID(), name: name.trim() || 'New Workspace', createdAt: new Date().toISOString() }
    const workspaces = [...get().workspaces, ws]
    save(workspaces, ws.id)
    set({ workspaces, currentWorkspaceId: ws.id })
    return ws
  },

  renameWorkspace(id, name) {
    const workspaces = get().workspaces.map((w) => w.id === id ? { ...w, name } : w)
    save(workspaces, get().currentWorkspaceId)
    set({ workspaces })
  },

  deleteWorkspace(id) {
    if (id === DEFAULT_WORKSPACE_ID) return
    const workspaces = get().workspaces.filter((w) => w.id !== id)
    if (workspaces.length === 0) workspaces.push(defaultWorkspace())
    const currentWorkspaceId = get().currentWorkspaceId === id
      ? (workspaces[0]?.id ?? DEFAULT_WORKSPACE_ID)
      : get().currentWorkspaceId
    save(workspaces, currentWorkspaceId)
    set({ workspaces, currentWorkspaceId })
  },

  setCurrentWorkspace(id) {
    save(get().workspaces, id)
    set({ currentWorkspaceId: id })
  },

  getCurrentWorkspace() {
    const { workspaces, currentWorkspaceId } = get()
    return workspaces.find((w) => w.id === currentWorkspaceId) ?? workspaces[0] ?? defaultWorkspace()
  },

  canvasListKey() {
    const { currentWorkspaceId } = get()
    return currentWorkspaceId === DEFAULT_WORKSPACE_ID
      ? 'champiq:canvas:list'
      : `champiq:canvas:list:${currentWorkspaceId}`
  },
}))
