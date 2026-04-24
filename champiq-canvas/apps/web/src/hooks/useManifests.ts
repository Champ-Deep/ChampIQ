import { useEffect } from 'react'
import { api } from '@/lib/api'
import { useCanvasStore } from '@/store/canvasStore'
import { getToolId } from '@/lib/manifest'
import type { ChampIQManifest } from '@/types'

/**
 * Loads tool manifests from the API. Accepts both v1 and v2 shapes.
 * No hard dependency on build-time JSON imports — avoids crashing if a legacy
 * manifest file is removed.
 */
export function useManifests() {
  const { setManifests, setToolHealth } = useCanvasStore()

  useEffect(() => {
    api.getManifests()
      .then((raw) => {
        const manifests = raw as unknown as ChampIQManifest[]
        setManifests(manifests)
        for (const m of manifests) {
          const toolId = getToolId(m)
          if (!toolId) continue
          api.getToolStatus(toolId)
            .then((res) => setToolHealth(toolId, res.status === 'ok' ? 'ok' : 'error'))
            .catch(() => setToolHealth(toolId, 'error'))
        }
      })
      .catch(() => {
        setManifests([])
      })
  }, [setManifests, setToolHealth])
}
