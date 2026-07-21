# Signals — the third dashboard

**Status:** built. Ships behind `dashboard.signals.view`; the migration applies
via `.github/workflows/db-migrate.yml` on push to `dev`.
**Audience:** depot manager / owner, weekly
**Route:** last tab on `/dashboard`, after Operations and Executive. Operations
stays the landing tab — Signals is a weekly review, not the counter screen.

---

## Why a third dashboard

The two existing tabs answer different questions, and neither answers *"which
numbers should I be looking at?"*

| Tab | Question it answers | Failure mode |
|---|---|---|
| **Operations** | "What is happening right now?" | 14 cards, every number at the same visual weight, no targets. It tells you `Total Packages: 12,431` — a figure that cannot change your behaviour. |
| **Executive** | "How is the business doing?" | Money story for a board audience. Already has traffic lights and deltas — the best thing in the app — but it is a *report*, not a worklist. |
| **Signals** (proposed) | **"What needs me, and what do I do about it?"** | — |

Signals is deliberately the *smallest* of the three. It shows fewer numbers, not
more. Every number on it has a target, a direction, and a sentence saying what to
do when it is off.

### The test every metric here must pass

Ben Yoskovitz's four criteria, applied strictly:

1. **Understandable** — one sentence, no glossary.
2. **Comparative** — always against a prior period or a target. A bare snapshot is banned.
3. **A ratio or rate** — not a whole number. `84 pending` is meaningless; `12% of open orders past SLA` is not.
4. **Behaviour-changing** — *the golden rule.* If the number moving would not
   cause anyone to do anything differently tomorrow, it does not belong here.

Criterion 4 is what excludes most of the Operations tab.

---

## Layer 1 — North Star Metric

### Perfect Order Rate

> Of the orders completed in the period, the share that went through **clean**:
> on time, not returned, and with a proof of delivery on file — measured
> against every order the depot was asked to fulfil, including the ones it never
> managed to record.

```
Perfect Order Rate  =            clean orders
                       ──────────────────────────────────
                       terminal orders + dropped Coupa POs

where "clean" =  never breached an SLA threshold at any status
             AND was not returned
             AND has a POD document on file
```

**The fourth leg — PO accuracy.** The classic supply-chain "perfect order"
includes order-entry accuracy, and this product has an exact analogue: Coupa
emails that never became a Global PO. Each one is work Exxaro issued that the
depot never recorded, sitting in support's inbox waiting to be keyed in by hand.
Counting them **only in the denominator** is what stops the rate from looking
healthy while ingestion silently drops work — the failure mode is invisible by
construction, so the North Star has to be the thing that surfaces it.

The population is *terminal* orders — collected **and** returned. A returned
order has to sit in the denominator or the first-time-right leg measures nothing.

**Why this one.** `PRODUCT.md` states the promise as *"purchase order to signed
POD without losing the thread"*, and defines success as four simultaneous things:
nothing lost or disputed, the console keeps up, the paper trail is gone,
management can see it without asking. Perfect Order Rate is the only single
number that moves when any of those four break. It is customer-centric, it is a
ratio, it is comparable week over week, and it is ruthlessly behaviour-changing:
you cannot improve it without someone changing what they do.

It is also the standard logistics North Star (the classic "perfect order" of
supply-chain measurement), so it benchmarks against the outside world rather than
only against last month.

**Deliberately not chosen:**

- *Revenue* — lagging, and already the Executive tab's job. Revenue tells you
  what happened; it does not tell you what to fix.
- *Total packages delivered* — a volume number. Grows with sales effort, not with
  operational quality. Classic vanity.
- *Average cycle time* — a good metric, but a mean hides the tail. Two days
  average with a 5% catastrophic tail is a worse business than a flat 2.5 days,
  and the mean cannot see the difference. Cycle time belongs one layer down, and
  it should be measured at **p90**, not average.

**Target:** 95%. **Alert:** below 90%, or any week-over-week drop of ≥5 points.

**Display:** the single largest element on the page. Current value, sparkline of
the last 12 weeks, delta vs the previous period, and — critically — a
**contribution breakdown** showing which of the three failure modes cost the most
points this period:

```
Perfect Order Rate   91.2%   ▼ 2.1 pts vs previous 28 days

  Lost to:   late               ████████░░  5.1 pts   ← biggest leak
             no POD on file     ███░░░░░░░  2.4 pts
             returned           ██░░░░░░░░  1.3 pts
             PO never recorded  ░░░░░░░░░░  0.0 pts
```

That breakdown is the entire point of the dashboard. It converts one number into
a ranked list of what to go and fix.

An order can fail several ways at once, so each failed order is attributed to
exactly one cause in a fixed precedence — **returned → late → POD gap** — which
makes the buckets a partition of the failed set. The points therefore sum to
`100 − rate` rather than double-counting past it. Returned outranks late because
a returned order's lateness is moot: the fix is the return cause.

---

## Layer 2 — Input metrics (the levers)

Four levers. Each one is a factor of the North Star, each has a different owner,
and each is independently actionable.

| # | Metric | Definition | Data source | Viz | Target | Alert |
|---|---|---|---|---|---|---|
| 1 | **On-time rate** | % of completed orders that never exceeded `sla_threshold_hours(status)` in any status they passed through. Thresholds today: pending 24h, notified 24h, in_transit 24h, ready_for_collection 72h. | `package_status_history` — consecutive `changed_at` deltas per status, vs `sla_threshold_hours()`. **Requires a new RPC** (see Build notes). | Line, 12 weeks | ≥ 95% | < 90% |
| 2 | **First-time-right rate** | `1 − return rate`. % of orders in the period not ending `returned`. | `get_dashboard_metrics` → `returns.returnedTotal / returns.ordersTotal` (already computed) | Line + worst-location callout | ≥ 98% | < 95%, or 3 consecutive months rising |
| 3 | **POD compliance rate** | % of *completed* orders with a POD document on file. Photo sub-rate measured only over driver deliveries, where a photo is actually possible — it does **not** gate the headline. | `pods` LEFT JOINed to completed orders, so a POD-less order stays in the denominator. Returns excluded: no delivery to evidence. | Rate + photo sub-rate | ≥ 98% POD, ≥ 95% photo | < 95% POD |
| 4 | **Cycle time p90** | 90th-percentile hours, order created → collected. The slowest 10% of orders, not the average. | `package_status_history`. **New** — the app currently computes means only (`avgTotalCycleHours`). | Line, p50 and p90 on one axis | p90 ≤ 72h | p90 > 96h, or p90 ÷ p50 > 3 (a fat tail) |

**A POD counts when the document exists — deliberately.** The first cut also
required `pods.is_locked`. Nothing in the product ever sets that column:
`mark-collected-dialog` inserts `is_locked: false`, and no other write path
touches it. The clause was `AND false` for every order, so POD compliance *and*
Perfect Order Rate both read exactly 0.0% and the leak breakdown blamed POD for
everything. Fixed in `20260721160000`.

That leaves a real finding worth its own ticket: the lock machinery is fully
built — a trigger stamps `locked_at`, RLS policies on `packages` key off locked
PODs, `update-package` refuses to edit one — and **nothing engages it**, so every
POD in the system stays editable forever. For a product whose pitch is "the
record is the product", that is worth deciding on deliberately rather than by
omission.

**Why p90 and not the average.** The existing `avgTotalCycleHours` is on the
Operations tab and reads fine at ~30h. But a courier depot's reputational damage
comes entirely from the tail — the parcel that sat for nine days is the one that
generates the phone call, the dispute, and the lost account. `p90 ÷ p50` as a
ratio is a genuinely new signal: it says *"how consistent are we?"*, which no
current number answers.

---

## Layer 3 — Health metrics (guardrails)

These do not go up. They are floors you must not fall through, and they are
mostly **leading** indicators — they predict tomorrow's North Star, so they earn
their place even though none of them is a headline.

| Metric | Definition | Source | Type | Target | Alert |
|---|---|---|---|---|---|
| **Open SLA breaches** | Live count of open orders past threshold, plus the oldest one's age. | `stuckTotal` + `stuckPackages[0]` | Lagging (already broken) | 0 | ≥ 1 breach older than 2× its threshold |
| **Value at risk** | ZAR value of the orders currently breaching. Money standing still. | `stuckTotal` joined to order value | Lagging | — | > 5% of monthly revenue |
| **Overnight reverts** | Orders a driver still held at the 20:00 cutoff, auto-returned to the dispatch queue. Rolling 7 days. | `package_revert_events` (surfaced today per-driver on Operations) | **Leading** — today's revert is tomorrow's breach | 0 | ≥ 3 in a week, or any single driver ≥ 2 |
| **Coupa ingestion failures** | % of Coupa emails that did not become a Global PO in the last 30 days. Each one is an order Exxaro placed that this system never recorded. | `coupaIngestion.failureRate` | **Leading**, and the most dangerous number in the product — a failure is invisible by construction | 0% | > 2% |
| **Unassigned delivery location** | Open orders with no delivery location set. A routable-data defect, not a place. | `locationDistribution` → `unassigned` bucket | **Leading** | 0 | > 2% of open orders |
| **Stock-outs** | Inventory items at zero that appear on open orders. | `inventoryHealth.outOfStock` ∩ open `package_items` | **Leading** | 0 | ≥ 1 blocking an open order |

The two most valuable rows here are **overnight reverts** and **Coupa ingestion
failures**, because both are leading and both are currently buried. Reverts sit
in a table column on Operations with a tooltip; ingestion failures sit at the
very bottom of the Executive tab. Neither is where someone looks first, and both
predict the North Star a week ahead.

---

## Layer 4 — Business metrics

Kept to four. This is not the Executive tab and should not become it — these
exist only to price the operational story above.

| Metric | Definition | Source | Target | Alert |
|---|---|---|---|---|
| **Realized revenue, MTD** | Value of collected orders, month to date, vs the same point last month. | `kpis` → `month` | Growth | ▼ vs prior month |
| **Revenue per perfect order** | Realized revenue ÷ orders completed clean. Rises when quality rises at constant volume. | Composed | Growth | — |
| **Customer concentration** | Share of realized revenue from the single largest customer. | `concentration.topCustomerShare` | < 35% | ≥ 50% |
| **Forward order book** | Open PO value not yet realized. Demand you have already been promised. | `orderBook.openValue` | — | ▼ 20% MoM |

> **Note on the word "revenue".** There is no `cost_price` anywhere in the schema,
> so nothing on any dashboard is margin or profit. Every money figure in this
> product is gross revenue and must be labelled as such.

---

## Layout

The ordering rule is the feature: **cards sort by distance from target**, worst
first. A metric that is on target sinks. A metric that is off rises to the top
with its "so what" line attached. The page is a worklist that re-ranks itself,
not a fixed grid.

```
┌─────────────────────────────────────────────────────────────────┐
│  ⌗ NEEDS YOU TODAY                                              │
│  ─────────────────────────────────────────────────────────────  │
│  ● On-time rate      88.4%  ▼3.2pts   target 95%                │
│    41 orders late this month, 28 of them stuck in transit.      │
│    → Check driver assignment: 3 drivers, 9 overnight reverts.   │
│                                                                 │
│  ● Coupa ingestion    3.1% failed     target 0%                 │
│    4 POs never reached the system. Sitting in support's inbox.  │
│    → Open the failure list                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   PERFECT ORDER RATE          91.2%    ▼ 2.1 pts vs last month  │
│   ▁▂▃▅▆▇▆▅▃▂▃▄  12 weeks                        target 95%      │
│                                                                 │
│   Lost to:  late ███████ 5.1  ·  no POD ███ 2.4  ·  ret ██ 1.3  │
│                                                                 │
├──────────────┬──────────────┬──────────────┬────────────────────┤
│ On-time      │ First-time   │ POD          │ Cycle time p90     │
│ 88.4%  ▼     │ 97.1%  ▲     │ 98.6%  ▬     │ 81h  ▲             │
│ ▁▃▅▆▅▃▂      │ ▅▅▆▆▇▇▇      │ ▇▇▇▇▇▇▇      │ ▂▃▃▄▅▆▇   p50 26h  │
├──────────────┴──────────────┴──────────────┴────────────────────┤
│  GUARDRAILS                                                     │
│  Breaches 12 · At risk R48k · Reverts 9 · Coupa 3.1% ·          │
│  Unassigned 4 · Stock-outs 1                                    │
├─────────────────────────────────────────────────────────────────┤
│  BUSINESS   Revenue MTD R1.2m ▲ · Per perfect order R980 ·      │
│             Top customer 41% ⚠ · Order book R3.4m               │
├─────────────────────────────────────────────────────────────────┤
│  ⓘ What to stop looking at                    [collapsed]       │
└─────────────────────────────────────────────────────────────────┘
```

### Every signal explains itself

A metric nobody understands is a metric people learn to scroll past, so each one
carries an ⓘ beside its name answering three things in plain English: **what it
counts**, **why it matters**, and **what moves it**. The third is the one that
earns its place — a number with no known lever is decoration.

The copy lives in `SIGNAL_HINTS` in `src/lib/signals.ts`, one row per signal
alongside its target, and a test asserts the two tables have the same keys so a
new signal cannot ship without an explanation. No jargon is assumed: p90 is
"the slowest one in ten", not "the 90th percentile".

It is a popover, not a tooltip — the text runs to three sentences, and the
stated design target is a phone held one-handed in the depot, where a
hover-only tooltip never opens at all.

Visual language stays inside the existing system: `DashboardCard`,
`SectionLabel`, the `HealthLevel` good/watch/risk/neutral tokens already used by
the Executive scorecard, `tabular` numerals, borders not shadows. Per
`PRODUCT.md`, hi-vis marks the action and nothing else — so the only saturated
colour on the page is on the cards that are off target.

---

## The "stop looking at this" panel

A collapsed footer naming the vanity metrics already on screen elsewhere, and
what to read instead. Being explicit about this is most of the value of the
exercise — a dashboard that only adds numbers makes the problem worse.

| Currently shown | Why it's vanity | Read instead |
|---|---|---|
| `Total Packages` | Cumulative, only ever goes up, no action attached. | Orders completed this period, vs last |
| `PODs Signed` | Absolute count. 400 signed is bad if 500 completed. | POD compliance **rate** |
| `Total handled` (driver) | Rewards tenure, not performance. | Completion rate + overnight reverts |
| `Active Drivers` | A roster fact, not a metric. | Packages on road ÷ active driver |
| `Items` (inventory) | Catalogue size. | Stock-outs blocking open orders |
| `Collection rate` (timeline) | Completed ÷ all-time total — drifts toward 100% forever as history accumulates. | On-time rate, windowed |

The last row is worth calling out as a live defect rather than a taste
disagreement: `TimelineSummary` computes `completed / stats.total` over all
history, so the figure structurally rises over time regardless of performance.

---

## Review cadence

| Cadence | What | Who | Where |
|---|---|---|---|
| **Daily** | Guardrails only — breaches, reverts, Coupa failures, stock-outs. Two minutes. | Dispatcher on shift | Signals top band |
| **Weekly** | The four input metrics and their trend. Which lever moved, and why. | Depot manager | Full Signals tab |
| **Monthly** | North Star vs target, contribution breakdown, business layer. | Owner | Signals + Executive |
| **Quarterly** | Recalibrate. Are the targets right? Is Perfect Order Rate still the North Star? Are the SLA thresholds (24/24/24/72h) still what customers were promised? | Owner | This document |

The quarterly review matters more than it sounds. `sla_threshold_hours()` hard-codes
the thresholds that define "on time" — and therefore defines the North Star. If
those numbers are stale, every metric above is measuring the wrong promise.

---

## Alerts

Reuse the existing notifications system (SECURITY DEFINER triggers, in-app bell,
`notify_package_exception`) rather than building a second channel.

| Trigger | Severity | Route | Response |
|---|---|---|---|
| Perfect Order Rate < 90%, or ▼5 pts WoW | High | In-app + weekly email to manager | Review within 2 working days |
| Any single SLA breach > 2× threshold | High | In-app, immediate | Same day |
| ≥ 3 overnight reverts in a week | Medium | In-app, weekly roll-up | Driver conversation that week |
| Coupa failure rate > 2% | High | In-app, immediate | Same day — these are unrecorded orders |
| Stock-out blocking an open order | Medium | In-app, immediate | Same day |
| Top customer share ≥ 50% | Low | Monthly digest | Quarterly review |

Alert thresholds live in one shared module so the card colour and the
notification can never disagree — the same discipline `sla_threshold_hours()`
already applies to SLA.

---

## How it was built

### The RPC

`get_signal_metrics(p_weeks, p_company_id)` — one round trip, all aggregation
server-side, permission-gated on `dashboard.signals.view`, matching the
convention of `get_dashboard_metrics` and `get_coupa_ingestion_report`.

Two things it derives that nothing else in the product had:

1. **True on-time rate** — per terminal order, the dwell in each status is the
   gap between consecutive `package_status_history` rows (the last running to
   the terminal instant), compared against `sla_threshold_hours(status)`. That is
   the same function the SLA card and the CSV export call, so "late" here can
   never drift from "breaching" there.
2. **Cycle-time percentiles** — `percentile_cont(0.5)` and `(0.9)` over
   created → terminal, replacing the mean.

Plus a weekly series for every input metric, so each tile carries a sparkline
and a delta rather than a bare snapshot (criterion 2).

**Window:** `p_weeks` sizes the sparklines only. Every headline is a rolling 28
days against the preceding 28, decided server-side so the two sides of a
comparison are always the same length.

**Company scope:** per-order metrics scope through
`receiver_id → receiver_profiles.company_id`. The Coupa leg and the forward
order book cannot — a failed ingestion has no customer (often the reason it
failed), and `purchase_orders` carries no customer link at all. Both are flagged
unavailable when scoped rather than shown network-wide beside scoped figures.

### Files

```
supabase/migrations/20260721140000_signal_metrics.sql   RPC + permission + index
supabase/migrations/20260721150000_…_pod_scope.sql      POD denominator fix
src/lib/signals.ts                                      targets, bands, ranking
src/lib/signals.test.ts                                 30 tests, 100% coverage
src/lib/api/signals-dashboard.ts                        types + fetch (no React)
src/hooks/use-dashboard.ts                              useSignalsDashboard()
src/pages/dashboard/signals-dashboard.tsx               the view
src/pages/dashboard/index.tsx                           the tab
src/lib/api/permissions.ts, vitest.config.ts            key + coverage allowlist
```

The second migration exists because the first was already applied: Supabase
records migrations by version, so a correction has to ship as its own file with
a full `CREATE OR REPLACE` rather than as an edit. It fixes the POD compliance
denominator, which counted returned orders as POD failures — a return has no
delivery to evidence, and including them let a bad returns month drag down a
figure about drivers capturing signatures, while disagreeing with the Executive
tab's POD card. The North Star was never affected: `clean` and `lost_pod`
already excluded returns.

`src/lib/signals.ts` carries the design: the target table, the alert bands, and
the distance-from-target comparator that orders the page. It is pure, so it sits
on the `vitest.config.ts` coverage allowlist at 100% — the ranking rule is the
product, and it should be tested rather than merely looked at.

### Permission

`dashboard.signals.view`, sensitive (revenue at risk, per-driver figures),
seeded to `manager`. Active admins hold everything unconditionally via
`has_permission()`, so no admin row is needed. The RPC raises `42501` itself
rather than trusting the tab to be hidden.

---

## Open questions

1. **Are 24/24/24/72h the SLA the depot actually promised customers?** Everything
   here inherits them via `sla_threshold_hours()`.
2. **Is 95% the right North Star target,** or should it start at the current
   trailing-12-week actual + 3 points so the first quarter is winnable? Change it
   in `SIGNAL_TARGETS` and the colour, the ordering and the alert all move
   together.
3. **Alerts are specified but not wired.** The table above is the design; nothing
   currently pushes. Wiring it means a scheduled job reading the same RPC and
   raising through `notify_package_exception`, not a second threshold table.
