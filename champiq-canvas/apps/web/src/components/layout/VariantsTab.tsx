import { Tag } from '@/components/atoms'
import { useExecutionStore } from '@/store/executionStore'

interface VariantsTabProps { nodeId: string | null | undefined }

export function VariantsTab({ nodeId }: VariantsTabProps) {
  const runtimeStates = useExecutionStore(s => s.nodeRuntimeStates)
  const nodeState = nodeId ? runtimeStates[nodeId] : undefined

  const branches = (nodeState?.output as Record<string, unknown> | undefined)?.branches as
    Array<{ name: string; count: number; pct: number }> | undefined

  if (!branches?.length) {
    return (
      <div style={{ padding: '40px 14px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
        No variant data yet. Run the canvas to see A/B results.
      </div>
    )
  }

  const winner = branches.reduce((a, b) => (b.pct > a.pct ? b : a))

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
        {branches.length} Variants · A/B split
      </div>
      {branches.map((v, i) => (
        <div key={v.name ?? i} style={{
          background: 'var(--bg-2)',
          border: v.name === winner.name ? '1px solid var(--success)' : '1px solid var(--border-1)',
          borderRadius: 9, padding: '10px 12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{v.name}</div>
            {v.name === winner.name && <Tag color="var(--success)">Winner</Tag>}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)' }}>
            Traffic <span style={{ color: 'var(--text-1)' }}>{v.pct}%</span>
            &nbsp;·&nbsp;Count <span style={{ color: 'var(--text-1)' }}>{v.count}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
