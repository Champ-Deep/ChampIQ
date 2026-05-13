import { useState } from 'react'
import { useCanvasStore } from '@/store/canvasStore'
import { useExecutionStore } from '@/store/executionStore'
import { useUIStore } from '@/store/uiStore'
import { api } from '@/lib/api'
import { saveCurrentCanvas } from '@/hooks/usePersistence'
import { useRunAll } from '@/hooks/useRunAll'
import { Icon, Btn, Hotkey, Tag } from '@/components/atoms'
import { Trash2 } from 'lucide-react'

interface TopBarProps {
  onHub?: () => void
  onCmdOpen?: () => void
}

export function TopBar({ onHub, onCmdOpen }: TopBarProps = {}) {
  const { canvasName, nodes, edges, setCanvasName, clearCanvas, getCronTriggers } = useCanvasStore()
  const { addLog } = useExecutionStore()
  const { setCmdOpen } = useUIStore()
  const { runAll, isRunningAll } = useRunAll()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activating, setActivating] = useState(false)
  const [activeWorkflowId, setActiveWorkflowId] = useState<number | null>(null)

  async function handleSave() {
    if (saving) return
    setSaving(true)
    setSaved(false)
    try {
      saveCurrentCanvas()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      console.error('Save failed', e)
    } finally {
      setSaving(false)
    }
  }

  async function handleActivate() {
    if (activating || nodes.length === 0) return
    setActivating(true)
    addLog({ nodeId: 'activate', nodeName: 'Activate', status: 'running', message: 'Registering workflow…' })
    try {
      const triggers = getCronTriggers()
      const body = { name: canvasName, description: `From canvas: ${canvasName}`, active: true, nodes, edges, triggers }
      let wf: Awaited<ReturnType<typeof api.createWorkflow>>
      if (activeWorkflowId) {
        wf = await api.updateWorkflow(activeWorkflowId, body)
      } else {
        wf = await api.createWorkflow(body)
        setActiveWorkflowId(wf.id)
      }
      addLog({
        nodeId: 'activate', nodeName: 'Activate', status: 'success',
        message: triggers.length > 0
          ? `Workflow #${wf.id} active — ${triggers.length} cron schedule(s) registered`
          : `Workflow #${wf.id} active`,
      })
    } catch (e) {
      addLog({ nodeId: 'activate', nodeName: 'Activate', status: 'error', message: String(e) })
    } finally {
      setActivating(false)
    }
  }

  function handleClear() {
    if (nodes.length === 0) return
    if (!confirm('Clear the canvas? All nodes and edges will be removed.')) return
    clearCanvas()
    saveCurrentCanvas()
  }

  function handleSearchClick() {
    // Prefer prop callback for backward compat; fall back to store action
    if (onCmdOpen) { onCmdOpen(); return }
    setCmdOpen(true)
  }

  return (
    <div style={{
      height: 48,
      flexShrink: 0,
      background: 'var(--bg-1)',
      borderBottom: '1px solid var(--border-1)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 14px',
      gap: 14,
    }}>
      {/* Left: breadcrumb + canvas name + clear */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-3)', minWidth: 0 }}>
        {onHub && (
          <button
            onClick={onHub}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none',
              color: 'var(--text-3)', fontFamily: 'var(--font-body)', fontSize: 12, cursor: 'pointer',
              padding: '2px 4px', borderRadius: 4, transition: 'color .15s', flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-1)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)' }}
          >
            <Icon name="folder" size={13} />
            <span style={{ marginLeft: 4 }}>Canvases</span>
          </button>
        )}
        {!onHub && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon name="folder" size={13} />
            <span style={{ fontSize: 12 }}>Canvases</span>
          </div>
        )}
        <Icon name="chevRight" size={11} />
        <input
          value={canvasName}
          onChange={(e) => setCanvasName(e.target.value)}
          onBlur={() => saveCurrentCanvas()}
          aria-label="Canvas name"
          style={{
            background: 'transparent', border: 'none', outline: 'none',
            fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600,
            color: 'var(--text-1)', width: 160, minWidth: 0,
            borderBottom: '1px solid transparent',
            transition: 'border-color .15s',
            paddingBottom: 1,
          }}
          onFocus={(e) => { e.currentTarget.style.borderBottomColor = 'rgba(var(--accent-2-rgb),.45)' }}
          onBlurCapture={(e) => { e.currentTarget.style.borderBottomColor = 'transparent' }}
        />
        <Tag color={saved ? 'var(--success)' : 'var(--text-4)'}>{saved ? 'Saved' : 'Auto-save'}</Tag>

        {/* Clear canvas */}
        <button
          onClick={handleClear}
          title="Clear canvas"
          disabled={nodes.length === 0}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px',
            background: 'transparent', border: '1px solid transparent', borderRadius: 6,
            color: 'var(--text-4)', cursor: nodes.length === 0 ? 'not-allowed' : 'pointer',
            opacity: nodes.length === 0 ? 0.35 : 1, transition: 'all .14s',
            fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 500, flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            if (nodes.length > 0) {
              e.currentTarget.style.color = 'var(--danger)'
              e.currentTarget.style.borderColor = 'rgba(255,77,109,.3)'
              e.currentTarget.style.background = 'rgba(255,77,109,.07)'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-4)'
            e.currentTarget.style.borderColor = 'transparent'
            e.currentTarget.style.background = 'transparent'
          }}
        >
          <Trash2 size={12} /> Clear
        </button>
      </div>

      {/* Center: search — truly centered */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={handleSearchClick}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px 5px 10px',
            background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 8,
            color: 'var(--text-3)', fontFamily: 'var(--font-body)', fontSize: 12, cursor: 'pointer',
            width: 300, textAlign: 'left',
            transition: 'border-color .15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-2)' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-1)' }}
        >
          <Icon name="search" size={13} />
          <span style={{ flex: 1 }}>Search Canvases…</span>
          <Hotkey>⌘K</Hotkey>
        </button>
      </div>

      {/* Right: actions — keep all existing handlers */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <Btn variant="ghost" size="md" icon="save" onClick={handleSave} disabled={saving}>
          Save
        </Btn>
        <Btn
          variant="secondary"
          size="md"
          onClick={handleActivate}
          disabled={activating || nodes.length === 0}
          title={activeWorkflowId ? `Re-sync #${activeWorkflowId}` : 'Register cron + activate'}
        >
          {activating ? 'Activating…' : activeWorkflowId ? 'Active' : 'Activate'}
        </Btn>
        <Btn
          variant="primary"
          size="md"
          icon="play"
          onClick={runAll}
          disabled={isRunningAll || nodes.length === 0}
        >
          {isRunningAll ? 'Running…' : 'Run All'}
        </Btn>
      </div>
    </div>
  )
}
