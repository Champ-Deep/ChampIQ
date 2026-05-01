import { useCanvasStore } from '@/store/canvasStore'
import { Terminal, ChevronUp, ChevronDown } from 'lucide-react'

interface LogsStripProps {
  expanded: boolean
  onToggle: () => void
}

const STATUS_COLORS: Record<string, string> = {
  idle:    'var(--text-4)',
  running: 'var(--warn)',
  success: 'var(--success)',
  error:   'var(--danger)',
}

export function LogsStrip({ expanded, onToggle }: LogsStripProps) {
  const logs = useCanvasStore((s) => s.logs)
  const lastLog = logs[logs.length - 1]

  return (
    <div style={{
      flexShrink: 0,
      background: 'var(--bg-1)',
      borderTop: '1px solid var(--border-1)',
      transition: 'height .2s var(--ease-swift)',
      height: expanded ? 180 : 34,
      overflow: 'hidden',
    }}>
      {/* Header row */}
      <div style={{
        height: 34,
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        gap: 10,
        borderBottom: expanded ? '1px solid var(--border-1)' : 'none',
        cursor: 'pointer',
        userSelect: 'none',
      }} onClick={onToggle}>
        <Terminal size={12} color="var(--mint-2)" />
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '.14em',
          textTransform: 'uppercase',
          color: 'var(--text-4)',
        }}>Events</span>
        {!expanded && lastLog && (
          <span style={{
            flex: 1,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: STATUS_COLORS[lastLog.status] || 'var(--text-3)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {lastLog.nodeName} — {lastLog.message}
          </span>
        )}
        {!expanded && !lastLog && (
          <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-4)' }}>
            No events yet
          </span>
        )}
        <span style={{ marginLeft: 'auto', color: 'var(--text-4)' }}>
          {expanded ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </span>
      </div>

      {/* Expanded log rows */}
      {expanded && (
        <div style={{
          height: 146,
          overflowY: 'auto',
          padding: '6px 14px',
        }}>
          {logs.length === 0 && (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-4)', marginTop: 8 }}>
              No events yet. Run a stage to see logs.
            </p>
          )}
          {[...logs].reverse().map((log) => (
            <div key={log.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 4 }}>
              <span style={{ flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-4)', minWidth: 70 }}>
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <span style={{ flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', minWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {log.nodeName}
              </span>
              <span style={{ flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 10, minWidth: 50, color: STATUS_COLORS[log.status] || 'var(--text-3)' }}>
                {log.status}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {log.message}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
