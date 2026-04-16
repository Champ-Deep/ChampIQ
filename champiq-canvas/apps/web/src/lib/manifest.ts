import type { ChampIQManifest } from '@/types'

export function getToolId(manifest: ChampIQManifest): string {
  return manifest['x-champiq'].tool_id
}

export function getNodeMeta(manifest: ChampIQManifest) {
  return manifest['x-champiq'].canvas.node
}

export function getRestAction(manifest: ChampIQManifest) {
  return manifest['x-champiq'].transport.rest.action
}

export function getPopulateEndpoints(manifest: ChampIQManifest): Record<string, string> {
  return manifest['x-champiq'].transport.rest.populate ?? {}
}

export function getHealthEndpoint(manifest: ChampIQManifest): string {
  return manifest['x-champiq'].transport.rest.health
}

export function isEdgeCompatible(sourceToolId: string, targetManifest: ChampIQManifest): boolean {
  const accepts = targetManifest['x-champiq'].canvas.node.accepts_input_from
  return accepts.includes(sourceToolId)
}

export function getConfigSchema(manifest: ChampIQManifest) {
  return manifest.properties.config
}
