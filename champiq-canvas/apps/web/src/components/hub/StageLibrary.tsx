import { useState } from 'react'
import { Plus, Play, ExternalLink, Sparkles, Mail, Network, Layers, Globe } from 'lucide-react'
import { useCanvasStore } from '@/store/canvasStore'
import { Pixie } from '@/components/pixie/Pixie'
import { useUIStore } from '@/store/uiStore'

const TEMPLATES = [
  { id: 'cold-outbound',  name: 'Cold outbound',      desc: 'Loop → ChampGraph enrichment → Branch → ChampMail send', icon: 'mail',    color: '#f97316', nodes: 6, uses: 142, pose: 'point' as const, tip: 'Most effective with 50–100 prospects. I can auto-fill your Bullpen.' },
  { id: 'warm-followup',  name: 'Warm follow-up',     desc: 'Filter engaged prospects → personalized re-engage send',  icon: 'chat',    color: '#10b981', nodes: 4, uses: 87,  pose: 'read'  as const, tip: 'Best run 3–5 days after a cold sequence.' },
  { id: 'event-invite',   name: 'Event invite',       desc: 'Segment by company size → invite + RSVP tracker',         icon: 'star',    color: '#8b5cf6', nodes: 5, uses: 34,  pose: 'idle'  as const, tip: 'Set the event date as a variable — I\'ll handle countdown logic.' },
  { id: 're-engage',      name: 'Re-engage churned',  desc: 'Query churned accounts → win-back email + offer',         icon: 'refresh', color: '#06b6d4', nodes: 5, uses: 23,  pose: 'think' as const, tip: 'Works best 90+ days post-churn.' },
  { id: 'inbound-resp',   name: 'Inbound response',   desc: 'Webhook trigger → score → route to rep or sequence',      icon: 'webhook', color: '#14b8a6', nodes: 7, uses: 61,  pose: 'point' as const, tip: 'Connect your form webhook in Settings → Credentials first.' },
  { id: 'blank',          name: 'Blank stage',        desc: 'Start from scratch. I\'ll help wire it up.',              icon: 'layers',  color: '#6b7280', nodes: 0, uses: 0,   pose: 'idle'  as const, tip: 'Tell me what you\'re trying to do and I\'ll suggest a structure.' },
]

function templateIcon(icon: string) {
  const map: Record<string, React.ReactNode> = {
    mail: <Mail size={17} />, chat: <Sparkles size={17} />, star: <Sparkles size={17} />,
    refresh: <Network size={17} />, webhook: <Globe size={17} />, layers: <Layers size={17} />,
  }
  return map[icon] || <Layers size={17} />
}

function statusColor(status: string) {
  const map: Record<string, string> = { running: 'var(--warn)', success: 'var(--success)', paused: 'var(--text-4)', error: 'var(--danger)', idle: 'var(--text-3)' }
  return map[status] || 'var(--text-3)'
}

interface StageLibraryProps {
  onOpenCanvas: (id: string) => void
  onNewCanvas: () => void
}

export function StageLibrary({ onOpenCanvas, onNewCanvas }: StageLibraryProps) {
  const [view, setView] = useState<'recent' | 'templates'>('recent')
  const { canvasList } = useCanvasStore()
  const { cloak, accent } = useUIStore()

  return (
    <div data-accent={accent} style={{
      width: '100%', flex: 1, background: 'var(--bg-0)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: 'var(--font-body)', color: 'var(--text-1)',
    }}>
      {/* Header */}
      <div style={{
        padding: '0 20px', height: 52, flexShrink: 0,
        background: 'var(--bg-1)', borderBottom: '1px solid var(--border-1)',
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'color-mix(in oklch, var(--accent-2) 18%, var(--bg-0))', color: 'var(--accent-2)', display: 'grid', placeItems: 'center' }}>
            <Layers size={14} />
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15 }}>Stages</span>
        </div>
        <div style={{ display: 'flex', gap: 2, marginLeft: 8 }}>
          {[['recent', 'My Stages'], ['templates', 'Templates']] as const}
          {([['recent', 'My Stages'], ['templates', 'Templates']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} style={{
              padding: '5px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
              background: view === k ? 'var(--bg-3)' : 'transparent',
              color: view === k ? 'var(--text-1)' : 'var(--text-3)',
              fontFamily: 'var(--font-display)', fontSize: 12.5, fontWeight: 600,
            }}>{l}</button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <button onClick={onNewCanvas} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 13px',
          background: 'var(--accent-2)', border: 'none', borderRadius: 7,
          color: '#fff', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>
          <Plus size={13} /> New Stage
        </button>
      </div>

      <div className="scroll" style={{ flex: 1, overflowY: 'auto', padding: '18px 20px 40px', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Pixie tip */}
        <div style={{ background: 'rgba(var(--accent-2-rgb),.07)', border: '1px solid rgba(var(--accent-2-rgb),.2)', borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 12 }}>
          <Pixie pose="idle" size={36} cloak={cloak} ambient={false} />
          <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5, alignSelf: 'center' }}>
            {view === 'recent'
              ? `${canvasList.length} canvas${canvasList.length !== 1 ? 'es' : ''} — click any to open it in the cockpit.`
              : "Pick a template and I'll pre-fill your credentials and branch logic automatically."}
          </div>
        </div>

        {view === 'recent' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Active stages</div>
            {canvasList.length === 0 && (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-4)', fontSize: 13, border: '1px dashed var(--border-1)', borderRadius: 10 }}>
                No canvases yet. Create one or start from a template.
              </div>
            )}
            {canvasList.map((c) => {
              const col = statusColor('idle')
              return (
                <div key={c.id} style={{
                  background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 12,
                  padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
                  transition: 'border-color .18s',
                }}
                  onClick={() => onOpenCanvas(c.id)}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-2)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-1)' }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'color-mix(in oklch, var(--accent-2) 12%, var(--bg-0))', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <Layers size={18} color="var(--accent-2)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-4)', marginTop: 2 }}>
                      Updated {new Date(c.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20,
                    background: `color-mix(in oklch, ${col} 14%, transparent)`,
                    border: `1px solid color-mix(in oklch, ${col} 30%, transparent)`,
                    fontFamily: 'var(--font-mono)', fontSize: 9.5, color: col, textTransform: 'uppercase', letterSpacing: '.1em',
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: col }} />
                    Idle
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <StageBtn icon={<Play size={12} />} onClick={() => {}} />
                    <StageBtn icon={<ExternalLink size={12} />} onClick={() => onOpenCanvas(c.id)} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {view === 'templates' && (
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: 'var(--text-1)', marginBottom: 12 }}>
              Start from a template
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {TEMPLATES.map((tmpl) => (
                <TemplateCard key={tmpl.id} tmpl={tmpl} cloak={cloak} onUse={onNewCanvas} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TemplateCard({ tmpl, cloak, onUse }: { tmpl: typeof TEMPLATES[0]; cloak: string; onUse: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? `linear-gradient(160deg, color-mix(in oklch, ${tmpl.color} 8%, var(--bg-1)) 0%, var(--bg-1) 100%)` : 'var(--bg-1)',
        border: hovered ? `1px solid color-mix(in oklch, ${tmpl.color} 40%, transparent)` : '1px solid var(--border-1)',
        borderRadius: 13, padding: '18px 18px 16px', cursor: 'pointer',
        transition: 'all .22s var(--ease-swift)',
        boxShadow: hovered ? `0 8px 32px rgba(0,0,0,.35), 0 0 0 1px color-mix(in oklch, ${tmpl.color} 20%, transparent)` : '0 2px 8px rgba(0,0,0,.2)',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          background: `color-mix(in oklch, ${tmpl.color} 18%, var(--bg-0))`,
          border: `1px solid color-mix(in oklch, ${tmpl.color} 30%, transparent)`,
          color: tmpl.color, display: 'grid', placeItems: 'center',
          boxShadow: hovered ? `0 0 14px -2px color-mix(in oklch, ${tmpl.color} 50%, transparent)` : 'none',
        }}>
          {templateIcon(tmpl.icon)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--text-1)', marginBottom: 4 }}>{tmpl.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.4 }}>{tmpl.desc}</div>
        </div>
      </div>

      {hovered && (
        <div style={{
          background: 'rgba(var(--accent-2-rgb),.07)', border: '1px solid rgba(var(--accent-2-rgb),.2)',
          borderRadius: 8, padding: '8px 10px', display: 'flex', gap: 8, alignItems: 'flex-start',
          animation: 'bubble-in 180ms var(--ease-spring)',
        }}>
          <Pixie pose={tmpl.pose} size={28} cloak={cloak} ambient={false} />
          <div style={{ fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.4, flex: 1 }}>{tmpl.tip}</div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-4)' }}>
          {tmpl.nodes > 0 ? `${tmpl.nodes} nodes · ` : ''}{tmpl.uses > 0 ? `${tmpl.uses} uses` : 'Blank'}
        </div>
        {hovered
          ? <button onClick={onUse} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', background: 'var(--accent-2)', border: 'none', borderRadius: 7, color: '#fff', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <Plus size={12} /> Use template
            </button>
          : <div style={{ width: 8, height: 8, borderRadius: '50%', background: tmpl.color }} />
        }
      </div>
    </div>
  )
}

function StageBtn({ icon, onClick }: { icon: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick() }} style={{
      width: 32, height: 32, display: 'grid', placeItems: 'center',
      background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 7,
      color: 'var(--text-3)', cursor: 'pointer', transition: 'all .15s',
    }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-3)'; e.currentTarget.style.color = 'var(--text-1)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-2)'; e.currentTarget.style.color = 'var(--text-3)' }}
    >
      {icon}
    </button>
  )
}
