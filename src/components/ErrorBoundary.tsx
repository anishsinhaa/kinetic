import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from './ui/Button'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

/** Shared crash UI used by the React error boundary and the data-router errorElement. */
export function CrashFallback({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <p className="text-[10px] text-primary uppercase tracking-widest">Something went wrong</p>
        <h1 className="text-3xl font-black text-text-primary">Unexpected error</h1>
        <p className="text-sm text-text-secondary">
          The app hit an unhandled error. You can try again, or reload the page if the problem
          continues.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Button
            variant="primary"
            size="md"
            onClick={onRetry ?? (() => window.location.reload())}
          >
            Try again
          </Button>
          <Button variant="secondary" size="md" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </div>
      </div>
    </div>
  )
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error:', error, info.componentStack)
  }

  private handleRetry = () => {
    this.setState({ hasError: false })
  }

  render() {
    if (this.state.hasError) {
      return <CrashFallback onRetry={this.handleRetry} />
    }

    return this.props.children
  }
}
