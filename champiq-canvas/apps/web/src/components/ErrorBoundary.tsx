/**
 * Top-level error boundary.
 *
 * React only catches render-phase errors via componentDidCatch / getDerivedStateFromError;
 * promises and event handlers still need their own try/catch. The boundary's job
 * here is narrow: when *something* in the tree throws during render, show a
 * recoverable fallback with a copyable trace, instead of a blank screen.
 *
 * SOLID note: SRP — this class does one thing (catch + display). The fallback
 * UI is parametric so callers can swap presentation without touching catch logic.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Optional custom fallback. If omitted, a default panel is rendered. */
  fallback?: (error: Error, reset: () => void) => ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep this minimal — sending traces to a real logging backend is a
    // P2 concern handled separately. console.error is enough today to
    // surface in DevTools and Railway logs.
    console.error('[ErrorBoundary] caught:', error, info.componentStack)
  }

  reset = (): void => this.setState({ error: null })

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback(error, this.reset)
    return <DefaultFallback error={error} onReset={this.reset} />
  }
}

function DefaultFallback({ error, onReset }: { error: Error; onReset: () => void }) {
  const trace = `${error.message}\n\n${error.stack ?? '(no stack)'}`
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        padding: 24,
        background: 'var(--bg-base, #0b0f1a)',
        color: 'var(--text-1, #e6edf3)',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: 640, width: '100%' }}>
        <h1 style={{ fontSize: 18, marginBottom: 8 }}>Something went wrong</h1>
        <p style={{ fontSize: 13, color: 'var(--text-2, #9aa6b2)', marginBottom: 16 }}>
          The canvas hit an unexpected error. Refresh to try again, or copy
          the trace below if you need to report it.
        </p>
        <pre
          style={{
            fontSize: 11,
            padding: 12,
            background: 'var(--bg-1, #111827)',
            border: '1px solid var(--border-1, #1f2937)',
            borderRadius: 6,
            overflow: 'auto',
            maxHeight: 280,
            whiteSpace: 'pre-wrap',
          }}
        >
          {trace}
        </pre>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            onClick={onReset}
            style={{
              padding: '6px 12px',
              fontSize: 13,
              border: '1px solid var(--border-1, #1f2937)',
              borderRadius: 6,
              background: 'transparent',
              color: 'var(--text-1, #e6edf3)',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          <button
            onClick={() => void navigator.clipboard.writeText(trace)}
            style={{
              padding: '6px 12px',
              fontSize: 13,
              border: '1px solid var(--border-1, #1f2937)',
              borderRadius: 6,
              background: '#6366f1',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Copy trace
          </button>
        </div>
      </div>
    </div>
  )
}
