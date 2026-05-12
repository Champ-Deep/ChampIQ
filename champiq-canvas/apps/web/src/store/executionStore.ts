// champiq-canvas/apps/web/src/store/executionStore.ts
import { create } from 'zustand'
import type { NodeRuntimeState, LogEntry } from '@/types'

const MAX_LOG_ENTRIES = 10

interface ExecutionStore {
  nodeRuntimeStates: Record<string, NodeRuntimeState>
  logs: LogEntry[]
  isRunningAll: boolean

  setNodeRuntime: (nodeId: string, state: Partial<NodeRuntimeState>) => void
  addLog: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void
  setIsRunningAll: (v: boolean) => void
  clearExecution: () => void
}

export const useExecutionStore = create<ExecutionStore>()((set) => ({
  nodeRuntimeStates: {},
  logs: [],
  isRunningAll: false,

  setNodeRuntime: (nodeId, state) =>
    set((prev) => ({
      nodeRuntimeStates: {
        ...prev.nodeRuntimeStates,
        [nodeId]: { ...(prev.nodeRuntimeStates[nodeId] ?? {}), ...state },
      },
    })),

  addLog: (entry) =>
    set((s) => ({
      logs: [
        { ...entry, id: crypto.randomUUID(), timestamp: new Date().toISOString() },
        ...s.logs.slice(0, MAX_LOG_ENTRIES - 1),
      ],
    })),

  setIsRunningAll: (v) => set({ isRunningAll: v }),

  clearExecution: () => set({ nodeRuntimeStates: {}, logs: [], isRunningAll: false }),
}))
