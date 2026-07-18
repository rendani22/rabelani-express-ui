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
| `npm test` | Run the test suite (vitest) |
| `npm run test:coverage` | Tests with coverage (100% thresholds on the covered `lib/` set) |

## Configuration

Runtime config lives in `src/lib/config.ts` and is overridable via Vite env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_FUNCTIONS_URL`, and the `VITE_OPS_*` logging vars). The Supabase anon key is a public client key.

## Stack

React 19 · Vite 8 · TypeScript · Tailwind CSS v4 · shadcn/ui (radix-ui) · TanStack Query · Zustand · react-router-dom · Supabase.

## Documentation

- **`CLAUDE.md`** — quick orientation and conventions.
- **`AGENTS.md`** — full architecture, file-by-file map, and component conventions.

> This app was rewritten from Angular to React; the pre-rewrite Angular source is preserved at the git tag `angular-archive`.
