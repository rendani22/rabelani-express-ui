# AGENTS.md - AI Coding Agent Guidelines

## Project Overview

**Rabelani Express UI** – Angular 21+ delivery/package management dashboard with Supabase backend. Features package tracking, driver management, user authentication, and QR code label printing.

## Architecture

### Directory Structure
```
src/app/
├── core/           # Shared models, services, guards, utils (barrel exported via index.ts)
├── features/       # Feature modules: dashboard, orders, drivers, login, user-management
└── shared/         # Reusable UI components, directives, services (Supabase client)
```

### Key Patterns

**Barrel Exports**: Core module exports everything via `src/app/core/index.ts`. Import from `'../../core'` not individual files:
```typescript
import { AuthService, Package, PackageService, authGuard } from '../../core';
```

**State Management**: Uses Angular signals (not NgRx). Services expose readonly signals for state:
```typescript
private readonly _packages = signal<Package[]>([]);
readonly packages = this._packages.asReadonly();
readonly isLoading = signal(false);
```

**Standalone Components**: All components are standalone with explicit imports array. No NgModules.

**Lazy Loading**: Routes use `loadComponent` pattern in `app.routes.ts`.

## Backend Integration

- **Supabase** for auth and database (configured in `src/environments/environment.ts`)
- `SupabaseService` (`shared/services/supabase.service.ts`) wraps Supabase client
- `AuthService` is a facade over `SupabaseService` for auth operations
- Package operations use **Supabase Edge Functions**: `create-package`, `update-package`, `driver-pickup`, `receive-at-collection`

### API Pattern (PackageService example)
```typescript
// Edge function calls use callEdgeFunction with typed responses
const response = await this.callEdgeFunction<CreatePackageApiResponse>(
  EDGE_FUNCTIONS.CREATE_PACKAGE,
  accessToken,
  request
);
// Use type guards: isCreatePackageSuccess(response), isApiError(response)
```

## Styling

- **Tailwind CSS 3** with `darkMode: 'class'`
- Custom `xs: 475px` breakpoint
- Global styles in `src/styles.css` (imports Tailwind + flatpickr)
- Component styles: use `.css` file per component (not inline)
- Dark mode: `ThemeService` adds/removes `dark` class on `<html>`

## Component Conventions

**File naming**: `component-name.ts`, `component-name.html`, `component-name.css` (no `.component` suffix)

**Shared components** location: `src/app/shared/components/` with barrel exports:
- `modals/index.ts` – Modal components
- `sidebar/index.ts`, `header/index.ts` – Layout parts

**Form patterns**: Typed reactive forms with `FormBuilder.nonNullable.group()`:
```typescript
readonly form = this.fb.nonNullable.group({
  receiverEmail: ['', [Validators.required, Validators.pattern(EMAIL_PATTERN)]],
});
```

## Commands

```bash
npm start          # Dev server at localhost:4200
npm run build      # Production build to dist/cloudflare
npm test           # Vitest unit tests
npm run storybook  # Component docs at localhost:6006
```

## Testing

- **Vitest** for unit tests (not Karma/Jasmine)
- Test files: `*.spec.ts` alongside components
- Storybook stories: `src/stories/*.stories.ts`

## Icons

Uses `@ng-icons/tabler-icons`. Import and use in component:
```typescript
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import { tablerIconName } from '@ng-icons/tabler-icons';
```

## Important Files

| File | Purpose |
|------|---------|
| `src/app/core/index.ts` | Barrel exports for core module |
| `src/app/core/models/package.models.ts` | Package types, status constants, type guards |
| `src/app/core/services/package.service.ts` | Package CRUD via Edge Functions |
| `src/app/shared/services/supabase.service.ts` | Supabase client wrapper |
| `src/app/shared/components/modals/index.ts` | Modal component exports |
| `tailwind.config.js` | Tailwind with safelisted grid classes |

