import { useCanvasStore } from '@/store/canvasStore'
import type { NodeStatus } from '@/types'

const STATUS_COLORS: Record<NodeStatus, string> = {
  idle:    'text-slate-400',
  running: 'text-blue-400',
  success: 'text-green-400',
  error:   'text-red-400',
}

export function BottomLog() {
  const logs = useCanvasStore((s) => s.logs)

  return (
    <div
      className="h-28 shrink-0 overflow-y-auto px-3 py-2"
      style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border)' }}
      aria-label="Event log"
      aria-live="polite"
    >
      <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-3)' }}>Events</p>
      {logs.length === 0 && (
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>No events yet. Run a node action to see logs.</p>
      )}
      {logs.map((log) => (
        <div key={log.id} className="flex items-start gap-2 text-xs mb-0.5">
          <span className="shrink-0 w-20 tabular-nums" style={{ color: 'var(--text-3)' }}>
            {new Date(log.timestamp).toLocaleTimeString()}
          </span>
          <span className="shrink-0 w-32 truncate" style={{ color: 'var(--text-2)' }}>{log.nodeName}</span>
          <span className={`shrink-0 w-14 ${STATUS_COLORS[log.status]}`}>{log.status}</span>
          <span className="truncate" style={{ color: 'var(--text-1)' }}>{log.message}</span>
        </div>
      ))}
    </div>
  )
}
