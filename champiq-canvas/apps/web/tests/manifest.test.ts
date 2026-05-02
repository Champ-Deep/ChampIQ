import { describe, it, expect } from 'vitest'
import { isEdgeCompatible, getToolId, getNodeMeta, isV2 } from '@/lib/manifest'
import champgraphRaw from '../../../manifests/champgraph.manifest.json'
import champmailRaw from '../../../manifests/champmail.manifest.json'
import champvoiceRaw from '../../../manifests/champvoice.manifest.json'
import type { ChampIQManifest } from '@/types'

const champgraph = champgraphRaw as unknown as ChampIQManifest
const champmail = champmailRaw as unknown as ChampIQManifest
const champvoice = champvoiceRaw as unknown as ChampIQManifest
const allManifests = [champgraph, champmail, champvoice]

// NOTE: production manifests are schema v2 (top-level `tool_id`, `name`,
// `color`, `actions[]`). The legacy v1 fields `x-champiq.canvas.node.accepts_input_from`,
// `properties.config`, and `transport.rest.action` are not present on v2 manifests,
// and `lib/manifest.ts` returns sensible fallbacks (true / undefined / empty array)
// when those fields are missing. Tests assert the *current* live behavior — the
// v1/v2 divergence in `lib/manifest.ts` itself is flagged in REFACTOR_REPORT.md.

describe('manifest utilities', () => {
  it('extracts tool_id correctly', () => {
    expect(getToolId(champgraph)).toBe('champgraph')
    expect(getToolId(champmail)).toBe('champmail')
    expect(getToolId(champvoice)).toBe('champvoice')
  })

  it('getNodeMeta returns v2 name/color/icon', () => {
    expect(getNodeMeta(champgraph).label).toBe('ChampGraph')
    expect(getNodeMeta(champgraph).color).toBe('#10B981')
    expect(getNodeMeta(champgraph).icon).toBe('graph')
    // v2 manifests don't carry an accepts_input_from list — defaults to empty.
    expect(getNodeMeta(champgraph).accepts_input_from).toEqual([])
  })

  it('isEdgeCompatible defaults to true when no v1 accepts_input_from list is present', () => {
    // v2 manifests don't supply `x-champiq.canvas.node.accepts_input_from`, so
    // every connection is allowed today. This is a known-flagged behavior gap;
    // see REFACTOR_REPORT.md "v1/v2 manifest divergence".
    expect(isEdgeCompatible('champgraph', champmail)).toBe(true)
    expect(isEdgeCompatible('champvoice', champmail)).toBe(true)
    expect(isEdgeCompatible('champgraph', champvoice)).toBe(true)
    expect(isEdgeCompatible('champmail', champvoice)).toBe(true)
  })
})

describe('manifest structure validation', () => {
  it('all manifests are schema v2', () => {
    for (const m of allManifests) {
      expect(isV2(m)).toBe(true)
      expect(m.manifest_version).toBe(2)
    }
  })

  it('all manifests have required v2 top-level fields', () => {
    for (const m of allManifests) {
      expect(m.tool_id).toBeTruthy()
      expect(m.name).toBeTruthy()
      expect(m.color).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(m.icon).toBeTruthy()
    }
  })

  it('all manifests declare an actions array', () => {
    for (const m of allManifests) {
      expect(Array.isArray(m.actions)).toBe(true)
      expect((m.actions ?? []).length).toBeGreaterThan(0)
    }
  })

  it('every action has id, label, and input_schema', () => {
    for (const m of allManifests) {
      for (const action of m.actions ?? []) {
        expect(action.id).toBeTruthy()
        expect(action.label).toBeTruthy()
        // input_schema is optional in the type but every production action has one
        expect(action.input_schema).toBeDefined()
      }
    }
  })
})
