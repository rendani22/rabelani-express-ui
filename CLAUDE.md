# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read first

**`AGENTS.md` is the full architecture reference** (directory map, data-layer patterns, routing table, styling system, component conventions, dependency rundown). Read it before non-trivial work — this file only covers orientation, commands, and the gotchas AGENTS.md doesn't. `DESIGN.md` is the "Dispatch" design system; `PRODUCT.md` is the product context.

## What this is

**Rabelani Express UI ("Dispatch")** — a React 19 + Vite 8 delivery/package-management dashboard on a Supabase backend (auth, Postgres, edge functions). Server state via TanStack Query; UI/preference state via Zustand; styling via Tailwind v4 (no config file — everything is in `src/index.css`); UI from shadcn/ui (`components/ui/`) plus domain primitives (`components/dispatch/`). Path alias `@/*` → `src/*`.

## Which branch is the real app

- **`dev` is the active mainline** (React) — branch feature work from `dev` and target it.
- **`main` is the pre-rewrite Angular app** and is effectively an archive; its tooling and layout do **not** match this codebase. Don't port patterns from it or open React PRs against it. (The React app was rewritten from Angular; `angular-archive` tag / "ported from the Angular …" comments refer to that lineage.)

## Commands

```bash
npm run dev            # Vite dev server at localhost:5173 (host + *.trycloudflare.com allowed)
npm run build          # tsc -b (typecheck) then vite build → dist/
npm run lint           # oxlint
npm test               # vitest run (whole suite)
npm run test:watch     # vitest watch
npm run test:coverage  # vitest run --coverage (enforces thresholds — see below)

npx vitest run src/lib/format.test.ts     # a single test file
npx vitest run -t "reschedule"            # tests whose name matches
```

There is no separate typecheck script — `npm run build` (or `npx tsc -b`) is the typecheck. (Note: AGENTS.md predates the test setup and says there's no test script; there is — the above.)

### Testing notes
- Vitest + jsdom + Testing Library; setup in `src/test/setup.ts`. Tests are colocated (`*.test.ts[x]`), and the pure Coupa parser under `supabase/functions/_shared/` is also covered.
- **Coverage is gated to 100%** on an explicit allowlist in `vitest.config.ts` (`coverage.include` — pure `lib/` helpers, the domain model, stores, pure hooks). If you touch a file on that list, `test:coverage` will fail until every branch is covered. Pages, components, and the Supabase-backed `lib/api/` layer are intentionally out of scope.

## The private logger dependency (important)

`src/lib/logger.ts` wraps `@rendani22/logger`, the shared **livecode-OPS** client, which installs from a **private GitHub Packages registry** (`.npmrc`, needs `GITHUB_TOKEN`). To keep install/typecheck/build/test working without that token:

- `@rendani22/logger` is an **`optionalDependency`** — `npm install` degrades instead of hard-failing when it can't be fetched.
- When `node_modules/@rendani22/logger` is absent, `vite.config.ts` and `vitest.config.ts` alias it to a console-only shim (`src/lib/ops-logger-fallback.ts`), and `tsconfig.app.json` redirects the type import there (typecheck-only; the production bundle still uses the real client when the token is present).

**Do not** move the logger back to `dependencies`, delete the fallback, or drop the aliases to "fix" a missing-module error — that reintroduces the token wall. Production telemetry is unchanged wherever the token exists.

## Data & error-handling rules (enforced conventions)

- **Keep React out of `lib/api/`.** Those modules are plain async Supabase functions; hooks in `src/hooks/` wrap them in `useQuery`/`useMutation`. Query keys are arrays (`['orders', query]`).
- **Package *mutations* go through Supabase Edge Functions** (`create-package`, `update-package`, `driver-pickup`, `receive-at-collection`) via `callEdgeFunction` in `lib/api/packages.ts`; reads and other entities use direct `supabase.from(...)`. The `EDGE_FUNCTIONS` map + type guards live in `lib/models/package.ts`.
- **All errors funnel through `reportError(err, fallback, ctx)`** (`lib/logger.ts`) — it logs the real error and returns a user-facing string; use it in `catch` / mutation `onError` with a `toast.error(...)`. Query/mutation failures are also logged centrally by the `QueryClient` caches in `main.tsx`.
- Supabase `.single()`/`.maybeSingle()` with a string `.select()` can defeat a direct cast under TS 6 — after null-checking, cast through `unknown` (`data as unknown as T`).

## Supabase / database

- Migrations live in `supabase/migrations/` (timestamped). Apply with `npm run supabase:link-dev` then `npm run supabase:push`, or let the **`.github/workflows/db-migrate.yml`** CI apply them on push to `dev` (needs `SUPABASE_ACCESS_TOKEN` + `SUPABASE_DB_PASSWORD` repo secrets). Migrations are **not** auto-applied by pushing app code — they run only via `db push` / that CI.
- **Notifications rows are created only by SECURITY DEFINER triggers/functions**, never by the client (the table has no INSERT policy). The status-change fan-out is `notify_staff_on_package_change`; `notify_package_exception` handles non-status events (reschedule/overdue/stuck); a pg_cron sweep drives overdue/stuck. System batches set the transaction-local `app.suppress_notifications` flag to silence per-row notifications while still recording status history.
- Edge-function sources are under `supabase/functions/` (`create-package`, `update-package`, `_shared`); some deployed functions aren't vendored. Deploy via the `deploy*` npm scripts.

## Conventions

- **Files**: kebab-case `.ts`/`.tsx`, one concern per file; dialogs/panels sit beside their feature page under `src/pages/<feature>/`. No `.component` suffix.
- **Add shadcn/ui primitives via the shadcn CLI** (`components.json`); merge classes with `cn()` from `@/lib/utils`. Prefer the `components/dispatch/` domain primitives (`StatusStamp`, `TrackingNumber`, etc.) for delivery-domain UI.
- **Styling**: status → tone/label mapping is centralized in `lib/status.ts`; green is semantic (delivered/collected), cargo-orange `--primary` is for primary actions/brand only. Dark mode is class-based via `next-themes`.
- **Toasts** = sonner; **icons** = lucide-react; **forms** are controlled/component-local (no form library).
