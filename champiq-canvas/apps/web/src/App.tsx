import { ReactFlowProvider } from '@xyflow/react'
import { TopBar } from '@/components/layout/TopBar'
import { LeftSidebar } from '@/components/layout/LeftSidebar'
import { CanvasArea } from '@/components/canvas/CanvasArea'
import { RightPanel } from '@/components/layout/RightPanel'
import { BottomLog } from '@/components/layout/BottomLog'
import { useManifests } from '@/hooks/useManifests'
import { usePersistence } from '@/hooks/usePersistence'
import { useTheme } from '@/hooks/useTheme'

function AppInner() {
  useTheme()
  useManifests()
  usePersistence()

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <LeftSidebar />
        <CanvasArea />
        <RightPanel />
      </div>
      <BottomLog />
    </div>
  )
}

export default function App() {
  return (
    <ReactFlowProvider>
      <AppInner />
    </ReactFlowProvider>
  )
}
