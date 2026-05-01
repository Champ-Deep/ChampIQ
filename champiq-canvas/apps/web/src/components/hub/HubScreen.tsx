import { useState } from 'react'
import { Search, Settings, Plus, Mail, Network, Mic, Sparkles, Layers, Archive, Home, Users } from 'lucide-react'
import { useCanvasStore } from '@/store/canvasStore'
import { useUIStore } from '@/store/uiStore'
import { Pixie } from '@/components/pixie/Pixie'
import { CanvasCard } from './CanvasCard'
import { StageLibrary } from './StageLibrary'
import { BullpenPanel } from './BullpenPanel'

const TEMPLATES = [
  { id: 't1', title: 'Cold outbound',    desc: 'Bullpen → personalize → ChampMail. The classic.', tag: 'Sales',  icon: 'mail' },
  { id: 't2', title: 'Reply classifier', desc: 'Inbox → LLM categorize → branch on intent.',       tag: 'AI',    icon: 'sparkle' },
  { id: 't3', title: 'Lead enrichment',  desc: 'CSV → ChampGraph join → Notion write.',             tag: 'Data',  icon: 'db' },
  { id: 't4', title: 'Voice screener',   desc: 'ChampVoice transcript → score → tag.',              tag: 'Voice', icon: 'voice' },
]

function tagIcon(tag: string) {
  if (tag === 'Sales') return <Mail size={13} />
  if (tag === 'AI') return <Sparkles size={13} />
  if (tag === 'Voice') return <Mic size={13} />
  return <Network size={13} />
}

interface HubScreenProps {
  onOpenCanvas: (id: string) => void
  onNewCanvas: () => void
}

type NavKey = 'home' | 'canvases' | 'templates' | 'archive' | 'stages' | 'bullpen'

export function HubScreen({ onOpenCanvas, onNewCanvas }: HubScreenProps) {
  const { canvasList, logs } = useCanvasStore()
  const { cloak, voice, accent, density, hubView, setHubView, setCmdOpen, setSettingsOpen } = useUIStore()
  const [navActive, setNavActive] = useState<NavKey>(
    hubView === 'stages' ? 'stages' : hubView === 'bullpen' ? 'bullpen' : 'home'
  )

  const pixieCfg = { cloak }

  const recentActivity = logs.slice(0, 8)

  const messageByVoice: Record<string, { hi: string; body: string }> = {
    Friendly: { hi: `Hey there.`, body: 'Everything looks good. Click a canvas to open it, or start a new one.' },
    Crisp:    { hi: 'Status:', body: `${canvasList.length} canvases · all systems nominal.` },
    Quirky:   { hi: 'gm, captain ✨', body: "All your canvases are just sitting here, waiting for you. Let's get cookin'." },
    Pro:      { hi: 'Dashboard summary', body: `${canvasList.length} active canvases. No critical errors detected.` },
  }
  const m = messageByVoice[voice] || messageByVoice.Friendly

  return (
    <div data-accent={accent} data-density={density} style={{
      width: '100vw', height: '100vh', background: 'var(--bg-0)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: 'var(--font-body)', color: 'var(--text-1)',
    }}>
      {/* Top bar */}
      <div style={{
        height: 52, flexShrink: 0,
        background: 'var(--bg-1)', borderBottom: '1px solid var(--border-1)',
        display: 'flex', alignItems: 'center', padding: '0 18px', gap: 14,
      }}>
        <HubWordmark />
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={() => setCmdOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px 6px 12px',
              background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 8,
              color: 'var(--text-3)', fontFamily: 'var(--font-body)', fontSize: 12, cursor: 'pointer',
              width: 380, textAlign: 'left',
            }}
          >
            <Search size={14} />
            <span style={{ flex: 1 }}>Ask Pixie or search canvases…</span>
            <kbd style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, padding: '2px 5px', borderRadius: 3,
              background: 'var(--bg-3)', border: '1px solid var(--border-1)', color: 'var(--text-3)',
            }}>⌘K</kbd>
          </button>
        </div>
        <button
          onClick={() => setSettingsOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
            background: 'transparent', border: '1px solid transparent', borderRadius: 8,
            color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', transition: 'all .18s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-2)'; e.currentTarget.style.borderColor = 'var(--border-1)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' }}
        >
          <Settings size={14} />
          Settings
        </button>
        <div style={{
          width: 32, height: 32, borderRadius: 16, background: 'var(--accent-2)',
          display: 'grid', placeItems: 'center', color: '#fff',
          fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, flexShrink: 0,
        }}>D</div>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Left nav */}
        <div style={{
          width: 200, flexShrink: 0, background: 'var(--bg-1)',
          borderRight: '1px solid var(--border-1)', padding: '14px 10px',
          overflowY: 'auto',
        }}>
          <NavItem icon={<Home size={15} />} label="Home"          active={navActive === 'home'}      onClick={() => setNavActive('home')} />
          <NavItem icon={<Layers size={15} />} label="All canvases" active={navActive === 'canvases'}  onClick={() => setNavActive('canvases')} badge={String(canvasList.length)} />
          <NavItem icon={<Sparkles size={15} />} label="Templates"  active={navActive === 'templates'} onClick={() => setNavActive('templates')} />
          <NavItem icon={<Archive size={15} />} label="Archive"     active={navActive === 'archive'}   onClick={() => setNavActive('archive')} />
          <div style={{ height: 1, background: 'var(--border-1)', margin: '12px 6px' }} />
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-3)', padding: '6px 10px' }}>Tools</div>
          <NavItem icon={<Layers size={15} />} label="Stages"  active={navActive === 'stages'}  onClick={() => { setNavActive('stages');  setHubView('stages') }} />
          <NavItem icon={<Users size={15} />}  label="Bullpen" active={navActive === 'bullpen'} onClick={() => { setNavActive('bullpen'); setHubView('bullpen') }} />
        </div>

        {/* Main content — Stages or Bullpen take full area */}
        {navActive === 'stages' && (
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <StageLibrary onOpenCanvas={onOpenCanvas} onNewCanvas={onNewCanvas} />
          </div>
        )}
        {navActive === 'bullpen' && (
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <BullpenPanel />
          </div>
        )}
        {/* Home / canvases / templates view */}
        {navActive !== 'stages' && navActive !== 'bullpen' && (
        <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '28px 36px', background: 'var(--bg-0)' }}>
          {/* Pixie briefing */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(var(--accent-2-rgb),.12), rgba(var(--mint-2-rgb),.06) 80%)',
            border: '1px solid rgba(var(--accent-2-rgb),.25)',
            borderRadius: 16, padding: 24, display: 'flex', gap: 22, alignItems: 'center',
            position: 'relative', overflow: 'hidden', marginBottom: 32,
          }}>
            <div style={{
              position: 'absolute', inset: 0, opacity: .25, pointerEvents: 'none',
              backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,.18) 1px, transparent 0)`,
              backgroundSize: '14px 14px',
            }} />
            <div style={{ flexShrink: 0, position: 'relative' }}>
              <Pixie pose="point" size={110} cloak={pixieCfg.cloak} ambient />
            </div>
            <div style={{ flex: 1, position: 'relative' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--mint-2)', marginBottom: 4 }}>PIXIE · BRIEFING</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, color: 'var(--text-1)', marginBottom: 6, letterSpacing: '-.01em' }}>{m.hi}</div>
              <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.55, maxWidth: 560 }}>{m.body}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button onClick={onNewCanvas} style={pixieBtnStyle}>
                  <Plus size={14} /> New canvas
                </button>
              </div>
            </div>
          </div>

          {/* Canvas grid */}
          {(navActive === 'home' || navActive === 'canvases') && (
            <div style={{ marginBottom: 32 }}>
              <SectionHeader title="Your canvases" sub={`${canvasList.length} total`}>
                <HubBtn onClick={onNewCanvas} icon={<Plus size={13} />}>New canvas</HubBtn>
              </SectionHeader>
              {canvasList.length === 0 ? (
                <EmptyCanvases onNewCanvas={onNewCanvas} pixieCfg={pixieCfg} />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                  {canvasList.map((c, i) => (
                    <CanvasCard
                      key={c.id}
                      canvas={c}
                      delay={i * 30}
                      onClick={() => onOpenCanvas(c.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Templates section */}
          {(navActive === 'home' || navActive === 'templates') && (
            <div style={{ marginBottom: 32 }}>
              <SectionHeader title="Start from a template" sub="Curated by Pixie." />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                {TEMPLATES.map((t, i) => (
                  <TemplateCard key={t.id} t={t} delay={i * 25} onClick={onNewCanvas} />
                ))}
              </div>
            </div>
          )}
        </div>
        )}

        {/* Right — activity feed (home/canvas/template views only) */}
        {navActive !== 'stages' && navActive !== 'bullpen' && (
        <div style={{
          width: 300, flexShrink: 0, background: 'var(--bg-1)',
          borderLeft: '1px solid var(--border-1)',
          display: 'flex', flexDirection: 'column', minHeight: 0,
        }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-1)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600 }}>Activity</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-3)', marginTop: 1 }}>
              RECENT EVENTS
            </div>
          </div>
          <div className="scroll" style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
            {recentActivity.length === 0 ? (
              <div style={{ padding: '20px 8px', textAlign: 'center', color: 'var(--text-4)', fontSize: 12 }}>
                No activity yet. Run a canvas to see logs here.
              </div>
            ) : (
              recentActivity.map((log, i) => (
                <div key={log.id || i} style={{
                  padding: '10px 8px', borderRadius: 6, display: 'flex', gap: 10, alignItems: 'flex-start',
                  borderBottom: '1px solid var(--border-1)',
                }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0,
                    background: log.status === 'error' ? 'var(--danger)' : (log.status === 'success' || (log.status as string) === 'ok') ? 'var(--success)' : 'var(--info)',
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.4 }}>{log.message}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-3)', marginTop: 4 }}>
                      {log.nodeName}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <div style={{
            borderTop: '1px solid var(--border-1)', padding: 14,
            display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-0)',
          }}>
            <Pixie pose="idle" size={44} cloak={pixieCfg.cloak} ambient />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--mint-2)' }}>PIXIE · ONLINE</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.4 }}>
                Open a canvas — I'll meet you there.
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  )
}

function HubWordmark() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <svg viewBox="0 0 16 16" width={20} height={20} shapeRendering="crispEdges">
        <rect x="2" y="6" width="3" height="3" fill="var(--accent-2)" />
        <rect x="5" y="3" width="3" height="3" fill="var(--accent-1)" />
        <rect x="8" y="6" width="3" height="3" fill="var(--accent-2)" />
        <rect x="5" y="9" width="3" height="3" fill="var(--accent-3)" />
        <rect x="11" y="9" width="3" height="3" fill="var(--mint-2)" />
      </svg>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--text-1)', letterSpacing: '-.01em' }}>
        ChampIQ
      </span>
    </div>
  )
}

function NavItem({ icon, label, active, onClick, badge }: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void; badge?: string }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
        borderRadius: 7, marginBottom: 1, cursor: 'pointer',
        background: active ? 'var(--bg-3)' : 'transparent',
        color: active ? 'var(--text-1)' : 'var(--text-3)',
        fontSize: 13,
        fontFamily: active ? 'var(--font-display)' : 'var(--font-body)',
        fontWeight: active ? 600 : 500,
        transition: 'all .15s',
      }}
    >
      {icon}
      <span style={{ flex: 1 }}>{label}</span>
      {badge && (
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, padding: '1px 6px', borderRadius: 8,
          background: 'var(--bg-2)', color: 'var(--text-3)',
        }}>{badge}</span>
      )}
    </div>
  )
}

function SectionHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14 }}>
      <div>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-.01em' }}>{title}</h3>
        {sub && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-3)', marginTop: 3 }}>{sub}</div>}
      </div>
      {children && <div style={{ display: 'flex', gap: 8 }}>{children}</div>}
    </div>
  )
}

function TemplateCard({ t, delay, onClick }: { t: typeof TEMPLATES[0]; delay: number; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'var(--bg-2)' : 'var(--bg-1)',
        border: hovered ? '1px solid var(--accent-2)' : '1px dashed var(--border-1)',
        borderRadius: 10, padding: 14, cursor: 'pointer',
        animation: `hub-card-in 420ms var(--ease-spring) ${delay}ms backwards`,
        transition: 'border-color .18s var(--ease-swift), background .18s var(--ease-swift)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ color: 'var(--accent-1)' }}>{tagIcon(t.tag)}</span>
        <span style={{
          fontSize: 9.5, padding: '2px 7px', borderRadius: 4,
          background: 'rgba(var(--accent-2-rgb),.12)', border: '1px solid rgba(var(--accent-2-rgb),.2)',
          color: 'var(--accent-2)', fontFamily: 'var(--font-mono)', letterSpacing: '.06em',
        }}>{t.tag}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>{t.title}</div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>{t.desc}</div>
    </div>
  )
}

function EmptyCanvases({ onNewCanvas, pixieCfg }: { onNewCanvas: () => void; pixieCfg: { cloak: string } }) {
  return (
    <div style={{
      border: '2px dashed var(--border-1)', borderRadius: 14,
      padding: '40px 24px', textAlign: 'center',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
    }}>
      <Pixie pose="idle" size={80} cloak={pixieCfg.cloak} ambient />
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, color: 'var(--text-1)' }}>No canvases yet</div>
        <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>Create your first canvas or start from a template.</div>
      </div>
      <button onClick={onNewCanvas} style={pixieBtnStyle}>
        <Plus size={14} /> New canvas
      </button>
    </div>
  )
}

function HubBtn({ onClick, icon, children }: { onClick?: () => void; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
        background: 'transparent', border: '1px solid var(--border-1)', borderRadius: 7,
        color: 'var(--text-2)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600,
        cursor: 'pointer', transition: 'all .15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-2)'; e.currentTarget.style.color = 'var(--text-1)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-2)' }}
    >
      {icon}{children}
    </button>
  )
}

const pixieBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px',
  background: 'var(--accent-2)', border: 'none', borderRadius: 8,
  color: '#fff', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600,
  cursor: 'pointer', transition: 'opacity .15s',
}
