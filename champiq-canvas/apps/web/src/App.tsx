import { useEffect, useCallback } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { TopBar } from '@/components/layout/TopBar'
import { CanvasArea } from '@/components/canvas/CanvasArea'
import { RightPanel } from '@/components/layout/RightPanel'
import { LogsStrip } from '@/components/layout/LogsStrip'
import { NodeSheet } from '@/components/layout/NodeSheet'
import { LeftPanel } from '@/components/layout/LeftPanel'
import { Rail } from '@/components/champiq/Rail'
import { ChampMailRailPanel } from '@/components/panels/ChampMailRailPanel'
import { ChampGraphRailPanel } from '@/components/panels/ChampGraphRailPanel'
import { SettingsModal } from '@/components/settings/SettingsModal'
import { TweaksPanel } from '@/components/champiq/TweaksPanel'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { HubScreen } from '@/components/hub/HubScreen'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { Onboarding } from '@/components/layout/Onboarding'
import { useManifests } from '@/hooks/useManifests'
import { usePersistence } from '@/hooks/usePersistence'
import { useExecutionStream } from '@/hooks/useExecutionStream'
import { useB2BPulseEvents } from '@/hooks/useB2BPulseEvents'
import { useUIStore } from '@/store/uiStore'
import { useCanvasStore } from '@/store/canvasStore'

// ── Cockpit: the per-canvas view (Rail + SidePanel + Canvas always visible) ─

function CockpitView({ onGoHub }: { onGoHub: () => void }) {
  const {
    activeRail, setActiveRail,
    logsOpen, setLogsOpen,
    settingsOpen, setSettingsOpen,
    accent, density, railStyle,
    nodeSheetId, setNodeSheet,
    cloak, voice,
    cmdOpen, setCmdOpen,
    leftPanelVisible, setLeftPanelVisible,
  } = useUIStore()
  const { nodes } = useCanvasStore()
  const selectedNode = nodes.find(n => n.id === nodeSheetId) ?? null

  return (
    <div
      data-accent={accent}
      data-density={density}
      style={{
        display: 'flex', flexDirection: 'column',
        height: '100vh', width: '100vw', overflow: 'hidden',
        background: 'var(--bg-0)', color: 'var(--text-1)',
        fontFamily: 'var(--font-body)',
      }}
    >
      <TopBar onHub={onGoHub} onCmdOpen={() => setCmdOpen(true)} />

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Rail nav — left 56px column, ChampMark navigates home */}
        <Rail
          active={activeRail}
          onSelect={setActiveRail}
          onSettings={() => setSettingsOpen(true)}
          onHub={onGoHub}
          variant={railStyle}
          panelVisible={leftPanelVisible}
          onTogglePanel={() => setLeftPanelVisible(!leftPanelVisible)}
        />

        {/* Chat view: Pixie/Nodes left panel + canvas + inspector */}
        {activeRail === 'chat' && (
          <>
            {leftPanelVisible && <LeftPanel pixieCloak={cloak} voice={voice} />}
            <div style={{ display: 'flex', flex: 1, minWidth: 0, minHeight: 0, position: 'relative' }}>
              <CanvasArea onNodeOpen={(id) => setNodeSheet(id)} />
              <RightPanel />
              {selectedNode && (
                <NodeSheet
                  node={selectedNode}
                  pixieCloak={cloak}
                  onClose={() => setNodeSheet(null)}
                />
              )}
            </div>
          </>
        )}

        {/* ChampMail full-panel — no canvas */}
        {activeRail === 'mail' && (
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
            <ChampMailRailPanel pixieCloak={cloak} />
          </div>
        )}

        {/* ChampGraph full-panel — no canvas */}
        {activeRail === 'graph' && (
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
            <ChampGraphRailPanel pixieCloak={cloak} />
          </div>
        )}
      </div>

      <LogsStrip expanded={logsOpen} onToggle={() => setLogsOpen(!logsOpen)} />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        pixieCloak={cloak}
        voice={voice}
      />

      <TweaksPanel />

      {/* Command palette overlay */}
      {cmdOpen && (
        <CommandPalette
          onClose={() => setCmdOpen(false)}
          onOpenCanvas={(id) => {
            useCanvasStore.setState({ currentCanvasId: id })
            setCmdOpen(false)
          }}
          onNewCanvas={() => {
            const id = crypto.randomUUID()
            const meta = { id, name: 'New Canvas', updatedAt: new Date().toISOString() }
            const list = [...useCanvasStore.getState().canvasList, meta]
            useCanvasStore.setState({ canvasList: list, currentCanvasId: id, canvasName: 'New Canvas' })
            localStorage.setItem('champiq:canvas:list', JSON.stringify(list))
            setCmdOpen(false)
          }}
        />
      )}
    </div>
  )
}

// ── AppInner: routing + all data hooks ───────────────────────────────────────

function AppInner() {
  useManifests()
  usePersistence()
  useExecutionStream()
  useB2BPulseEvents()

  const {
    appView, setAppView,
    setActiveCanvas,
    isFirstRun, setIsFirstRun,
    accent, density, isDark,
    cmdOpen, setCmdOpen,
    settingsOpen, setSettingsOpen,
    cloak,
    setActiveRail,
    leftPanelVisible, setLeftPanelVisible,
  } = useUIStore()

  // Sync accent/density/theme to document root
  useEffect(() => {
    document.documentElement.setAttribute('data-accent', accent)
    document.documentElement.setAttribute('data-density', density)
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
  }, [accent, density, isDark])

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      if (e.key === 'k') { e.preventDefault(); setCmdOpen(true) }
      if (e.key === '1') { e.preventDefault(); setActiveRail('chat'); if (appView !== 'cockpit') setAppView('cockpit') }
      if (e.key === '2') { e.preventDefault(); setActiveRail('mail'); if (appView !== 'cockpit') setAppView('cockpit') }
      if (e.key === '3') { e.preventDefault(); setActiveRail('graph'); if (appView !== 'cockpit') setAppView('cockpit') }
      if (e.key === ',') { e.preventDefault(); setSettingsOpen(true) }
      if (e.key === '\\') { e.preventDefault(); setLeftPanelVisible(!leftPanelVisible) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setCmdOpen, setActiveRail, setAppView, appView, setSettingsOpen, setLeftPanelVisible, leftPanelVisible])

  const openCanvas = useCallback((id: string) => {
    const { setCurrentCanvasId, canvasList } = useCanvasStore.getState()
    const canvas = canvasList.find((c) => c.id === id)
    setCurrentCanvasId(id)
    if (canvas) useCanvasStore.setState({ canvasName: canvas.name })
    setActiveCanvas(id)
    setAppView('cockpit')
  }, [setActiveCanvas, setAppView])

  const newCanvas = useCallback(() => {
    const id = crypto.randomUUID()
    const meta = { id, name: 'New Canvas', updatedAt: new Date().toISOString() }
    const list = [...useCanvasStore.getState().canvasList, meta]
    useCanvasStore.setState({ canvasList: list, currentCanvasId: id, canvasName: 'New Canvas' })
    localStorage.setItem('champiq:canvas:list', JSON.stringify(list))
    setActiveCanvas(id)
    setAppView('cockpit')
  }, [setActiveCanvas, setAppView])

  const goHub = useCallback(() => {
    setAppView('hub')
  }, [setAppView])

  // Onboarding: show on first run while in hub
  if (isFirstRun && appView === 'hub') {
    return (
      <Onboarding
        onComplete={() => { setIsFirstRun(false); newCanvas() }}
        onSkip={() => setIsFirstRun(false)}
      />
    )
  }

  if (appView === 'hub') {
    return (
      <>
        <HubScreen onOpenCanvas={openCanvas} onNewCanvas={newCanvas} />
        {/* Command palette available from hub too */}
        {cmdOpen && (
          <CommandPalette
            onClose={() => setCmdOpen(false)}
            onOpenCanvas={openCanvas}
            onNewCanvas={newCanvas}
          />
        )}
        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          pixieCloak={cloak}
          voice={useUIStore.getState().voice}
        />
      </>
    )
  }

  return <CockpitView onGoHub={goHub} />
}

export default function App() {
  return (
    <ErrorBoundary>
      <ReactFlowProvider>
        <AppInner />
      </ReactFlowProvider>
    </ErrorBoundary>
  )
}
