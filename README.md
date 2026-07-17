# Rabelani Express UI ("Dispatch")

A React 19 + Vite delivery/package-management dashboard backed by Supabase — package tracking, driver management, inventory, proof-of-delivery (POD), purchase orders, QR label printing, and user/customer/staff management.

## Getting started

```bash
npm install
npm run dev        # dev server at http://localhost:5173
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server at `localhost:5173` |
| `npm run build` | Typecheck (`tsc -b`) then production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Lint with oxlint |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:coverage` | Coverage report — enforces 100% thresholds on the logic layer |

To run a single file or a single test by name:

```bash
npx vitest run src/lib/format.test.ts
npx vitest run -t 'formats date and time'
```

Coverage is deliberately scoped (see `vitest.config.ts`) to the framework-agnostic logic layer — pure helpers, the domain model, and the stores — where 100% is meaningful. Pages and the Supabase-backed `src/lib/api/` layer are out of scope; a few flows are covered by `*.integration.test.tsx` instead.

### Supabase

Migrations and edge functions ship through the Supabase CLI. Both act on **whichever project is currently linked**, so link first:

| Command | Description |
|---------|-------------|
| `npm run supabase:link-dev` / `supabase:link-prod` | Switch the linked project |
| `npm run supabase:push` | Push `supabase/migrations/` to the linked project |
| `npm run deploy-functions` | Deploy every edge function |
| `npm run deploy:create-package` | Deploy one function (also `update-package`, `invite-customer`, `customer-pod`, `send-test-email`) |

## Configuration

Runtime config lives in `src/lib/config.ts` and is overridable via Vite env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_FUNCTIONS_URL`, and the `VITE_OPS_*` logging vars). The Supabase anon key is a public client key.

## Stack

React 19 · Vite 8 · TypeScript · Tailwind CSS v4 · shadcn/ui (radix-ui) · TanStack Query · Zustand · react-router-dom · Supabase.

## Documentation

- **`CLAUDE.md`** — quick orientation and conventions.
- **`AGENTS.md`** — full architecture, file-by-file map, and component conventions.

> This app was rewritten from Angular to React; the pre-rewrite Angular source is preserved at the git tag `angular-archive`.
