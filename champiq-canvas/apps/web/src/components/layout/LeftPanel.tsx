import { useState } from 'react'
import { MessageSquare, Layers } from 'lucide-react'
import { ChatPanel } from './ChatPanel'
import { NodePalette } from './NodePalette'
import type { CloakColor, VoicePreset } from '@/store/uiStore'

interface LeftPanelProps {
  pixieCloak?: CloakColor | string
  voice?: VoicePreset | string
}

export function LeftPanel({ pixieCloak, voice }: LeftPanelProps) {
  const [tab, setTab] = useState<'pixie' | 'nodes'>('pixie')

  return (
    <div style={{
      width: 360, flexShrink: 0,
      display: 'flex', flexDirection: 'column', minHeight: 0,
      background: 'var(--bg-1)', borderRight: '1px solid var(--border-1)',
    }}>
      {/* Pixie | Nodes tab bar */}
      <div style={{
        display: 'flex', height: 40, flexShrink: 0,
        borderBottom: '1px solid var(--border-1)',
        background: 'var(--bg-1)',
      }}>
        <TabBtn active={tab === 'pixie'} onClick={() => setTab('pixie')}>
          <MessageSquare size={12} />
          Pixie
        </TabBtn>
        <TabBtn active={tab === 'nodes'} onClick={() => setTab('nodes')}>
          <Layers size={12} />
          Nodes
        </TabBtn>
      </div>

      {/* Content — fills remaining height */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {tab === 'pixie' && <ChatPanel pixieCloak={pixieCloak} voice={voice} />}
        {tab === 'nodes' && <NodePalette embedded />}
      </div>
    </div>
  )
}

function TabBtn({
  active, onClick, children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        background: 'transparent', border: 'none',
        borderBottom: active ? '2px solid var(--accent-2)' : '2px solid transparent',
        color: active ? 'var(--text-1)' : 'var(--text-4)',
        fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700,
        cursor: 'pointer', letterSpacing: '.07em', textTransform: 'uppercase',
        transition: 'color .15s', paddingBottom: 0,
      }}
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--text-2)' }}
      onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--text-4)' }}
    >
      {children}
    </button>
  )
}
