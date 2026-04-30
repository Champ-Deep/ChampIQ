import { useEffect, useRef } from 'react'
import { useCredentialStore } from '@/store/credentialStore'
import { useCanvasStore } from '@/store/canvasStore'
import { api } from '@/lib/api'

const B2B_PULSE_WS_URL = 'wss://b2b-pulse.up.railway.app/api/ws/events'

/**
 * Opens a WebSocket to B2B Pulse's real-time event stream whenever a
 * LakeB2B Pulse credential exists.
 *
 * On `poll_status` events with a successful status, any canvas
 * `lakeb2b_pulse` nodes whose action is "list_posts" are immediately
 * re-executed so their output shows fresh posts without requiring the
 * user to click Run.
 */
export function useB2BPulseEvents() {
  const wsRef = useRef<WebSocket | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const credIdRef = useRef<number | null>(null)

  const credentials = useCredentialStore((s) => s.credentials)

  useEffect(() => {
    const lakeb2bCred = credentials.find((c) => c.type === 'lakeb2b')
    const credId = lakeb2bCred ? Number(lakeb2bCred.fields.credential_id) : null

    if (!credId || isNaN(credId)) {
      wsRef.current?.close()
      wsRef.current = null
      credIdRef.current = null
      return
    }

    // Already connected for this credential
    if (credId === credIdRef.current && wsRef.current?.readyState === WebSocket.OPEN) return

    credIdRef.current = credId

    let cancelled = false

    async function connect() {
      if (cancelled) return
      try {
        const { access_token, ws_url } = await api.getLakeB2BWsToken(credId!)
        if (cancelled) return

        const url = `${ws_url || B2B_PULSE_WS_URL}?token=${encodeURIComponent(access_token)}`
        const ws = new WebSocket(url)
        wsRef.current = ws

        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data) as Record<string, unknown>
            handlePollEvent(msg)
          } catch {
            // ignore malformed
          }
        }

        ws.onerror = () => ws.close()

        ws.onclose = () => {
          if (cancelled) return
          retryRef.current = setTimeout(connect, 5000)
        }
      } catch {
        if (cancelled) return
        retryRef.current = setTimeout(connect, 10000)
      }
    }

    connect()

    return () => {
      cancelled = true
      if (retryRef.current) clearTimeout(retryRef.current)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [credentials])
}

async function pollJobUntilDone(jobId: string, nodeId: string) {
  const store = useCanvasStore.getState()
  const maxAttempts = 60 // 5 min at 5s intervals
  let attempts = 0

  const poll = async () => {
    if (attempts++ >= maxAttempts) {
      useCanvasStore.getState().setNodeRuntime(nodeId, { status: 'error', error: 'Job timed out' })
      return
    }
    try {
      const job = await api.getJob(jobId)
      if (job.status === 'done') {
        useCanvasStore.getState().setNodeRuntime(nodeId, {
          status: 'success',
          output: job.result ?? undefined,
        })
        useCanvasStore.getState().addLog({
          nodeId,
          nodeName: 'LakeB2B Pulse',
          status: 'success',
          message: 'Posts refreshed from B2B Pulse poll.',
        })
      } else if (job.status === 'error') {
        useCanvasStore.getState().setNodeRuntime(nodeId, { status: 'error', error: 'Job failed' })
      } else {
        setTimeout(poll, 5000)
      }
    } catch {
      setTimeout(poll, 5000)
    }
  }

  // Keep TS happy — store is used transitively via getState() calls above
  void store
  await poll()
}

function handlePollEvent(msg: Record<string, unknown>) {
  const type = msg.type as string | undefined
  if (type !== 'poll_status') return

  const payload = (msg.payload ?? msg) as Record<string, unknown>
  const status = payload.status as string | undefined
  if (status !== 'ok' && status !== 'done' && status !== 'success') return

  const store = useCanvasStore.getState()

  // Find lakeb2b_pulse nodes configured for list_posts
  const listPostsNodes = store.nodes.filter((n) => {
    if ((n.data.kind as string | undefined) !== 'lakeb2b_pulse') return false
    const config = (n.data.config as Record<string, unknown>) ?? {}
    return config.action === 'list_posts'
  })

  for (const node of listPostsNodes) {
    const config = (node.data.config as Record<string, unknown>) ?? {}

    store.setNodeRuntime(node.id, { status: 'running' })
    store.addLog({
      nodeId: node.id,
      nodeName: 'LakeB2B Pulse',
      status: 'running',
      message: 'B2B Pulse poll complete — refreshing posts…',
    })

    const nodeId = node.id
    api.runAction('lakeb2b_pulse', 'list_posts', { config })
      .then((result) => {
        if (result.async && result.job_id) {
          pollJobUntilDone(result.job_id, nodeId)
        } else {
          useCanvasStore.getState().setNodeRuntime(nodeId, { status: 'success' })
        }
      })
      .catch((err) => {
        useCanvasStore.getState().setNodeRuntime(nodeId, { status: 'error', error: String(err) })
        useCanvasStore.getState().addLog({
          nodeId,
          nodeName: 'LakeB2B Pulse',
          status: 'error',
          message: String(err),
        })
      })
  }
}
