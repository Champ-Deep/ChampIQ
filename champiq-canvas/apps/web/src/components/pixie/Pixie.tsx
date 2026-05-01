import { useMemo } from 'react'

export type PixiePose = 'idle' | 'lean' | 'point' | 'read' | 'carry' | 'cheer' | 'think' | 'sleep'
export type PixieCloak = '#0EA968' | '#E63A87' | '#1E5FCB' | '#2A2F44'

const COLOR_NAMES: Record<string, string> = {
  '#0EA968': 'emerald',
  '#E63A87': 'magenta',
  '#1E5FCB': 'cobalt',
  '#2A2F44': 'charcoal',
}

function getPoseAnim(pose: PixiePose): string {
  const map: Record<PixiePose, string> = {
    idle:  'pixie-breathe 3.2s ease-in-out infinite',
    lean:  'pixie-lean 2.4s ease-in-out infinite',
    point: 'pixie-breathe 1.8s ease-in-out infinite',
    read:  'pixie-read 3s ease-in-out infinite',
    carry: 'pixie-carry 1.4s ease-in-out infinite',
    cheer: 'pixie-cheer 0.7s ease-in-out infinite',
    think: 'pixie-think 2.2s ease-in-out infinite',
    sleep: 'pixie-sleep 3.6s ease-in-out infinite',
  }
  return map[pose]
}

function cssRgb(hex: string): string {
  const h = hex.replace('#', '')
  return `${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)}`
}

interface PixieProps {
  pose?: PixiePose
  size?: number
  cloak?: string
  ambient?: boolean
  bubble?: string
  label?: string
  flip?: boolean
  className?: string
  style?: React.CSSProperties
}

export function Pixie({
  pose = 'idle',
  size = 96,
  cloak = '#1E5FCB',
  ambient = true,
  bubble,
  label,
  flip = false,
  className = '',
  style = {},
}: PixieProps) {
  const colorName = COLOR_NAMES[cloak] || 'cobalt'
  const src = pose === 'idle'
    ? `/pixie/pixie-${colorName}.png`
    : `/pixie/pixie-${colorName}-${pose}.png`

  const phase = useMemo(() => ({
    float: -(Math.random() * 4).toFixed(2),
    pose:  -(Math.random() * 3).toFixed(2),
    spark: -(Math.random() * 1.6).toFixed(2),
    wing:  -(Math.random() * 0.6).toFixed(2),
  }), [])

  const outerAnim = !ambient || pose === 'cheer'
    ? 'none'
    : pose === 'sleep'
      ? 'pixie-float 6s ease-in-out infinite'
      : 'pixie-float 4s ease-in-out infinite'

  const poseAnim = getPoseAnim(pose)
  const showWings = ambient && pose !== 'sleep' && pose !== 'cheer' && pose !== 'carry' && pose !== 'point'
  const showSpark = ambient && pose !== 'sleep'

  return (
    <div
      className={`pixie-root ${className}`}
      aria-hidden="true"
      style={{
        position: 'relative',
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        animation: outerAnim,
        animationDelay: `${phase.float}s`,
        ...style,
      }}
    >
      {bubble && <PixieBubble text={bubble} />}

      <div style={{
        position: 'relative',
        width: size,
        height: size,
        animation: ambient ? poseAnim : 'none',
        animationDelay: `${phase.pose}s`,
        transformOrigin: '50% 85%',
        transform: flip ? 'scaleX(-1)' : 'none',
      }}>
        {/* Ground glow */}
        <div style={{
          position: 'absolute',
          left: '50%',
          bottom: -2,
          transform: 'translateX(-50%)',
          width: size * 0.6,
          height: size * 0.08,
          borderRadius: '50%',
          background: pose === 'sleep'
            ? 'rgba(0,0,0,.35)'
            : `rgba(${cssRgb(cloak)},.28)`,
          filter: 'blur(4px)',
          animation: ambient ? 'glow-pulse 3.2s ease-in-out infinite' : 'none',
        }} />

        {showWings && (
          <>
            <div style={{
              position: 'absolute', left: '4%', top: '44%', width: '20%', height: '18%',
              background: 'radial-gradient(ellipse at center, rgba(168,255,224,.4), transparent 70%)',
              animation: 'wing-flap 0.6s ease-in-out infinite',
              animationDelay: `${phase.wing}s`,
              transformOrigin: '100% 50%',
              pointerEvents: 'none', mixBlendMode: 'screen', opacity: 0.6,
            }} />
            <div style={{
              position: 'absolute', right: '36%', top: '44%', width: '20%', height: '18%',
              background: 'radial-gradient(ellipse at center, rgba(168,255,224,.4), transparent 70%)',
              animation: 'wing-flap 0.6s ease-in-out infinite',
              animationDelay: `${phase.wing}s`,
              transformOrigin: '0% 50%',
              pointerEvents: 'none', mixBlendMode: 'screen', opacity: 0.6,
            }} />
          </>
        )}

        <img
          src={src}
          alt=""
          className="pixie-sprite"
          style={{ width: size, height: size, objectFit: 'contain' }}
        />

        {showSpark && (
          <div style={{
            position: 'absolute', left: '38%', top: '8%', width: '24%', height: '14%',
            background: 'radial-gradient(ellipse at center, rgba(255,210,63,.55), transparent 65%)',
            animation: 'antenna-spark 1.6s ease-in-out infinite',
            animationDelay: `${phase.spark}s`,
            pointerEvents: 'none',
          }} />
        )}

        {pose === 'sleep' && <PixieZees />}
        {pose === 'cheer' && <PixieConfetti />}
      </div>

      {label && (
        <div className="t-pixel" style={{ color: 'var(--mint-2)', textAlign: 'center', textShadow: '0 0 8px rgba(0,229,199,.4)' }}>
          {label}
        </div>
      )}
    </div>
  )
}

// ── PixieBubble ────────────────────────────────────────────────────────────

interface PixieBubbleProps {
  text: string
  accent?: string
}

export function PixieBubble({ text, accent }: PixieBubbleProps) {
  return (
    <div style={{
      background: '#fff',
      color: '#0E1320',
      padding: '8px 12px',
      borderRadius: 10,
      maxWidth: 260,
      fontFamily: 'var(--font-body)',
      fontSize: 12.5,
      lineHeight: 1.4,
      fontWeight: 500,
      boxShadow: `0 8px 28px rgba(0,0,0,.45), 0 0 0 1px ${accent || 'rgba(255,255,255,.08)'}`,
      position: 'relative',
      animation: 'bubble-in 320ms cubic-bezier(0.34, 1.56, 0.64, 1)',
      transformOrigin: '50% 100%',
    }}>
      {text}
      <div style={{
        position: 'absolute',
        bottom: -5,
        left: '50%',
        transform: 'translateX(-50%) rotate(45deg)',
        width: 10,
        height: 10,
        background: '#fff',
      }} />
    </div>
  )
}

// ── Decorations ────────────────────────────────────────────────────────────

function PixieZees() {
  return (
    <div style={{ position: 'absolute', right: '0%', top: '0%', pointerEvents: 'none' }}>
      <span className="t-pixel" style={{
        position: 'absolute', right: 0, top: 0, color: 'var(--mint-2)', fontSize: 12,
        animation: 'zee-rise 3.4s ease-out infinite',
      }}>z</span>
      <span className="t-pixel" style={{
        position: 'absolute', right: 6, top: 8, color: 'var(--mint-2)', fontSize: 10,
        animation: 'zee-rise 3.4s ease-out infinite', animationDelay: '-1.6s',
      }}>z</span>
    </div>
  )
}

function PixieConfetti() {
  const dots: [number, number, string][] = [
    [12, 6, '#FFD23F'], [82, 10, '#00E5C7'], [24, 18, '#FF7A59'],
    [72, 22, '#A589FF'], [6, 36, '#5BC0FF'], [88, 44, '#FFD23F'],
  ]
  return (
    <>
      {dots.map(([x, y, c], i) => (
        <div key={i} style={{
          position: 'absolute', left: `${x}%`, top: `${y}%`,
          width: 5, height: 5, background: c,
          animation: `confetti-pop ${1.6 + i * 0.18}s ease-out infinite`,
          animationDelay: `${-i * 0.22}s`,
        }} />
      ))}
    </>
  )
}

// ── Online pill ────────────────────────────────────────────────────────────

export function PixieOnlinePill() {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: 'var(--bg-2)', border: '1px solid var(--border-1)',
      borderRadius: 20, padding: '3px 8px',
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: 'var(--accent-2)', boxShadow: '0 0 5px var(--accent-2)',
        display: 'inline-block',
      }} />
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.1em',
        textTransform: 'uppercase', color: 'var(--accent-2)',
      }}>Online</span>
    </div>
  )
}
