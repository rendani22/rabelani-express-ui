# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Rabelani Express UI** — an Angular 21 delivery/package-management dashboard backed by Supabase. Handles package tracking, driver management, inventory, proof-of-delivery (POD), purchase orders, QR label printing, and user/customer management.

> A detailed companion guide already exists at **`AGENTS.md`** — read it for the full architecture, file-by-file map, component conventions, and key dependencies. This file is the quick orientation; `AGENTS.md` is the reference.

## Commands

```bash
npm start                # Dev server at localhost:4200 (prestart runs version:generate)
npm run start:int        # Dev server against the integration environment
npm run build            # Prod build to dist/cloudflare (prebuild runs version:generate)
npm run build:int        # Integration build
npm test                 # Unit tests — `ng test` → @angular/build:unit-test → Vitest
npm run storybook        # Component explorer at localhost:6006
npm run version:generate # Regenerate src/environments/version.ts from git + package.json
```

Run a single test by filtering with Vitest's pattern arg: `ng test --include src/app/path/to/file.spec.ts` (or pass a name filter). Tests are **Vitest**, not Karma/Jasmine — `*.spec.ts` files live next to the code they test.

Edge functions deploy via Supabase CLI: `npm run deploy:create-package`, `npm run deploy:update-package`.

## Architecture essentials

- **No NgModules.** Every component is standalone with an explicit `imports` array. Routes lazy-load via `loadComponent` in `app.routes.ts`.
- **No NgRx.** State lives in Angular **signals** inside services — services keep a private `signal(...)` and expose `.asReadonly()`. Derived state uses `computed()`.
- **Barrel imports.** Import core types/services from `'../../core'` (resolved by `src/app/core/index.ts`), not from individual files. Feature-local services (e.g. `features/dashboard/services/`) are *not* re-exported from core.
- **Three source layers** under `src/app/`: `core/` (models, services, guards, utils), `features/` (routed feature areas), `shared/` (reusable UI components, directives, the Supabase client wrapper).

### Backend access — two paths, know which to use

- **Package mutations go through Supabase Edge Functions** (`create-package`, `update-package`, `driver-pickup`, `receive-at-collection`) via `PackageService.callEdgeFunction(...)`, with typed responses and type guards (`isCreatePackageSuccess`, `isApiError`). The `EDGE_FUNCTIONS` map lives in `core/models/package.models.ts`.
- **Reads and most other entities use direct Supabase queries** (`supabaseService.client.from(...)`): packages reads, `DeliveryLocationService`, `DriverService`, `InventoryService`, `ReceiverService`, `StaffService`. Lock checks use Supabase RPCs (`is_pod_locked`, `get_pod_lock_status`).
- `SupabaseService` (`shared/services/supabase.service.ts`) wraps the client; `AuthService` is a facade over it. Environment config (Supabase URL/keys) is selected by build configuration via `fileReplacements` in `angular.json` (`environment.ts` / `.int.ts` / `.prod.ts`).

### UI conventions

- Component files use **no `.component` suffix**: `name.ts`, `name.html`, `name.css` (one CSS file per component, not inline).
- Prefer the shared form primitives in `shared/components/` (`text-input/`, `select/`, `checkbox/`, `toggle-switch/`, `button/`, etc.) over raw HTML inputs.
- Forms use typed reactive forms: `fb.nonNullable.group(...)` with validators from `core/utils/form-validation.utils.ts`.
- Styling is **Tailwind 3** (`darkMode: 'class'`); `ToastService` handles imperative notifications; `ThemeService` toggles the `dark` class on `<html>`.

## Git workflow (Squad conventions)

This repo uses a **dev-first** branching model — see `.copilot/skills/git-workflow/SKILL.md`. All feature work branches from **`dev`**, not `main`. Issue branches are named `squad/{issue-number}-{kebab-slug}`. `main` holds released code only.

When you change a public API or function signature, **update its tests in the same commit** — stale assertions (including hard-coded counts) block CI (`.copilot/skills/test-discipline/SKILL.md`).

**Never read `.env*` files** (other than `.env.example`/`.sample`/`.template`) and never write secrets into `.squad/` files — Scribe auto-commits them (`.copilot/skills/secret-handling/SKILL.md`).
