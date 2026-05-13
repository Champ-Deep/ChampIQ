import { useCallback } from 'react'
import { useCanvasStore } from '@/store/canvasStore'
import { useExecutionStore } from '@/store/executionStore'
import { api } from '@/lib/api'

/**
 * Encapsulates the Run All execution flow: submit ad-hoc run → poll until
 * done → reconcile node runtime states. Keeps TopBar a pure render module.
 */
export function useRunAll() {
  const { nodes, edges } = useCanvasStore()
  const { setNodeRuntime, addLog, isRunningAll, setIsRunningAll } = useExecutionStore()

  const runAll = useCallback(async () => {
    if (isRunningAll || nodes.length === 0) return
    setIsRunningAll(true)
    for (const n of nodes) setNodeRuntime(n.id, { status: 'running', error: undefined })
    addLog({ nodeId: 'run', nodeName: 'Run All', status: 'running', message: `Starting execution of ${nodes.length} nodes…` })

    try {
      const { execution_id } = await api.runAdHoc(nodes, edges)

      const poll = async () => {
        const exec = await api.getExecution(execution_id)
        if (exec.status === 'running') { setTimeout(poll, 1000); return }

        const nodeRuns = await api.getNodeRuns(execution_id)
        for (const run of nodeRuns) {
          setNodeRuntime(run.node_id, {
            status: run.status === 'success' ? 'success' : 'error',
            output: run.output as Record<string, unknown> | undefined,
            error: run.error ?? undefined,
          })
        }
        const ranIds = new Set(nodeRuns.map((r) => r.node_id))
        for (const n of nodes) if (!ranIds.has(n.id)) setNodeRuntime(n.id, { status: 'idle' })

        addLog({
          nodeId: 'run', nodeName: 'Run All',
          status: exec.status === 'success' ? 'success' : 'error',
          message: exec.status === 'success'
            ? `Execution complete — ${nodeRuns.length} nodes ran`
            : `Execution failed: ${exec.error ?? 'unknown error'}`,
        })
        setIsRunningAll(false)
      }

      setTimeout(poll, 800)
    } catch (e) {
      for (const n of nodes) setNodeRuntime(n.id, { status: 'idle' })
      addLog({ nodeId: 'run', nodeName: 'Run All', status: 'error', message: String(e) })
      setIsRunningAll(false)
    }
  }, [nodes, edges, isRunningAll, setNodeRuntime, addLog, setIsRunningAll])

  return { runAll, isRunningAll }
}
