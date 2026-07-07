import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/lib/auth'
import { ErrorBoundary } from '@/components/error-boundary'
import { installGlobalErrorHandlers, logger } from '@/lib/logger'
import { startUptimeReporting } from '@/lib/uptime'
import './index.css'
import App from './App.tsx'

// Ship uncaught errors/rejections, plus session-start + heartbeat uptime logs.
installGlobalErrorHandlers()
startUptimeReporting()

const queryClient = new QueryClient({
  // Centralised capture: every failed query/mutation logs its *actual* error
  // object (with the key for context), regardless of any per-call onError. The
  // UI is then only responsible for showing a useful message.
  queryCache: new QueryCache({
    onError: (error, query) => logger.error(error, { kind: 'query', queryKey: query.queryKey }),
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) =>
      logger.error(error, { kind: 'mutation', mutationKey: mutation.options.mutationKey }),
  }),
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider delayDuration={200}>
            <AuthProvider>
              <BrowserRouter>
                <App />
              </BrowserRouter>
            </AuthProvider>
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </ThemeProvider>
  </StrictMode>,
)
