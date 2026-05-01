import { useCallback, useRef } from 'react'

export function useDragResize({
  onDelta,
  direction,
}: {
  onDelta: (delta: number) => void
  direction: 'horizontal' | 'vertical'
}) {
  const active = useRef(false)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    active.current = true
    ;(e.target as Element).setPointerCapture(e.pointerId)
    e.preventDefault()
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!active.current) return
    onDelta(direction === 'horizontal' ? e.movementX : -e.movementY)
  }, [onDelta, direction])

  const onPointerUp = useCallback(() => {
    active.current = false
  }, [])

  return { onPointerDown, onPointerMove, onPointerUp }
}
