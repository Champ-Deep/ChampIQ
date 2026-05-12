export function ChampMark({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} shapeRendering="crispEdges">
      <rect x="2" y="6" width="3" height="3" fill="var(--accent-2)"/>
      <rect x="5" y="3" width="3" height="3" fill="var(--accent-1)"/>
      <rect x="8" y="6" width="3" height="3" fill="var(--accent-2)"/>
      <rect x="5" y="9" width="3" height="3" fill="var(--accent-3)"/>
      <rect x="11" y="9" width="3" height="3" fill="var(--mint-2)"/>
    </svg>
  )
}

export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <ChampMark size={size} />
      <span style={{ fontFamily: 'var(--font-display)', fontSize: size, fontWeight: 700, letterSpacing: '-.025em', color: 'var(--text-1)' }}>
        Champ<span style={{ color: 'var(--accent-2)' }}>IQ</span>
      </span>
    </div>
  )
}
