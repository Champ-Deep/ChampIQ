import type { ChampIQManifest } from '@/types'

export function getToolId(manifest: ChampIQManifest): string {
  return manifest.tool_id ?? manifest['x-champiq']?.tool_id ?? ''
}

export interface NodeMeta {
  label: string
  icon: string
  color: string
  accepts_input_from: string[]
}

export function getNodeMeta(manifest: ChampIQManifest): NodeMeta {
  if (manifest.manifest_version === 2) {
    return {
      label: manifest.name ?? manifest.tool_id ?? 'Node',
      icon: manifest.icon ?? 'box',
      color: manifest.color ?? '#6366F1',
      accepts_input_from: [],
    }
  }
  return (
    manifest['x-champiq']?.canvas?.node ?? {
      label: 'Node',
      icon: 'box',
      color: '#6366F1',
      accepts_input_from: [],
    }
  )
}

export function getRestAction(manifest: ChampIQManifest) {
  return manifest['x-champiq']?.transport?.rest?.action
}

export function getPopulateEndpoints(manifest: ChampIQManifest): Record<string, string> {
  return manifest['x-champiq']?.transport?.rest?.populate ?? {}
}

export function getHealthEndpoint(manifest: ChampIQManifest): string | undefined {
  return manifest['x-champiq']?.transport?.rest?.health
}

export function isEdgeCompatible(sourceToolId: string, targetManifest: ChampIQManifest): boolean {
  const accepts = targetManifest['x-champiq']?.canvas?.node?.accepts_input_from
  if (!accepts) return true
  return accepts.includes(sourceToolId)
}

export function getConfigSchema(manifest: ChampIQManifest) {
  return manifest.properties?.config
}

export function getActions(manifest: ChampIQManifest) {
  return manifest.actions ?? []
}

export function getTriggers(manifest: ChampIQManifest) {
  return manifest.triggers ?? []
}

export function getSystemNodes(manifest: ChampIQManifest) {
  return manifest.nodes ?? []
}

export function isV2(manifest: ChampIQManifest): boolean {
  return manifest.manifest_version === 2
}
