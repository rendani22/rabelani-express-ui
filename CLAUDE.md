# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Rabelani Express UI** ("Dispatch") — a **React 19 + Vite** delivery/package-management dashboard backed by Supabase. Handles package tracking, driver management, inventory, proof-of-delivery (POD), purchase orders, QR label printing, and user/customer management.

> This app was rewritten from Angular to React. The pre-rewrite Angular tree is preserved only at the git tag **`angular-archive`** — it is no longer in the working tree. A detailed companion guide exists at **`AGENTS.md`** — read it for the full architecture, file-by-file map, component conventions, and key dependencies. This file is the quick orientation; `AGENTS.md` is the reference.

## Commands

```bash
npm run dev       # Vite dev server at localhost:5173 (host + Cloudflare tunnel allowed)
npm run build     # Typecheck (tsc -b) then production build to dist/
npm run preview   # Serve the production build locally
npm run lint      # oxlint
```

There is **no test script** and no Storybook in the React app. There is no `:int` build variant — environment differences come from Vite env vars (`VITE_*`), not build configurations.

Edge functions live under `supabase/functions/` and deploy via the Supabase CLI.

## Architecture essentials

- **React 19 + Vite 8**, TypeScript. Path alias `@/*` → `src/*` (configured in both `vite.config.ts` and the tsconfigs).
- **shadcn/ui** (new-york style) primitives in `src/components/ui/`, built on `radix-ui` + `class-variance-authority`. Add components with the shadcn CLI; config in `components.json`.
- **Routing:** `react-router-dom` v7, all routes declared in `src/App.tsx` (not lazy-loaded). `<ProtectedRoute>` gates authenticated routes; `<AppLayout>` is the shell.
- **Server state → TanStack Query.** Data lives in `useQuery`/`useMutation` hooks (`src/hooks/`), never in ad-hoc component state. The `QueryClient` is configured in `src/main.tsx` with centralized error logging via `QueryCache`/`MutationCache`.
- **UI-only state → Zustand.** Small stores in `src/lib/` (`ui-store.ts` for nav/command-palette, `settings-store.ts` persisted to localStorage). No Redux, no NgRx.
- **Auth → React Context.** `AuthProvider`/`useAuth` in `src/lib/auth.tsx` wraps the Supabase auth session.

### Backend access — two paths, know which to use

- **Package mutations go through Supabase Edge Functions** (`create-package`, `update-package`, `driver-pickup`, `receive-at-collection`) via a private `callEdgeFunction` helper in `src/lib/api/packages.ts`, with typed responses and type guards (`isCreatePackageSuccess`, `isApiError`). The `EDGE_FUNCTIONS` map lives in `src/lib/models/package.ts`.
- **Reads and most other entities use direct Supabase queries** (`supabase.from(...)`): package reads, `drivers`, `inventory`, `delivery-locations`, `receivers`, `staff`, `purchase-orders`, `email-templates`. Lock checks and soft-deletes use Supabase RPCs (`is_pod_locked`, `get_pod_lock_status`, `soft_delete_package`, `restore_package`).
- The shared client is `src/lib/supabase.ts`; config (URL/anon key/functions URL) is in `src/lib/config.ts`, overridable via `VITE_SUPABASE_*` env vars. The anon key is a public client key — safe to keep in `config.ts`.

### Data-access convention

The `src/lib/api/*.ts` modules are **framework-agnostic** — plain async functions over the Supabase client, no React. They return result shapes (`{ success, data }` / `{ success, error }`) or throw. React hooks in `src/hooks/` wrap them in TanStack Query. Keep data logic in `lib/api/`, keep React in `hooks/` and components.

### Errors & logging

All error reporting funnels through `src/lib/logger.ts` (a wrapper over `@rendani22/logger` — the shared livecode-OPS client). Use `reportError(err, fallback, ctx)` in catch blocks / mutation `onError` to both ship the real error and get a user-facing string for `toast.error(...)`. Global handlers and query/mutation errors are already wired in `main.tsx`.

### UI conventions

- **File naming:** kebab-case `.tsx`/`.ts` (e.g. `create-package-dialog.tsx`). One component concern per file.
- Prefer the shadcn primitives in `src/components/ui/` and the domain primitives in `src/components/dispatch/` over raw HTML.
- **Styling is Tailwind CSS v4** via `@tailwindcss/vite` — configured entirely in `src/index.css` (no `tailwind.config.js`). Design tokens are CSS custom properties (oklch) with `.dark` overrides; dark mode is class-based via `next-themes`. See `AGENTS.md` for the "Dispatch" color system (cargo-orange accent, semantic green = delivered only).
- Toasts use **sonner** (`import { toast } from 'sonner'`). Icons use **lucide-react**.

## Git workflow (Squad conventions)

This repo uses a **dev-first** branching model — see `.copilot/skills/git-workflow/SKILL.md`. All feature work branches from **`dev`**, not `main`. Issue branches are named `squad/{issue-number}-{kebab-slug}`. `main` holds released code only.

When you change a public API or function signature, update its call sites in the same commit.

**Never read `.env*` files** (other than `.env.example`/`.sample`/`.template`) and never write secrets into `.squad/` files — Scribe auto-commits them (`.copilot/skills/secret-handling/SKILL.md`).

## Design context

- **`PRODUCT.md`** (root) — the strategic layer: who Dispatch is for, what it's for, positioning, brand personality, anti-references, and the design principles UI work should answer to. Read it before making design decisions.
- **`.interface-design/system.md`** — the working design-system log: the "Dispatch" direction, tokens, signature components, and a running record of what's been built.
- Design tokens themselves live in `src/index.css` (Tailwind v4 `@theme inline`); treat those as the source of truth over any doc.
