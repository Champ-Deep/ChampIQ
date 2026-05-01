import { useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { TopBar } from '@/components/layout/TopBar'
import { ChatPanel } from '@/components/layout/ChatPanel'
import { CanvasArea } from '@/components/canvas/CanvasArea'
import { RightPanel } from '@/components/layout/RightPanel'
import { LogsStrip } from '@/components/layout/LogsStrip'
import { NodeSheet } from '@/components/layout/NodeSheet'
import { NodePalette } from '@/components/layout/NodePalette'
import { Rail } from '@/components/champiq/Rail'
import { ChampMailRailPanel } from '@/components/panels/ChampMailRailPanel'
import { ChampGraphRailPanel } from '@/components/panels/ChampGraphRailPanel'
import { SettingsModal } from '@/components/settings/SettingsModal'
import { TweaksPanel } from '@/components/champiq/TweaksPanel'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useManifests } from '@/hooks/useManifests'
import { usePersistence } from '@/hooks/usePersistence'
import { useExecutionStream } from '@/hooks/useExecutionStream'
import { useB2BPulseEvents } from '@/hooks/useB2BPulseEvents'
import { useUIStore } from '@/store/uiStore'
import { useCanvasStore } from '@/store/canvasStore'

function CockpitView() {
  const { activeRail, setActiveRail, logsOpen, setLogsOpen, settingsOpen, setSettingsOpen, accent, density, railStyle, nodeSheetId, setNodeSheet, cloak, voice } = useUIStore()
  const { nodes } = useCanvasStore()
  const selectedNode = nodes.find(n => n.id === nodeSheetId) ?? null
  const isFullPanel = activeRail === 'mail' || activeRail === 'graph'

  return (
    <div
      data-accent={accent}
      data-density={density}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        background: 'var(--bg-0)',
        color: 'var(--text-1)',
        fontFamily: 'var(--font-body)',
      }}
    >
      {!isFullPanel && <TopBar />}

      <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
        <Rail
          active={activeRail}
          onSelect={setActiveRail}
          onSettings={() => setSettingsOpen(true)}
          variant={railStyle}
        />

        {/* Chat view: chat + palette + canvas + inspector */}
        {activeRail === 'chat' && (
          <>
            <ChatPanel pixieCloak={cloak} voice={voice} />
            <div style={{ display: 'flex', flex: 1, minWidth: 0, minHeight: 0, position: 'relative' }}>
              <NodePalette />
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

        {/* ChampMail full-panel */}
        {activeRail === 'mail' && (
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
            <ChampMailRailPanel pixieCloak={cloak} />
          </div>
        )}

        {/* ChampGraph full-panel */}
        {activeRail === 'graph' && (
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
            <ChampGraphRailPanel pixieCloak={cloak} />
          </div>
        )}
      </div>

      {!isFullPanel && (
        <LogsStrip expanded={logsOpen} onToggle={() => setLogsOpen(!logsOpen)} />
      )}

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        pixieCloak={cloak}
        voice={voice}
      />

      <TweaksPanel />
    </div>
  )
}

function AppInner() {
  useManifests()
  usePersistence()
  useExecutionStream()
  useB2BPulseEvents()

  // Apply accent/density from UI store to document root
  const { accent, density } = useUIStore()
  useEffect(() => {
    document.documentElement.setAttribute('data-accent', accent)
    document.documentElement.setAttribute('data-density', density)
  }, [accent, density])

  return <CockpitView />
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
