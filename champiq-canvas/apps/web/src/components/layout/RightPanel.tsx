import { useState } from 'react'
import { useCanvasStore } from '@/store/canvasStore'
import { X, Copy, Check } from 'lucide-react'
import type { ChampIQManifest } from '@/types'

export function RightPanel() {
  const { selectedNodeId, nodes, nodeRuntimeStates, setSelectedNode } = useCanvasStore()
  const [copied, setCopied] = useState(false)

  const node = nodes.find((n) => n.id === selectedNodeId)
  if (!node) return null

  const manifest = node.data.manifest as ChampIQManifest
  const runtime = nodeRuntimeStates[selectedNodeId!] ?? {}
  const jsonText = JSON.stringify({ config: node.data.config, runtime }, null, 2)

  async function handleCopy() {
    await navigator.clipboard.writeText(jsonText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <aside
      className="w-72 shrink-0 flex flex-col overflow-hidden"
      style={{ background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)' }}
      aria-label="Node inspector"
    >
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
          {manifest['x-champiq'].canvas.node.label} Inspector
        </span>
        <div className="flex gap-1">
          <button onClick={handleCopy} className="p-1 rounded" style={{ color: 'var(--text-3)' }} aria-label="Copy output JSON">
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <button onClick={() => setSelectedNode(null)} className="p-1 rounded" style={{ color: 'var(--text-3)' }} aria-label="Close inspector">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <p className="text-xs mb-1 font-medium" style={{ color: 'var(--text-2)' }}>Status</p>
        <p className="text-sm mb-3 capitalize" style={{ color: 'var(--text-1)' }}>
          {(runtime as Record<string, unknown>).status as string ?? 'idle'}
        </p>
        <p className="text-xs mb-1 font-medium" style={{ color: 'var(--text-2)' }}>Full Output</p>
        <pre className="text-xs rounded p-2 overflow-x-auto whitespace-pre-wrap break-words"
          style={{ background: 'var(--bg-sidebar)', color: 'var(--text-1)' }}>
          {jsonText}
        </pre>
      </div>
    </aside>
  )
}
