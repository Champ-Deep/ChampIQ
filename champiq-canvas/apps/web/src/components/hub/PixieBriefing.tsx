import { Btn, Pixie } from '@/components/atoms'
import { useUIStore } from '@/store/uiStore'

const MESSAGES: Record<string, { hi: string; body: string }> = {
  Friendly: {
    hi:   'Morning, Deep.',
    body: 'Everything looks healthy. Check the activity feed for any issues that need attention.',
  },
  Crisp: {
    hi:   'Status:',
    body: 'All canvases nominal. Check activity for warnings.',
  },
  Quirky: {
    hi:   'gm, captain',
    body: "All quiet on the canvas front. Anything you want to build today?",
  },
  Pro: {
    hi:   'Daily summary',
    body: 'Canvas execution nominal. Review activity feed for any anomalies.',
  },
}

interface PixieBriefingProps {
  onOpenCanvas?: (id: string) => void
}

export function PixieBriefing({ onOpenCanvas: _onOpenCanvas }: PixieBriefingProps) {
  const voice  = useUIStore(s => s.voice)
  const cloak  = useUIStore(s => s.cloak)
  const m = MESSAGES[voice] ?? MESSAGES.Friendly

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(var(--accent-2-rgb),.12), rgba(var(--mint-2-rgb),.06) 80%)',
      border: '1px solid rgba(var(--accent-2-rgb),.25)',
      borderRadius: 16, padding: 24,
      display: 'flex', gap: 22, alignItems: 'center',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Pixel grid bg */}
      <div style={{
        position: 'absolute', inset: 0, opacity: .25, pointerEvents: 'none',
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,.18) 1px, transparent 0)',
        backgroundSize: '14px 14px',
      }} />
      <div style={{ flexShrink: 0, position: 'relative' }}>
        <Pixie pose="point" size={120} cloak={cloak} />
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <div className="t-pixel" style={{ color: 'var(--mint-2)', marginBottom: 4 }}>
          PIXIE · BRIEFING
        </div>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600,
          color: 'var(--text-1)', marginBottom: 6, letterSpacing: '-.01em',
        }}>
          {m.hi}
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.55, maxWidth: 620 }}>
          {m.body}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <Btn variant="ghost" size="md">Brief me on everything</Btn>
        </div>
      </div>
    </div>
  )
}
