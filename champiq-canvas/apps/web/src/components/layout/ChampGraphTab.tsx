import { useState, useEffect } from 'react'
import { getPopulateData } from '@/lib/api/tools'

interface GraphFact { label: string; value: string; meta?: string }
interface ChampGraphTabProps { nodeId: string | null | undefined }

export function ChampGraphTab({ nodeId }: ChampGraphTabProps) {
  const [facts, setFacts] = useState<GraphFact[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!nodeId) return
    setLoading(true)
    setError(null)
    getPopulateData('champgraph', 'prospect_context')
      .then(data => setFacts(data as GraphFact[]))
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [nodeId])

  if (!nodeId) {
    return (
      <div style={{ padding: '40px 14px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
        Select a node to see related graph facts.
      </div>
    )
  }
  if (loading) {
    return (
      <div style={{ padding: '40px 14px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
        Loading…
      </div>
    )
  }
  if (error || !facts.length) {
    return (
      <div style={{ padding: '40px 14px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
        No graph context — connect a ChampGraph node upstream.
      </div>
    )
  }

  return (
    <div style={{ padding: '4px 14px 14px' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 10 }}>
        Related facts · {facts.length}
      </div>
      {facts.map((f, i) => (
        <div key={f.label ?? i} style={{ padding: '10px 0', borderBottom: i < facts.length - 1 ? '1px solid var(--border-1)' : 'none' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-4)' }}>{f.label}</div>
          <div style={{ fontSize: 13.5, color: 'var(--text-1)', marginTop: 2, fontWeight: 500 }}>{f.value}</div>
          {f.meta && <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>{f.meta}</div>}
        </div>
      ))}
    </div>
  )
}
