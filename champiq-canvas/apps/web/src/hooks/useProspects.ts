// champiq-canvas/apps/web/src/hooks/useProspects.ts
import { useState, useEffect, useCallback } from 'react'
import { cmListProspects } from '@/lib/api/champmail'
import type { Prospect } from '@/lib/api/champmail'

interface UseProspectsParams {
  status?: string
  search?: string
  limit?: number
}

interface UseProspectsResult {
  prospects: Prospect[]
  total: number
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useProspects(params: UseProspectsParams = {}): UseProspectsResult {
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const { status, search, limit = 200 } = params

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    cmListProspects({ status, search, limit })
      .then(res => {
        if (cancelled) return
        setProspects(res.items)
        setTotal(res.total)
      })
      .catch(err => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load prospects')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [status, search, limit, tick])

  const refresh = useCallback(() => setTick(t => t + 1), [])

  return { prospects, total, loading, error, refresh }
}
