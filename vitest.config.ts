import fs from 'node:fs'
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Mirror vite.config.ts: use the private livecode-OPS logger when it's
// installed, else fall back to the console shim so tests run without the
// registry token. See src/lib/ops-logger-fallback.ts for the rationale.
const loggerInstalled = fs.existsSync(
  fileURLToPath(new URL('./node_modules/@rendani22/logger/package.json', import.meta.url)),
)

/**
 * Test config for the logic layer. Coverage is deliberately scoped (via
 * `coverage.include`) to the framework-agnostic modules — pure helpers, the
 * domain model, the Zustand stores, and the pure hooks — where full coverage is
 * meaningful and stable. Pages/components and the Supabase-backed api/ layer are
 * out of scope (they'd need heavy network/DOM mocking for little benefit).
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      ...(loggerInstalled
        ? {}
        : { '@rendani22/logger': fileURLToPath(new URL('./src/lib/ops-logger-fallback.ts', import.meta.url)) }),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      // The Coupa parser lives beside the edge function that consumes it, but
      // it is pure TS (no Deno APIs) and is exactly the kind of logic this
      // suite exists to cover.
      'supabase/functions/_shared/*.{test,spec}.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      include: [
        'src/lib/utils.ts',
        'src/lib/format.ts',
        'src/lib/csv.ts',
        'src/lib/orders-export.ts',
        'src/lib/status.ts',
        'src/lib/chart.ts',
        'src/lib/signals.ts',
        'src/lib/pod-record.ts',
        'src/lib/audit-log.ts',
        'src/lib/driver-status.ts',
        'src/lib/invite-status.ts',
        'src/lib/package-timeline.ts',
        'src/lib/inventory-movements.ts',
        'src/lib/tour-store.ts',
        'src/lib/ui-store.ts',
        'src/lib/settings-store.ts',
        'src/lib/models/package.ts',
        'src/hooks/use-auto-tour.ts',
        'supabase/functions/_shared/coupa-po.ts',
        'supabase/functions/_shared/coupa-failure-email.ts',
        'supabase/functions/_shared/coupa-audit.ts',
        'supabase/functions/_shared/delivery-photo.ts',
      ],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
})
