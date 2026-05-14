import { useState, useEffect, useRef } from 'react'
import { Mail, Network, Mic, Sparkles, Download, Upload, Trash2 } from 'lucide-react'
import { HubTopBar }     from './HubTopBar'
import { HubSidebar }    from './HubSidebar'
import { PixieBriefing } from './PixieBriefing'
import { CanvasCard }    from './CanvasCard'
import { ActivityFeed }  from './ActivityFeed'
import { BullpenPage }   from '@/components/bullpen'
import { useCanvasStore } from '@/store/canvasStore'
import { useUIStore }     from '@/store/uiStore'
import { useTemplateStore } from '@/store/templateStore'
import { api } from '@/lib/api'
import { Btn }            from '@/components/atoms'

// ── Built-in template definitions ──────────────────────────────────────────

const BUILTIN_TEMPLATES = [
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

export interface TemplateSpec {
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

// ── Dashboard stats ────────────────────────────────────────────────────────

function DashboardStats({ canvasCount }: { canvasCount: number }) {
  const [prospectCount, setProspectCount] = useState<number | null>(null)
  const [sequenceCount, setSequenceCount] = useState<number | null>(null)

  useEffect(() => {
    api.cmListProspects({ limit: 1 }).then((r) => setProspectCount(r.total ?? r.prospects?.length ?? 0)).catch(() => setProspectCount(0))
    api.cmListSequences().then((r) => setSequenceCount(Array.isArray(r) ? r.length : 0)).catch(() => setSequenceCount(0))
  }, [])

  const stats = [
    { label: 'Active canvases', value: canvasCount, color: 'var(--accent-2)' },
    { label: 'Prospects', value: prospectCount ?? '—', color: '#F97316' },
    { label: 'Sequences', value: sequenceCount ?? '—', color: '#22C55E' },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
      {stats.map((s) => (
        <div key={s.label} style={{
          background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 10,
          padding: '16px 18px',
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, color: s.color, letterSpacing: '-.02em' }}>
            {s.value}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '.1em' }}>
            {s.label}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Section header ─────────────────────────────────────────────────────────

function SectionHeader({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14 }}>
      <div>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-.01em' }}>{title}</h3>
        {sub && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 3, letterSpacing: '.14em', textTransform: 'uppercase' }}>{sub}</div>}
      </div>
      {action}
    </div>
  )
}

// ── Canvas skeleton (loading placeholder) ──────────────────────────────────

function CanvasSkeleton() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 12,
          padding: 16, height: 80,
          animation: `skeleton-pulse 1.4s ease-in-out ${i * 180}ms infinite`,
        }} />
      ))}
    </div>
  )
}

// ── Templates section ──────────────────────────────────────────────────────

function TemplatesSection({ onNewCanvasFromTemplate, onNewCanvas }: { onNewCanvasFromTemplate: (spec: TemplateSpec) => void; onNewCanvas: () => void }) {
  const { templates: userTemplates, deleteTemplate, exportTemplate, importTemplate } = useTemplateStore()
  const importRef = useRef<HTMLInputElement>(null)

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const json = ev.target?.result as string
      const t = importTemplate(json)
      if (!t) alert('Invalid template file — must be a .champiq.json exported from ChampIQ.')
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div>
      <SectionHeader
        title="Start from a template"
        sub="Curated by Pixie"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <input ref={importRef} type="file" accept=".json,.champiq.json" onChange={handleImport} style={{ display: 'none' }} />
            <Btn variant="ghost" size="sm" icon="plus" onClick={() => importRef.current?.click()}>Import</Btn>
          </div>
        }
      />

      {/* User templates */}
      {userTemplates.length > 0 && (
        <>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-4)', letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 8 }}>
            My Templates
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            {userTemplates.map((t) => (
              <div key={t.id} style={{
                background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 10, padding: 14,
                position: 'relative',
              }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: 'rgba(var(--accent-2-rgb),.12)', border: '1px solid rgba(var(--accent-2-rgb),.2)', color: 'var(--accent-2)', fontFamily: 'var(--font-mono)', letterSpacing: '.06em' }}>Custom</span>
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>{t.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-4)' }}>{t.nodes.length} nodes</div>
                <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
                  <button
                    onClick={() => onNewCanvasFromTemplate({ id: t.id, title: t.name, nodes: t.nodes.map((n, i) => ({ kind: (n.data as {kind?: string}).kind ?? 'llm', label: String((n.data as {label?: string}).label ?? n.id), x: n.position.x, y: n.position.y })), edges: [] })}
                    style={{ flex: 1, padding: '5px 0', background: 'var(--accent-2)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer' }}
                  >Use</button>
                  <button onClick={() => exportTemplate(t.id)} title="Export" style={{ width: 28, display: 'grid', placeItems: 'center', background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 6, color: 'var(--text-3)', cursor: 'pointer' }}>
                    <Download size={11} />
                  </button>
                  <button onClick={() => { if (confirm(`Delete template "${t.name}"?`)) deleteTemplate(t.id) }} title="Delete" style={{ width: 28, display: 'grid', placeItems: 'center', background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 6, color: 'var(--danger)', cursor: 'pointer' }}>
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Built-in templates */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-4)', letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 8 }}>
        Built-in
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {BUILTIN_TEMPLATES.map((t, i) => (
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
  )
}

// ── HubScreen ──────────────────────────────────────────────────────────────

export function HubScreen({ onOpenCanvas, onNewCanvas, onNewCanvasFromTemplate, onOpenSettings }: HubScreenProps) {
  const [activeView, setActiveView] = useState('home')
  const [canvasFilter, setCanvasFilter] = useState('')
  const canvasList = useCanvasStore(s => s.canvasList)
  const isLoading = useCanvasStore(s => s.isLoadingCanvases)
  const { archiveCanvas, restoreCanvas } = useCanvasStore()
  const { accent, density, setSettingsOpen } = useUIStore()

  const handleOpenSettings = onOpenSettings ?? (() => setSettingsOpen(true))
  const activeCanvases = canvasList.filter(c => !c.archived)
  const archivedCanvases = canvasList.filter(c => c.archived)

  const filteredCanvases = activeCanvases.filter(c =>
    !canvasFilter || c.name.toLowerCase().includes(canvasFilter.toLowerCase())
  )

  const recentCanvases = [...activeCanvases]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 3)

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
        <HubSidebar activeView={activeView} onNavigate={setActiveView} />

        {/* Bullpen full-panel */}
        {activeView === 'bullpen' && (
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <BullpenPage onBack={() => setActiveView('home')} />
          </div>
        )}

        {/* Main scrollable content */}
        {activeView !== 'bullpen' && (
          <>
            <div className="scroll" style={{ flex: 1, overflowY: 'auto', padding: '28px 36px' }}>

              {/* ── HOME: dashboard ─────────────────────────────── */}
              {activeView === 'home' && (
                <>
                  <PixieBriefing />
                  <div style={{ marginTop: 28 }}>
                    <DashboardStats canvasCount={activeCanvases.length} />

                    {/* Recently active canvases */}
                    {recentCanvases.length > 0 && (
                      <div style={{ marginBottom: 32 }}>
                        <SectionHeader
                          title="Recently active"
                          sub={`${activeCanvases.length} total`}
                          action={<Btn variant="ghost" size="sm" onClick={() => setActiveView('canvases')}>View all</Btn>}
                        />
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                          {recentCanvases.map((c, i) => (
                            <CanvasCard key={c.id} canvas={c} delay={i * 30} onClick={() => onOpenCanvas(c.id)} />
                          ))}
                        </div>
                      </div>
                    )}

                    <TemplatesSection onNewCanvasFromTemplate={onNewCanvasFromTemplate} onNewCanvas={onNewCanvas} />
                  </div>
                </>
              )}

              {/* ── ALL CANVASES ────────────────────────────────── */}
              {activeView === 'canvases' && (
                <div>
                  <SectionHeader
                    title="All canvases"
                    sub={`${activeCanvases.length} active`}
                    action={
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          value={canvasFilter}
                          onChange={e => setCanvasFilter(e.target.value)}
                          placeholder="Filter…"
                          style={{
                            padding: '5px 10px', background: 'var(--bg-2)', border: '1px solid var(--border-1)',
                            borderRadius: 7, fontSize: 12, color: 'var(--text-1)', fontFamily: 'var(--font-body)', outline: 'none',
                          }}
                        />
                        <Btn variant="ghost" size="sm" icon="plus" onClick={onNewCanvas}>New canvas</Btn>
                      </div>
                    }
                  />
                  {isLoading ? (
                    <CanvasSkeleton />
                  ) : filteredCanvases.length === 0 ? (
                    <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                      {canvasFilter ? 'No canvases match that filter.' : 'No canvases yet. Create one to get started.'}
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                      {filteredCanvases.map((c, i) => (
                        <CanvasCard key={c.id} canvas={c} delay={i * 30} onClick={() => onOpenCanvas(c.id)} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── TEMPLATES ───────────────────────────────────── */}
              {activeView === 'templates' && (
                <TemplatesSection onNewCanvasFromTemplate={onNewCanvasFromTemplate} onNewCanvas={onNewCanvas} />
              )}

              {/* ── ARCHIVE ─────────────────────────────────────── */}
              {activeView === 'archive' && (
                <div>
                  <SectionHeader title="Archive" sub={`${archivedCanvases.length} archived`} />
                  {archivedCanvases.length === 0 ? (
                    <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                      No archived canvases. Archive a canvas from its card menu.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                      {archivedCanvases.map((c, i) => (
                        <CanvasCard
                          key={c.id} canvas={c} delay={i * 30}
                          onClick={() => { restoreCanvas(c.id); onOpenCanvas(c.id) }}
                          showRestore
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>

            {activeView === 'home' && <ActivityFeed />}
          </>
        )}
      </div>
    </div>
  )
}

// ── TemplateCard ────────────────────────────────────────────────────────────

function TemplateCard({ t, delay, onClick }: { t: typeof BUILTIN_TEMPLATES[0]; delay: number; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-1)', border: '1px dashed var(--border-1)', borderRadius: 10, padding: 14, cursor: 'pointer',
        animation: `hub-card-in 420ms var(--ease-spring) ${delay}ms backwards`,
        transition: 'border-color .18s var(--ease-swift), background .18s var(--ease-swift)',
      }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.background = 'var(--bg-2)'; el.style.borderColor = 'var(--accent-2)' }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.background = 'var(--bg-1)'; el.style.borderColor = '' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ color: 'var(--accent-1)' }}>{tagIcon(t.tag)}</span>
        <span style={{ fontSize: 9.5, padding: '2px 7px', borderRadius: 4, background: 'rgba(var(--accent-2-rgb),.12)', border: '1px solid rgba(var(--accent-2-rgb),.2)', color: 'var(--accent-2)', fontFamily: 'var(--font-mono)', letterSpacing: '.06em' }}>{t.tag}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>{t.title}</div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>{t.desc}</div>
    </div>
  )
}
