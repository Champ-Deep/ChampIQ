import { useDragResize } from '@/hooks/useDragResize'

interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical'
  onDelta: (delta: number) => void
}

export function ResizeHandle({ direction, onDelta }: ResizeHandleProps) {
  const { onPointerDown, onPointerMove, onPointerUp } = useDragResize({ onDelta, direction })
  const isH = direction === 'horizontal'

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position: 'absolute',
        ...(isH
          ? { right: 0, top: 0, bottom: 0, width: 4, cursor: 'ew-resize' }
          : { top: 0, left: 0, right: 0, height: 4, cursor: 'ns-resize' }),
        background: 'transparent',
        zIndex: 20,
        transition: 'background .15s',
        touchAction: 'none',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(var(--accent-2-rgb),.38)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    />
  )
}
