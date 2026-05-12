import { useState } from 'react'
import { Mail, Network, Mic, Sparkles } from 'lucide-react'
import { HubTopBar }     from './HubTopBar'
import { HubSidebar }    from './HubSidebar'
import { PixieBriefing } from './PixieBriefing'
import { CanvasCard }    from './CanvasCard'
import { ActivityFeed }  from './ActivityFeed'
import { StageLibrary }  from './StageLibrary'
import { BullpenPage }   from '@/components/bullpen'
import { useCanvasStore } from '@/store/canvasStore'
import { useUIStore }     from '@/store/uiStore'
import { Btn }            from '@/components/atoms'

// ── Template definitions ────────────────────────────────────────────────────

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

interface TemplateSpec {
  id: string
  title: string
  nodes: { kind: string; label: string; x: number; y: number }[]
  edges: [number, number][]
}

const TEMPLATE_SPECS: Record<string, TemplateSpec> = {
  t1: {
    id: 't1', title: 'Cold outbound',
    nodes: [
      { kind: 'trigger.manual', label: 'Start',             x: 80,  y: 200 },
      { kind: 'loop',           label: 'For each prospect', x: 300, y: 200 },
      { kind: 'champgraph',     label: 'Enrich prospect',   x: 520, y: 200 },
      { kind: 'champmail',      label: 'Send email',        x: 740, y: 200 },
    ],
    edges: [[0,1],[1,2],[2,3]],
  },
  t2: {
    id: 't2', title: 'Reply classifier',
    nodes: [
      { kind: 'trigger.webhook', label: 'Inbox webhook',   x: 80,  y: 200 },
      { kind: 'llm',             label: 'Classify intent', x: 300, y: 200 },
      { kind: 'if',              label: 'Positive reply?', x: 520, y: 200 },
    ],
    edges: [[0,1],[1,2]],
  },
  t3: {
    id: 't3', title: 'Lead enrichment',
    nodes: [
      { kind: 'trigger.manual', label: 'Start',          x: 80,  y: 200 },
      { kind: 'champgraph',     label: 'List prospects', x: 300, y: 200 },
      { kind: 'loop',           label: 'For each lead',  x: 520, y: 200 },
      { kind: 'set',            label: 'Write output',   x: 740, y: 200 },
    ],
    edges: [[0,1],[1,2],[2,3]],
  },
  t4: {
    id: 't4', title: 'Voice screener',
    nodes: [
      { kind: 'champvoice', label: 'Place call',       x: 80,  y: 200 },
      { kind: 'llm',        label: 'Score transcript', x: 300, y: 200 },
      { kind: 'set',        label: 'Tag prospect',     x: 520, y: 200 },
    ],
    edges: [[0,1],[1,2]],
  },
}

// ── Props ──────────────────────────────────────────────────────────────────

interface HubScreenProps {
  onOpenCanvas: (id: string) => void
  onNewCanvas: () => void
  onNewCanvasFromTemplate: (spec: TemplateSpec) => void
  onOpenSettings?: () => void
}

// ── HubScreen ──────────────────────────────────────────────────────────────

export function HubScreen({ onOpenCanvas, onNewCanvas, onNewCanvasFromTemplate, onOpenSettings }: HubScreenProps) {
  const [activeView, setActiveView] = useState('home')
  const canvasList = useCanvasStore(s => s.canvasList)
  const { accent, density, setSettingsOpen } = useUIStore()

  const handleOpenSettings = onOpenSettings ?? (() => setSettingsOpen(true))

  const handleNavigate = (view: string) => {
    setActiveView(view)
  }

  const isFullPanel = activeView === 'stages' || activeView === 'bullpen'

  return (
    <div
      data-accent={accent}
      data-density={density}
      style={{
        width: '100vw', height: '100vh', background: 'var(--bg-0)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        fontFamily: 'var(--font-body)', color: 'var(--text-1)',
      }}
    >
      <HubTopBar onOpenSettings={handleOpenSettings} />

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <HubSidebar activeView={activeView} onNavigate={handleNavigate} />

        {/* Full-panel views */}
        {activeView === 'stages' && (
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <StageLibrary onOpenCanvas={onOpenCanvas} onNewCanvas={onNewCanvas} />
          </div>
        )}
        {activeView === 'bullpen' && (
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <BullpenPage onBack={() => setActiveView('home')} />
          </div>
        )}

        {/* Main scrollable content */}
        {!isFullPanel && (
          <>
            <div className="scroll" style={{ flex: 1, overflowY: 'auto', padding: '28px 36px' }}>
              <PixieBriefing />

              {/* Canvas grid */}
              {(activeView === 'home' || activeView === 'canvases') && (
                <div style={{ marginTop: 30 }}>
                  <div style={{
                    display: 'flex', alignItems: 'flex-end',
                    justifyContent: 'space-between', marginBottom: 14,
                  }}>
                    <div>
                      <h3 style={{
                        margin: 0, fontFamily: 'var(--font-display)', fontSize: 18,
                        fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-.01em',
                      }}>
                        Your canvases
                      </h3>
                      <div style={{
                        fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)',
                        marginTop: 3, letterSpacing: '.14em', textTransform: 'uppercase',
                      }}>
                        {canvasList.length} ACTIVE
                      </div>
                    </div>
                    <Btn variant="ghost" size="sm" icon="plus" onClick={onNewCanvas}>New canvas</Btn>
                  </div>

                  {canvasList.length === 0 ? (
                    <div style={{
                      padding: '60px 0', textAlign: 'center',
                      color: 'var(--text-3)', fontSize: 13,
                    }}>
                      No canvases yet. Create one to get started.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                      {canvasList.map((c, i) => (
                        <CanvasCard
                          key={c.id} canvas={c} delay={i * 30}
                          onClick={() => onOpenCanvas(c.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Templates section */}
              {(activeView === 'home' || activeView === 'templates') && (
                <div style={{ marginTop: 30 }}>
                  <div style={{
                    display: 'flex', alignItems: 'flex-end',
                    justifyContent: 'space-between', marginBottom: 14,
                  }}>
                    <div>
                      <h3 style={{
                        margin: 0, fontFamily: 'var(--font-display)', fontSize: 18,
                        fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-.01em',
                      }}>
                        Start from a template
                      </h3>
                      <div style={{
                        fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)',
                        marginTop: 3, letterSpacing: '.14em', textTransform: 'uppercase',
                      }}>
                        CURATED BY PIXIE
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                    {TEMPLATES.map((t, i) => (
                      <TemplateCard
                        key={t.id} t={t} delay={i * 25}
                        onClick={() => {
                          const spec = TEMPLATE_SPECS[t.id]
                          if (spec) onNewCanvasFromTemplate(spec)
                          else onNewCanvas()
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Archive placeholder */}
              {activeView === 'archive' && (
                <div style={{ marginTop: 30, padding: '60px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                  No archived canvases.
                </div>
              )}
            </div>

            <ActivityFeed />
          </>
        )}
      </div>
    </div>
  )
}

// ── TemplateCard ────────────────────────────────────────────────────────────

function TemplateCard({ t, delay, onClick }: { t: typeof TEMPLATES[0]; delay: number; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-1)',
        border: '1px dashed var(--border-1)',
        borderRadius: 10, padding: 14, cursor: 'pointer',
        animation: `hub-card-in 420ms var(--ease-spring) ${delay}ms backwards`,
        transition: 'border-color .18s var(--ease-swift), background .18s var(--ease-swift)',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.background = 'var(--bg-2)'
        el.style.borderColor = 'var(--accent-2)'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.background = 'var(--bg-1)'
        el.style.borderColor = ''
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
