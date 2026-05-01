import { describe, it, expect } from 'vitest'
import { isEdgeCompatible, getToolId, getNodeMeta, getConfigSchema } from '@/lib/manifest'
import champgraphRaw from '../../../manifests/champgraph.manifest.json'
import champmailRaw from '../../../manifests/champmail.manifest.json'
import champvoiceRaw from '../../../manifests/champvoice.manifest.json'
import type { ChampIQManifest } from '@/types'

const champgraph = champgraphRaw as unknown as ChampIQManifest
const champmail = champmailRaw as unknown as ChampIQManifest
const champvoice = champvoiceRaw as unknown as ChampIQManifest
const allManifests = [champgraph, champmail, champvoice]

describe('manifest utilities', () => {
  it('extracts tool_id correctly', () => {
    expect(getToolId(champgraph)).toBe('champgraph')
    expect(getToolId(champmail)).toBe('champmail')
    expect(getToolId(champvoice)).toBe('champvoice')
  })

  it('champgraph accepts no input (source node)', () => {
    expect(getNodeMeta(champgraph).accepts_input_from).toEqual([])
  })

  it('champmail accepts input from champgraph', () => {
    expect(isEdgeCompatible('champgraph', champmail)).toBe(true)
  })

  it('champmail rejects input from champvoice', () => {
    expect(isEdgeCompatible('champvoice', champmail)).toBe(false)
  })

  it('champvoice accepts input from champgraph', () => {
    expect(isEdgeCompatible('champgraph', champvoice)).toBe(true)
  })

  it('champvoice rejects input from champmail', () => {
    expect(isEdgeCompatible('champmail', champvoice)).toBe(false)
  })
})

describe('manifest structure validation', () => {
  it('all manifests have required x-champiq fields', () => {
    for (const m of allManifests) {
      const xchampiq = m['x-champiq']
      expect(xchampiq).toBeDefined()
      expect(xchampiq?.tool_id).toBeTruthy()
      expect(xchampiq?.canvas.node.label).toBeTruthy()
      expect(xchampiq?.canvas.node.color).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(Array.isArray(xchampiq?.canvas.node.accepts_input_from)).toBe(true)
    }
  })

  it('all manifests have config and output properties', () => {
    for (const m of allManifests) {
      expect(getConfigSchema(m)).toBeDefined()
      expect(m.properties?.output).toBeDefined()
    }
  })

  it('all manifests have transport.rest.action', () => {
    for (const m of allManifests) {
      const xchampiq = m['x-champiq']
      expect(xchampiq?.transport.rest.action.endpoint).toBeTruthy()
      expect(xchampiq?.transport.rest.action.button_label).toBeTruthy()
    }
  })
})
