import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import { useCanvasStore } from '@/store/canvasStore'

const EDGE_COLORS: Record<string, string> = {
  waiting: '#64748b',
  active: '#3b82f6',
  error: '#ef4444',
}

export function CustomEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, data, source,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  })

  const state = (data?.state as string) ?? 'waiting'
  const color = EDGE_COLORS[state] ?? EDGE_COLORS.waiting
  const animated = state === 'active'

  const nodeRuntimeStates = useCanvasStore((s) => s.nodeRuntimeStates)
  const sourceRuntime = source ? nodeRuntimeStates[source] : undefined
  const records = sourceRuntime?.output
    ? ((sourceRuntime.output as Record<string, unknown>).records as unknown[] | undefined)
    : null
  const prospectCount = Array.isArray(records) ? records.length : null

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth: 2,
          strokeDasharray: state === 'waiting' ? '5 5' : undefined,
        }}
        className={animated ? 'react-flow__edge-animated' : ''}
      />
      {prospectCount !== null && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="bg-slate-800 text-slate-200 text-xs px-1.5 py-0.5 rounded border border-slate-600"
          >
            {prospectCount} prospects
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
