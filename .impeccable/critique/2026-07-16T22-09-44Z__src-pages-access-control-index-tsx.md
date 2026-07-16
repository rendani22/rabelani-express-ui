---
target: access control page
total_score: 18
p0_count: 2
p1_count: 3
timestamp: 2026-07-16T22-09-44Z
slug: src-pages-access-control-index-tsx
---
Method: dual-agent (A: a669b559b928dc957 · B: a67d441cc87ec9db8)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Optimistic ticks + correct skeletons, but zero success feedback and `setRolePerm.isPending` is never read. Silence-on-success is indistinguishable from breakage. |
| 2 | Match System / Real World | 3 | "Inherit / Grant / Deny", "Can / Cannot", "Deny always wins" are excellent. The machine key (`orders.delete`) — the string support tickets use — is hidden in a `title`. |
| 3 | User Control and Freedom | 1 | No undo, no confirmation, no apply-step, no audit view. A mis-click on one of 280 cells is silently permanent. |
| 4 | Consistency and Standards | 2 | Internally inconsistent: Roles is grouped + sticky + bounded; People is flat + unsticky + unbounded. Also the only page with no search and no error state. |
| 5 | Error Prevention | 1 | One click grants `policies.manage` — the permission that grants every other permission — to a whole role. Inventory confirms deleting one stock item. |
| 6 | Recognition Rather Than Recall | 2 | `TH_STICKY` is `top-0` only, never `left-0`. Scroll right in the 900px table and the permission name is gone. |
| 7 | Flexibility and Efficiency | 1 | No search, no bulk ops, no column select-all, no "copy role from role". Standing up a new role is 40 clicks. |
| 8 | Aesthetic and Minimalist Design | 2 | >150 cargo-orange checkbox fills flatten hierarchy into a uniform field of maximum salience. |
| 9 | Error Recovery | 1 | "Could not update the role." names neither the role nor the permission. No query error state at all. |
| 10 | Help and Documentation | 3 | Sensitive tooltip, admin lock tooltip, and the "Deny always wins" line are genuinely good contextual help. |
| **Total** | | **18/40** | **Poor band — but see the note: the task completes; the safety and record layer around it is what's missing.** |

## Anti-Patterns Verdict

**Does this look AI-generated? No — and the inverse failure is the interesting one.**

**LLM assessment (A).** Every parent-skill absolute ban passes: no side-stripe borders, no gradient text, no glassmorphism, no hero-metric template, no card grids, no eyebrow-per-section, no numbered markers, no text overflow. The voice is the strongest thing on the page and is fully on-brand.

The tell is inverted: the file is roughly one-third comment, and the comments are load-bearing and numerate — the contrast claims in them compute correctly (Deny at 4.65/4.80 vs the stated "4.7 light, 4.8 dark"). Nobody prompts their way to that. The real smell is **reasoning that outran verification**: the file argues three positions its own code does not hold.

- It articulates the One Voice Rule to keep orange out of the People tab's Grant control — while the sibling tab is a wall of ~150 orange checkboxes.
- It says rendering before data lands "on this screen is a lie rather than a flash" — then omits `rolePerms.isLoading` from that exact guard.
- It calls `THEAD_ROW` "the convention orders and inventory set" — those pages use `bg-muted/40`, not `bg-muted`.

**Deterministic scan (B).** `detect.mjs` returned **exit 0, `[]`, zero findings** on the page and on `checkbox/combobox/tabs`. **This result is vacuous and must not be read as a clean bill of health.** B verified the root cause rather than trusting the exit code:

- `detector/engines/regex/detect-text.mjs:30` — `PAGE_ANALYZER_EXTS` covers `.html/.htm/.astro/.vue/.svelte`. `.tsx` is excluded, so no page analyzers run.
- `:369-375` — for `.tsx` the only extraction is CSS-in-JS (`styled\`` / `css\`` template literals).
- Control test: a temp `.tsx` using `styled.div` fired 3 rules; the semantically identical Tailwind version returned `[]`.
- Control test: a nonexistent file **also exits 0 with `[]`**.

This codebase is 100% Tailwind utilities + `cn()`. **The detector is blind to every visual property on this page.** Correct reading: deterministic scan not applicable.

**Visual overlays.** None. Browser automation unavailable — the Claude Chrome extension is not connected (exact error reported by B). The live-server + injection + overlay flow was skipped because there was nothing to inject into. A second, independent limiter: the route sits behind `<ProtectedRoute>` + Supabase auth, so even a working headless fetch returns only the login shell. **No rendered pixels were observed in this critique.** All visual claims are static reads plus OKLCH→sRGB arithmetic.

## Overall Impression

This page has genuinely good taste and a real hole where its safety layer should be.

The craft is not in question: the voice is the brand executed without a miss, the People tab's live Result column teaches the precedence rule by demonstration, and the colour reasoning was measured rather than eyeballed and holds up under independent recomputation. This is a design system used as a system.

What's missing is everything that makes a *privilege* screen different from a settings form. There is no confirmation, no success feedback, no error state, no undo, and — most damning — no audit read surface, on the one screen in a product whose first principle is "The record is the product." The database already writes `ROLE_PERMISSION_GRANTED` / `USER_PERMISSION_SET` rows on every one of these mutations. The client throws them away. Both agents found zero references anywhere in `src/`.

**The single biggest opportunity: make the record visible and make escalation deliberate.** The data already exists; the read path is nearly free.

## What's Working

**The voice is the brand, executed without a single miss.** "Pick someone to see and change what they can do." · "Deny always wins." · "Admins always have everything. This column can't be changed." The admin empty state explains the model *and* names the next action rather than merely blocking. Plain, direct, unhurried, never chatty, never alarmed — PRODUCT.md's floor-supervisor voice verbatim. This is the hardest thing here to get right and it is the thing most fully right.

**Showing effect, not just cause.** The People tab renders the resolved answer beside the control. `resolveEffectivePermissions` mirrors `has_permission()` in SQL and drives a live `ResultTag` that satisfies the Never-Colour-Alone Rule — word plus dot plus ink weight, and deliberately not green because green means delivered. On a screen where cause and effect genuinely diverge, showing the consequence next to the control is the best decision in the file.

**The lockout hypothesis is refuted at three independent layers, and that deserves credit.** `is_active_admin()` gives an unconditional bypass; `prevent_last_admin_removal()` hard-blocks demoting the last active admin; `policies.manage` is seeded to no role at all. The engineering defended the catastrophic failure properly.

## Priority Issues

### [P0] Sensitive permission writes are unconfirmed *and* unrecorded

**Why it matters.** Mutations fire directly on interaction with no guard — including `policies.manage`, the fixed point of the whole system. Simultaneously, the audit rows those writes generate have no read surface anywhere in `src/`; `audit-log.ts` maps only seven `PACKAGE_*` codes. The comparison that indicts this: inventory makes you confirm deleting **one stock item**. Deleting a widget confirms; granting the keys to the kingdom does not. The Phase 5 migration's own comment names the stakes — "the change you most want a record of, because it is the one an attacker (or a careless admin) makes right before doing something else." The database agrees with the product principle. The UI never asked.

**Fix.** Two parts, both cheap. (1) Gate `permission.is_sensitive` cells through the existing `useConfirm()` — already mounted in `main.tsx` and used by inventory, orders, and directory: *"Give Warehouse the ability to delete orders? 4 people currently have this role."* Non-sensitive cells stay one-click; density is respect. (2) Add a third tab or rail reading `audit_logs where entity_type in ('role_permission','user_permission')`, gated on `orders.audit.view` exactly as the migration's closing comment already specifies. `formatAuditAction`'s fallback already humanises these codes.

**Suggested command:** `/impeccable harden`

### [P0] The Roles grid's primary control is invisible: unchecked checkbox measures 1.24:1

**Why it matters.** Both agents computed this independently and agree. `checkbox.tsx` bounds an unchecked box with `border-input`; `--input` against `--background` is **1.24:1 light / 1.36:1 dark** against a WCAG 1.4.11 requirement of **3:1** for UI component boundaries. The checked fill passes (3.14:1 / 6.74:1) — so the grid reads as orange marks floating on near-invisible boundaries, and the entire state of the tab is "orange squares and blank space." The disabled admin column fares worse: `opacity-50` composites the passing orange down to **1.78:1 / 2.46:1**, so the column that is the page's own explanation of "admins always have everything" is the least visible thing on it. Under PRODUCT.md's own stated condition — a screen under glare, glanced at — an unticked permission is not a control that reads as *off*; it is a control that does not read at all.

This is a shared-primitive bug, which is why it went unnoticed: nobody wrote it on this page. But this page is 280 checkboxes, so this page is where it bites. Fixing `--input` is a global token change and needs care.

**Fix.** Raise `--input` to ≥3:1 against `--background` in both themes (roughly `oklch(0.78 0.008 70)` light; dark's `oklch(1 0 0 / 12%)` is also short), or override the border on this grid. Verify rendered.

**Suggested command:** `/impeccable audit`

### [P1] `rolePerms.isLoading` omitted from the People tab's load gate — every row reads "CANNOT"

**Why it matters.** `loadingTable = !!selected && (overrides.isLoading || catalog.isLoading)` — but `effective` is computed from `rolePerms.data ?? []`. If `rolePerms` is still in flight, `resolveEffectivePermissions(role, [], overrides)` returns an empty set and all 40 rows render "CANNOT". This is the exact failure the adjacent comment declares unacceptable: "rendering early would show every row as Inherit before the real settings land, which on this screen is a lie rather than a flash." Two of the three dependencies were guarded; the third was left out. `RolesGrid` gets it right one tab away. Reachable on a cold load where the user opens People before `useRolePermissions` resolves. The screen states, authoritatively, that a person can do nothing.

**Fix.** Add `|| rolePerms.isLoading`. One line.

**Suggested command:** `/impeccable polish`

### [P1] The cargo-orange checkbox wall violates The One Voice Rule — on the page that argues for it

**Why it matters.** DESIGN.md: cargo orange appears on "no more than ~10% of any screen. Its rarity is what makes it mean 'act here'. A screen where two things are orange is a screen where nothing is." This screen has ~150 orange things and none of them is an action — a permission is a **state**. The self-refutation is total: the People tab reasons at length that orange must stay out of the Grant control because "an orange Grant on 40 rows would cost the accent its meaning," and the sibling tab is that exact mistake at four times the scale. This is also why visual hierarchy fails: the page becomes a uniform field of maximum-salience marks — DESIGN.md's named enemy ("a grey wall where every element has the same weight") wearing hi-vis.

**Fix.** Neutral ink check for this grid — `data-[state=checked]:bg-foreground data-[state=checked]:text-background`, matching the `grant: 'bg-foreground text-background'` stamp the People tab already chose for the identical semantic. Unifies the two tabs' vocabulary, gives the accent back its meaning, and fixes half of P0-b (16.66:1).

**Suggested command:** `/impeccable quieter`

### [P1] No error state on the one page that must never lie

**Why it matters.** Both agents independently found zero `isError` / `refetch` / `Retry` in the file. Kill the network and `loading` goes false, `catalog.data ?? []` maps to nothing, and the page renders a bordered table shell with full headers and an **empty body**. On a permissions screen, "no rows" reads as *"this role has no permissions."* Both neighbours handle this with an identical, copy-pasteable destructive-tinted panel plus a Retry button. Compounding it, B confirmed `refetchOnWindowFocus: false` in the QueryClient — so a stale matrix will not self-correct on refocus, and there is no realtime subscription on `role_permissions`. Two admins editing concurrently is last-write-wins, silently.

**Fix.** Add the `isError` branch both neighbours already ship. Consider a Refresh action in `PageHeader` (this page passes no `actions`), given no realtime and a known concurrency gap.

**Suggested command:** `/impeccable harden`

## Persona Red Flags

**Alex (impatient power user).** Ticks a box that changes what a whole role can do. **Nothing happens** — no toast, no pending state, `isPending` never read. Did it save? He ticks again to check — **and revokes it.** This is the single most likely real-world failure on this page. Below ~1200px the 900px table scrolls horizontally; the header sticks but the first column doesn't, so he's ticking an unlabeled box in an unlabeled row. No bulk anything: standing up a new role is 40 clicks and 40 round-trips. On the People tab his literal task fails on taxonomy, not UI — there is no `customers.export` permission at all; customer egress rides on `customers.read`.

**Sam (screen reader + keyboard, needs 4.5:1).** Credit: `aria-label="Delete orders for Warehouse"` is self-sufficient per cell and better than most permission matrices ship. Failures: she cannot see which boxes are unticked (1.24:1). The hand-rolled `role="radiogroup"` announces "radio group, 1 of 3" but has no arrow-key handler and no roving tabindex — so she Tabs through **120 buttons** to cross the People table, each firing a tooltip that interrupts the SR buffer. WCAG 2.1.1 passes; **4.1.2 does not**, because the announced role promises behaviour that isn't there. The `SectionLabel` group rows are `<span>` in `<td>` — "Orders" announces as a data cell, not a group boundary, so she can't jump between features. `<th>` elements carry no `scope="col"`. And `title={permission.key}` is unreachable by keyboard and invisible on touch — precisely the mechanism that fails the support-ticket use case the comment invokes to justify it.

**Riley (stress tester).** Network failure renders an empty grid that reads as "no permissions" (above). Double-click a cell and two mutations fire with no `mutationKey` serialization and no debounce — `setRolePermission` is upsert-or-delete, so **final DB state depends on network ordering, not click ordering**. Concurrent tabs: last write wins silently, and B **refuted** the hoped-for mitigation — `refetchOnWindowFocus: false`. Stale role: `selected.role` comes from the `['staff']` query, so changing someone's role in another tab silently computes `effective` against the old role. The Combobox renders every staff option unvirtualized.

## Minor Observations

- `ROLES` hand-duplicates the `StaffRole` union and is **not** exhaustiveness-checked — add an eighth role and its column silently never renders.
- `mt-6` on `Tabs` *and* each `TabsContent`, stacking with `PageBody`'s `gap-6` → 48px where every other page relies on the flex gap alone.
- No `eyebrow` and no `actions` on `PageHeader`; all three neighbours pass both.
- `hover:bg-muted/40` where the convention is `hover:bg-accent/40`.
- `py-24` empty states; the codebase uses `py-16` universally, plus a `size-11 rounded-full bg-muted` icon chip this page omits.
- `<table>` omits `text-sm`, which orders and inventory both set.
- 120 Radix Tooltip roots in the People tab for 3 distinct strings.
- `docs/access-control-policy-design.md` is cited by both migrations and linked from nowhere in the UI.
- `permissions.ts` has `orders.export` / `inventory.export` / `sla.export` / `pod.export_bulk` — but **no `customers.export`**, while `customers.read` plus the directory page is a bulk-PII egress path. The catalog may be incomplete against the app's real egress surface.
- `checkbox.tsx` `shadow-xs` and `tabs.tsx` `data-[state=active]:shadow-sm` — legacy shadcn defaults on this page's two dominant primitives; DESIGN.md says never build on them.

## Questions to Consider

1. **How many of those 280 booleans has any human ever deliberately chosen?** The seed chose ~150. The grid shows raw state, so a deliberate decision and a migration default are pixel-identical. Should this screen show a **diff against the seeded default** — "differs from designed default" — rather than raw truth? That turns a wall of checkboxes into a record of decisions, which is what the product actually sells.

2. **Why is `policies.manage` a row in the same grid as `orders.read`?** It is the only permission that can grant every other permission. It gets a 3.5px `ShieldAlert` and is otherwise an identical checkbox. `is_sensitive` is doing the work of a category distinction with the weight of a tooltip.

3. **The two-tab IA is mostly right — but the missing edge is Roles → People.** Standing in the Roles tab about to untick `orders.delete` for Warehouse, nothing tells you that 2 of your 6 warehouse staff carry a `grant` override that will survive your change, or that 1 carries a `deny` that made your tick meaningless all along. `listUserPermissions()` already returns every override in the system — "3 people override this row" is one existing, unused call away.

4. **If the database already guarantees admins can never be locked out, why does the UI treat all 280 cells as equally safe?** The guards protect against the dramatic failure and leave the likely one — a quiet, wrong, one-click change nobody can later attribute — completely open.

5. **Does this page have to meet "a phone under depot glare, one-handed"?** No, and it shouldn't try — policy editing is a rare, seated, deliberate task. The bar it actually misses is a desktop one: the sticky header never sticks `left-0`, so at any viewport under ~1200px the row label leaves the screen before the last role column arrives.
