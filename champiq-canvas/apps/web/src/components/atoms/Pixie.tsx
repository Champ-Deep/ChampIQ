import React from 'react'

export type PixiePose = 'idle' | 'lean' | 'point' | 'read' | 'carry' | 'cheer' | 'think' | 'sleep'
type PixieColor = 'violet' | 'emerald' | 'magenta' | 'cobalt' | 'charcoal'

const CLOAK_TO_COLOR: Record<string, PixieColor> = {
  '#5B3FE0': 'violet', '#0EA968': 'emerald',
  '#E63A87': 'magenta', '#1E5FCB': 'cobalt', '#2A2F44': 'charcoal',
}

const POSE_ANIM: Record<PixiePose, string> = {
  idle:  'pixie-breathe 3.2s ease-in-out infinite',
  lean:  'pixie-lean 2.4s ease-in-out infinite',
  point: 'pixie-point 1.8s ease-in-out infinite',
  read:  'pixie-read 3s ease-in-out infinite',
  carry: 'pixie-carry 1.4s ease-in-out infinite',
  cheer: 'pixie-cheer 0.7s ease-in-out infinite',
  think: 'pixie-think 2.2s ease-in-out infinite',
  sleep: 'pixie-sleep 3.6s ease-in-out infinite',
}

interface PixieProps {
  pose?: PixiePose
  size?: number
  cloak?: string
  ambient?: boolean
  flip?: boolean
  style?: React.CSSProperties
}

export function Pixie({ pose = 'idle', size = 96, cloak = '#5B3FE0', ambient = true, flip = false, style }: PixieProps) {
  const colorName = CLOAK_TO_COLOR[cloak] ?? 'violet'
  const src = pose === 'idle'
    ? `/pixie/pixie-${colorName}.png`
    : `/pixie/pixie-${colorName}-${pose}.png`

  const phase = React.useMemo(() => ({
    float: -(Math.random() * 4).toFixed(2),
    pose:  -(Math.random() * 3).toFixed(2),
    spark: -(Math.random() * 1.6).toFixed(2),
  }), [])

  const outerAnim = !ambient || pose === 'cheer' ? 'none'
    : pose === 'sleep' ? 'pixie-float 6s ease-in-out infinite'
    : 'pixie-float 4s ease-in-out infinite'

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'relative', display: 'inline-flex', flexDirection: 'column',
        alignItems: 'center', gap: 6,
        animation: outerAnim, animationDelay: `${phase.float}s`,
        ...style,
      }}
    >
      <div style={{
        position: 'relative', width: size, height: size,
        animation: ambient ? POSE_ANIM[pose] : 'none',
        animationDelay: `${phase.pose}s`,
        transformOrigin: '50% 85%',
        transform: flip ? 'scaleX(-1)' : 'none',
      }}>
        <div style={{
          position: 'absolute', left: '50%', bottom: -2, transform: 'translateX(-50%)',
          width: size * 0.6, height: size * 0.08, borderRadius: '50%',
          background: `rgba(${hexToRgb(cloak)},.28)`, filter: 'blur(4px)',
          animation: ambient ? 'glow-pulse 3.2s ease-in-out infinite' : 'none',
        }} />
        <img
          src={src} alt=""
          className="pixie-sprite"
          style={{ width: size, height: size, objectFit: 'contain' }}
        />
        {ambient && pose !== 'sleep' && (
          <div style={{
            position: 'absolute', left: '38%', top: '8%', width: '24%', height: '14%',
            background: 'radial-gradient(ellipse at center, rgba(255,210,63,.55), transparent 65%)',
            animation: 'antenna-spark 1.6s ease-in-out infinite',
            animationDelay: `${phase.spark}s`, pointerEvents: 'none',
          }} />
        )}
      </div>
    </div>
  )
}

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '')
  return `${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)}`
}
