import type { ReactElement, ReactNode } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { TooltipProvider } from '@/components/ui/tooltip'

/** A fresh QueryClient per render — no retries/cache bleed between tests. */
function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  })
}

interface Options extends Omit<RenderOptions, 'wrapper'> {
  /** Initial history entry for the router (default "/"). */
  route?: string
  /**
   * Optional extra routes to register alongside the element under test at "*".
   * Handy for asserting post-navigation landing pages.
   */
  routes?: { path: string; element: ReactNode }[]
}

/**
 * Render a component with the same provider stack the app uses (theme, query
 * client, tooltips, router) so integration tests exercise real wiring.
 */
export function renderWithProviders(ui: ReactElement, { route = '/', routes, ...options }: Options = {}) {
  const client = makeClient()
  const pathname = route.split('?')[0] // Route path can't carry a query string
  const view = render(
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <MemoryRouter initialEntries={[route]}>
            <Routes>
              <Route path={pathname} element={ui} />
              {routes?.map((r) => (
                <Route key={r.path} path={r.path} element={r.element} />
              ))}
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>,
    options,
  )
  return { ...view, client }
}
