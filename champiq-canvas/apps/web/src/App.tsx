import { ReactFlowProvider } from '@xyflow/react'
import { TopBar } from '@/components/layout/TopBar'
import { LeftSidebar } from '@/components/layout/LeftSidebar'
import { ChatPanel } from '@/components/layout/ChatPanel'
import { CanvasArea } from '@/components/canvas/CanvasArea'
import { RightPanel } from '@/components/layout/RightPanel'
import { BottomLog } from '@/components/layout/BottomLog'
import { SettingsPage } from '@/components/settings/SettingsPage'
import { useManifests } from '@/hooks/useManifests'
import { usePersistence } from '@/hooks/usePersistence'
import { useTheme } from '@/hooks/useTheme'
import { useExecutionStream } from '@/hooks/useExecutionStream'
import { useB2BPulseEvents } from '@/hooks/useB2BPulseEvents'
import { useViewStore } from '@/store/viewStore'

function CanvasView() {
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <ChatPanel />
        <LeftSidebar />
        <CanvasArea />
        <RightPanel />
      </div>
      <BottomLog />
    </div>
  )
}

function AppInner() {
  useTheme()
  useManifests()
  usePersistence()
  useExecutionStream()
  useB2BPulseEvents()

  const view = useViewStore((s) => s.view)
  return view === 'settings' ? <SettingsPage /> : <CanvasView />
}

export default function App() {
  return (
    <ReactFlowProvider>
      <AppInner />
    </ReactFlowProvider>
  )
}
