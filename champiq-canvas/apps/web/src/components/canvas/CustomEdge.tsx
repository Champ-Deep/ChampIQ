import { useState } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow, type EdgeProps } from '@xyflow/react'
import { useCanvasStore } from '@/store/canvasStore'

const EDGE_COLORS: Record<string, string> = {
  waiting: '#64748b',
  active:  '#3b82f6',
  error:   '#ef4444',
}

export function CustomEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, data, source, selected,
}: EdgeProps) {
  const [hovered, setHovered] = useState(false)
  const { deleteElements } = useReactFlow()

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  })

  const state = (data?.state as string) ?? 'waiting'
  const baseColor = EDGE_COLORS[state] ?? EDGE_COLORS.waiting
  const strokeColor = selected ? 'var(--accent-2)' : hovered ? '#94a3b8' : baseColor
  const animated = state === 'active'

  const nodeRuntimeStates = useCanvasStore((s) => s.nodeRuntimeStates)
  const sourceRuntime = source ? nodeRuntimeStates[source] : undefined
  const records = sourceRuntime?.output
    ? ((sourceRuntime.output as Record<string, unknown>).records as unknown[] | undefined)
    : null
  const prospectCount = Array.isArray(records) ? records.length : null

  const showLabel = hovered || selected

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        interactionWidth={16}
        style={{
          stroke: strokeColor,
          strokeWidth: selected ? 2.5 : hovered ? 2 : 2,
          strokeDasharray: state === 'waiting' ? '5 5' : undefined,
          transition: 'stroke .15s, stroke-width .15s',
        }}
        className={animated ? 'react-flow__edge-animated' : ''}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />

      <EdgeLabelRenderer>
        {/* Delete button — visible on hover or selection */}
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
            opacity: showLabel ? 1 : 0,
            transition: 'opacity .15s',
            zIndex: 10,
          }}
          className="nodrag nopan"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              deleteElements({ edges: [{ id }] })
            }}
            title="Disconnect edge"
            style={{
              width: 20, height: 20, borderRadius: '50%',
              background: 'var(--danger)',
              border: '1.5px solid rgba(255,77,109,.35)',
              color: '#fff', cursor: 'pointer',
              display: 'grid', placeItems: 'center',
              fontSize: 15, lineHeight: 1, fontWeight: 700,
              boxShadow: '0 2px 8px rgba(0,0,0,.45)',
              transition: 'transform .12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.2)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
          >
            ×
          </button>
        </div>

        {/* Prospect count badge */}
        {prospectCount !== null && (
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY + (showLabel ? 18 : 0)}px)`,
              pointerEvents: 'none',
              transition: 'transform .15s',
            }}
            className="bg-slate-800 text-slate-200 text-xs px-1.5 py-0.5 rounded border border-slate-600"
          >
            {prospectCount} prospects
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  )
}
