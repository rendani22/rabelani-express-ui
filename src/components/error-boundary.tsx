import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'
import { logger } from '@/lib/logger'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
}
interface State {
  hasError: boolean
}

/**
 * Catches render-time errors anywhere below it, ships the real error to the
 * logger, and shows a recoverable fallback instead of a blank white screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error(error, { kind: 'react.render', componentStack: info.componentStack })
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            An unexpected error interrupted this page. The details have been logged. Try reloading — your
            data is safe.
          </p>
        </div>
        <Button onClick={() => window.location.reload()}>
          <RotateCcw /> Reload page
        </Button>
      </div>
    )
  }
}
