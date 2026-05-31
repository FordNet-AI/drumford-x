import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * App-wide error boundary.
 *
 * A render/lifecycle throw anywhere below this would otherwise unmount the whole
 * React tree to a BLANK (black) screen with no hint of what happened — especially
 * painful in the packaged desktop app, where opening DevTools isn't second
 * nature. Instead we catch it, show the error text ON SCREEN, and offer a
 * one-click reload to recover (state rehydrates from localStorage / IndexedDB on
 * boot).
 *
 * This is a BACKSTOP, not a license to throw. Feature code (e.g. Coach Mode)
 * still guards its own failures so a non-critical feature degrades in place
 * rather than tripping this whole-app fallback. The boundary only catches the
 * truly unexpected.
 *
 * Styling is intentionally INLINE (not Tailwind): if a failure ever correlates
 * with a CSS/asset problem, a class-dependent fallback could itself render blank.
 * The fallback must have zero dependencies on the thing that might be broken.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface to the console too, with the React component stack, for debugging.
    console.error('[app] uncaught render error:', error, info.componentStack)
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    const message = error.message || String(error)
    const stack = error.stack ?? ''

    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: '#0a0a0f',
          color: '#e5e7eb',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          zIndex: 99999,
          overflow: 'auto',
        }}
      >
        <div
          style={{
            maxWidth: 640,
            width: '100%',
            background: '#15151f',
            border: '1px solid #3a3a4a',
            borderRadius: 12,
            padding: '28px 32px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
            ⚠️ Something went wrong
          </div>
          <div style={{ fontSize: 14, color: '#9ca3af', marginBottom: 20 }}>
            The app hit an unexpected error and stopped rendering. Your library is
            safe — reload to get back in. If this keeps happening, the message
            below pinpoints the cause.
          </div>

          <div
            style={{
              fontFamily: 'ui-monospace, "Cascadia Code", "Courier New", monospace',
              fontSize: 13,
              color: '#fca5a5',
              background: '#1f1320',
              border: '1px solid #4a2a2a',
              borderRadius: 8,
              padding: '12px 14px',
              marginBottom: 16,
              wordBreak: 'break-word',
            }}
          >
            {message}
          </div>

          {stack ? (
            <details style={{ marginBottom: 20 }}>
              <summary style={{ cursor: 'pointer', color: '#9ca3af', fontSize: 13 }}>
                Technical details
              </summary>
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: 12,
                  color: '#6b7280',
                  marginTop: 10,
                  maxHeight: 220,
                  overflow: 'auto',
                }}
              >
                {stack}
              </pre>
            </details>
          ) : null}

          <button
            type="button"
            onClick={this.handleReload}
            style={{
              background: '#6366f1',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '10px 20px',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload app
          </button>
        </div>
      </div>
    )
  }
}
