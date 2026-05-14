import { create } from 'zustand'
import type { Node, Edge } from '@xyflow/react'

export interface UserTemplate {
  id: string
  name: string
  createdAt: string
  nodes: Node[]
  edges: Edge[]
}

interface TemplateState {
  templates: UserTemplate[]
  saveTemplate: (name: string, nodes: Node[], edges: Edge[]) => UserTemplate
  deleteTemplate: (id: string) => void
  importTemplate: (json: string) => UserTemplate | null
  exportTemplate: (id: string) => void
}

const STORAGE_KEY = 'champiq:templates'

function load(): UserTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as UserTemplate[]
  } catch { /* noop */ }
  return []
}

function persist(templates: UserTemplate[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
  } catch { /* noop */ }
}

export const useTemplateStore = create<TemplateState>((set, get) => ({
  templates: load(),

  saveTemplate(name, nodes, edges) {
    const t: UserTemplate = { id: crypto.randomUUID(), name: name.trim() || 'My Template', createdAt: new Date().toISOString(), nodes, edges }
    const templates = [t, ...get().templates]
    persist(templates)
    set({ templates })
    return t
  },

  deleteTemplate(id) {
    const templates = get().templates.filter((t) => t.id !== id)
    persist(templates)
    set({ templates })
  },

  importTemplate(json) {
    try {
      const data = JSON.parse(json) as Partial<UserTemplate>
      if (!data.name || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) return null
      const t: UserTemplate = {
        id: crypto.randomUUID(),
        name: data.name,
        createdAt: new Date().toISOString(),
        nodes: data.nodes,
        edges: data.edges,
      }
      const templates = [t, ...get().templates]
      persist(templates)
      set({ templates })
      return t
    } catch {
      return null
    }
  },

  exportTemplate(id) {
    const t = get().templates.find((t) => t.id === id)
    if (!t) return
    const blob = new Blob([JSON.stringify({ name: t.name, nodes: t.nodes, edges: t.edges }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${t.name.replace(/\s+/g, '-').toLowerCase()}.champiq.json`
    a.click()
    URL.revokeObjectURL(url)
  },
}))
