import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BellRing,
  Boxes,
  Check,
  ClipboardList,
  LayoutDashboard,
  MapPin,
  PackageCheck,
  ScanLine,
  ShieldCheck,
  Signature,
  Truck,
  Users,
} from 'lucide-react'
import { Logo } from '@/components/brand/logo'
import { ModeToggle } from '@/components/mode-toggle'
import { Button } from '@/components/ui/button'
import {
  RouteTimeline,
  SectionLabel,
  StatusStamp,
  TrackingNumber,
  type RouteStop,
} from '@/components/dispatch'
import { PACKAGE_STATUS } from '@/lib/status'
import { cn } from '@/lib/utils'

/*
  Public marketing page for Dispatch (Rabelani Express). It sits outside the
  authenticated shell and is written in plain operator language — what the depot
  gets, not what the code does. It deliberately borrows the product's own signage
  aesthetic (borders over shadows, one hi-vis accent, green kept for "delivered")
  rather than the generic SaaS look the product positions against.
*/

const HERO_STOPS: RouteStop[] = [
  { label: 'Received against PO', detail: 'Depot · Makhado', timestamp: '08:12', state: 'done' },
  { label: 'Assigned to driver', detail: 'S. Nkosi', timestamp: '09:04', state: 'done' },
  { label: 'Out for delivery', detail: 'Polokwane', timestamp: '10:05', state: 'current' },
  { label: 'Signed for', detail: 'Proof of delivery', state: 'upcoming' },
]

/** The promise, stated as outcomes rather than metrics — nothing invented. */
const OUTCOMES = [
  {
    title: 'Nothing gets lost',
    body: 'Every parcel carries an unbroken chain of custody from intake to signature.',
  },
  {
    title: 'Nothing gets disputed',
    body: 'A signed proof of delivery settles the argument with the record, not a phone call.',
  },
  {
    title: 'Nothing runs on the side',
    body: 'One console replaces the spreadsheets, group chats and paper waybills.',
  },
] as const

/** The core capabilities, in the language of the person running the counter. */
const FEATURES = [
  {
    icon: ClipboardList,
    name: 'Purchase orders',
    blurb:
      'Raise orders and receive stock against them, so the parcel is tied to its paperwork from the very first step.',
  },
  {
    icon: Boxes,
    name: 'Live inventory',
    blurb:
      'Know exactly what is on the floor. Stock levels and every movement in and out are tracked as they happen.',
  },
  {
    icon: PackageCheck,
    name: 'Package tracking',
    blurb:
      'Follow each parcel through every status — received, in transit, ready for collection, delivered — at a glance.',
  },
  {
    icon: Truck,
    name: 'Driver dispatch & live map',
    blurb:
      'Assign parcels to drivers and watch the run unfold on a live map. Know who has what and where they are.',
  },
  {
    icon: Signature,
    name: 'Proof of delivery',
    blurb:
      'Capture a signature on the spot and generate a clean PDF proof. Download one, or thousands in a single batch.',
  },
  {
    icon: ScanLine,
    name: 'QR labels',
    blurb:
      'Print scan-ready QR labels for every parcel, so intake and hand-off are a scan instead of a typed reference.',
  },
  {
    icon: BellRing,
    name: 'Exception alerts',
    blurb:
      'Overdue and stuck parcels raise themselves. The right people are notified before a customer has to ask.',
  },
  {
    icon: LayoutDashboard,
    name: 'Dashboards & reporting',
    blurb:
      'See volume, SLA breaches and revenue without asking anyone to build a report. Operations and executive views.',
  },
  {
    icon: MapPin,
    name: 'Customer tracking portal',
    blurb:
      'Your customers check their own parcel and pull their own proof — fewer "where is it?" calls to the counter.',
  },
  {
    icon: ShieldCheck,
    name: 'Roles & access control',
    blurb:
      'The right people see the right screens. Fine-grained permissions keep the console tidy and the data safe.',
  },
  {
    icon: Users,
    name: 'Customer & staff records',
    blurb:
      'Customers, users, delivery locations and email templates live beside the work they belong to — one directory.',
  },
  {
    icon: PackageCheck,
    name: 'Full audit trail',
    blurb:
      'Every status change is stamped with who, what and when. The record is the product, and it never gets thinner.',
  },
] as const

/** Purchase order to signed POD, as a five-stop line. */
const PIPELINE = [
  { step: 'Order', body: 'Raise a purchase order and receive stock against it.' },
  { step: 'Intake', body: 'Book the parcel in, print its QR label, put it on the floor.' },
  { step: 'Dispatch', body: 'Assign a driver and send it out on the run.' },
  { step: 'Deliver', body: 'Track it live to the door or the collection point.' },
  { step: 'Prove', body: 'Capture the signature and file the proof of delivery.' },
] as const

interface Tier {
  name: string
  tagline: string
  monthly: number | null
  highlight?: boolean
  cta: string
  features: string[]
}

const TIERS: Tier[] = [
  {
    name: 'Depot',
    tagline: 'A single depot getting the paper trail under control.',
    monthly: 1499,
    cta: 'Start with Depot',
    features: [
      'Package tracking & full audit trail',
      'Purchase orders & live inventory',
      'Proof of delivery with PDF export',
      'QR labels',
      'Up to 5 users',
    ],
  },
  {
    name: 'Fleet',
    tagline: 'A depot running drivers and answering to customers.',
    monthly: 3499,
    highlight: true,
    cta: 'Choose Fleet',
    features: [
      'Everything in Depot',
      'Driver dispatch & live map',
      'Operations & executive dashboards',
      'Customer tracking portal & emails',
      'Exception alerts (overdue / stuck)',
      'Up to 25 users',
    ],
  },
  {
    name: 'Enterprise',
    tagline: 'Multiple depots that need one system of record.',
    monthly: null,
    cta: 'Talk to us',
    features: [
      'Everything in Fleet',
      'Multiple depots & unlimited users',
      'Roles & granular access control',
      'Bulk POD downloads & data export',
      'SLA & priority support',
    ],
  },
]

const FAQS = [
  {
    q: 'How long does it take to get running?',
    a: 'Most depots are booking parcels the same week. There is nothing to install — Dispatch runs in the browser, on the desk and on a phone on the floor.',
  },
  {
    q: 'Will it work on a phone in the depot?',
    a: 'Yes. Every screen is built to be read one-handed under depot glare and stays fast under real volume. The counter and the floor use the same console.',
  },
  {
    q: 'Can our customers track their own parcels?',
    a: 'On Fleet and Enterprise, customers get a tracking portal and transactional emails, so they check the parcel and pull the proof themselves.',
  },
  {
    q: 'What happens to our existing records?',
    a: 'Dispatch is designed to be the single place the work lives. We help you bring your customers, locations and open parcels across so nothing runs on the side.',
  },
] as const

function priceLabel(tier: Tier, annual: boolean): { amount: string; note: string } {
  if (tier.monthly === null) return { amount: 'Custom', note: 'Tailored to your depots' }
  const perMonth = annual ? Math.round((tier.monthly * 10) / 12 / 10) * 10 : tier.monthly
  return {
    amount: `R${perMonth.toLocaleString('en-ZA')}`,
    note: annual ? 'per month, billed annually' : 'per month',
  }
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      {children}
    </a>
  )
}

export function Welcome() {
  const [annual, setAnnual] = useState(true)

  return (
    <div className="min-h-svh bg-background text-foreground">
      {/* ── top bar ── */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Logo variant="inline" />
          <nav className="hidden items-center gap-7 md:flex">
            <NavLink href="#features">Features</NavLink>
            <NavLink href="#how">How it works</NavLink>
            <NavLink href="#pricing">Pricing</NavLink>
            <NavLink href="#faq">FAQ</NavLink>
          </nav>
          <div className="flex items-center gap-1.5">
            <ModeToggle />
            <Button asChild size="sm">
              <Link to="/login">Sign in</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* ── hero ── */}
        <section className="relative overflow-hidden border-b">
          {/* sodium-amber glow + faint route grid, the product's own atmosphere */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-70 dark:opacity-100"
            style={{
              background:
                'radial-gradient(110% 70% at 88% -10%, oklch(0.665 0.185 47 / 0.14), transparent 55%), radial-gradient(80% 60% at -5% 110%, oklch(0.55 0.14 245 / 0.10), transparent 50%)',
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.5] dark:opacity-[0.35]"
            style={{
              backgroundImage:
                'linear-gradient(to right, oklch(0.5 0.02 250 / 0.05) 1px, transparent 1px), linear-gradient(to bottom, oklch(0.5 0.02 250 / 0.05) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
              maskImage: 'radial-gradient(80% 80% at 50% 0%, black, transparent 85%)',
            }}
          />

          <div className="relative mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-28">
            <div className="flex flex-col items-start gap-6">
              <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1">
                <span className="size-1.5 rounded-full bg-primary" aria-hidden />
                <SectionLabel>Courier depot, one console</SectionLabel>
              </span>
              <h1 className="text-balance text-[2.6rem] font-semibold leading-[1.02] tracking-tight sm:text-[3.4rem]">
                Purchase order to signed proof of&nbsp;delivery, in one place.
              </h1>
              <p className="max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
                Dispatch runs your depot end to end — orders, stock, parcels, drivers and
                proof — so nothing gets lost, nothing gets disputed, and nothing quietly
                lives in a spreadsheet on the side.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link to="/login">
                    Sign in to the console
                    <ArrowRight />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <a href="#features">See what it does</a>
                </Button>
              </div>
            </div>

            {/* live-feeling manifest card, echoing the sign-in screen */}
            <div className="lg:justify-self-end">
              <div className="w-full max-w-md rounded-xl border bg-card/80 p-6 backdrop-blur">
                <div className="mb-5 flex items-center justify-between">
                  <TrackingNumber value="RBX-2K4H-8801" />
                  <StatusStamp status={PACKAGE_STATUS.IN_TRANSIT} />
                </div>
                <RouteTimeline stops={HERO_STOPS} />
                <div className="tear-line my-5" />
                <div className="flex items-center justify-between">
                  <SectionLabel>Proof of delivery</SectionLabel>
                  <StatusStamp status={PACKAGE_STATUS.DELIVERED} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── outcomes ── */}
        <section className="border-b">
          <div className="mx-auto grid max-w-6xl gap-px overflow-hidden px-6 py-16 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-border">
            {OUTCOMES.map((o) => (
              <div key={o.title} className="flex flex-col gap-2 px-0 py-4 sm:px-8 sm:py-2">
                <h3 className="text-lg font-semibold tracking-tight">{o.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{o.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── features ── */}
        <section id="features" className="scroll-mt-20 border-b">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="mb-12 flex max-w-2xl flex-col gap-3">
              <SectionLabel>Everything the depot needs</SectionLabel>
              <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                One system for the whole delivery lifecycle
              </h2>
              <p className="text-pretty text-muted-foreground">
                Each part earns its place by making the parcel harder to lose and the proof
                harder to dispute. No feature exists to fill a grid.
              </p>
            </div>

            <div className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.name} className="flex flex-col gap-3 bg-card p-6">
                  <div className="flex size-9 items-center justify-center rounded-md border bg-background text-primary">
                    <f.icon className="size-[18px]" />
                  </div>
                  <h3 className="text-base font-semibold tracking-tight">{f.name}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{f.blurb}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── how it works ── */}
        <section id="how" className="scroll-mt-20 border-b bg-muted/30">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="mb-12 flex max-w-2xl flex-col gap-3">
              <SectionLabel>How it works</SectionLabel>
              <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                One unbroken thread, from order to proof
              </h2>
              <p className="text-pretty text-muted-foreground">
                The parcel never leaves the system between stages. Wherever it is, a glance
                tells you who has it and what happens next.
              </p>
            </div>

            <ol className="grid gap-6 md:grid-cols-5">
              {PIPELINE.map((stage, i) => (
                <li key={stage.step} className="relative flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span className="mono flex size-8 items-center justify-center rounded-md border bg-card text-sm font-semibold text-primary">
                      {i + 1}
                    </span>
                    {i < PIPELINE.length - 1 && (
                      <span aria-hidden className="hidden h-px flex-1 bg-border md:block" />
                    )}
                  </div>
                  <h3 className="text-base font-semibold tracking-tight">{stage.step}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{stage.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── pricing ── */}
        <section id="pricing" className="scroll-mt-20 border-b">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="mb-10 flex flex-col items-center gap-3 text-center">
              <SectionLabel>Pricing</SectionLabel>
              <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                Priced per depot, not per parcel
              </h2>
              <p className="max-w-xl text-pretty text-muted-foreground">
                Move all the volume you like. Every plan includes the full audit trail and
                proof of delivery — the parts you can&apos;t afford to run without.
              </p>

              {/* billing toggle */}
              <div className="mt-2 inline-flex items-center rounded-lg border bg-card p-1">
                <button
                  type="button"
                  onClick={() => setAnnual(false)}
                  className={cn(
                    'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                    !annual
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setAnnual(true)}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                    annual
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Annual
                  <span
                    className={cn(
                      'rounded-[3px] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]',
                      annual
                        ? 'bg-primary-foreground/15 text-primary-foreground'
                        : 'bg-success/15 text-success',
                    )}
                  >
                    2 months free
                  </span>
                </button>
              </div>
            </div>

            <div className="grid items-start gap-6 lg:grid-cols-3">
              {TIERS.map((tier) => {
                const price = priceLabel(tier, annual)
                return (
                  <div
                    key={tier.name}
                    className={cn(
                      'flex h-full flex-col gap-6 rounded-xl border bg-card p-7',
                      tier.highlight && 'border-primary ring-1 ring-primary',
                    )}
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold tracking-tight">{tier.name}</h3>
                        {tier.highlight && (
                          <span className="rounded-[3px] border border-primary/40 bg-primary/12 px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.09em] text-primary">
                            Most popular
                          </span>
                        )}
                      </div>
                      <p className="min-h-[2.5rem] text-sm text-muted-foreground">
                        {tier.tagline}
                      </p>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="tabular text-4xl font-semibold tracking-tight">
                        {price.amount}
                      </span>
                      <span className="text-xs text-muted-foreground">{price.note}</span>
                    </div>

                    <Button
                      asChild
                      size="lg"
                      variant={tier.highlight ? 'default' : 'outline'}
                      className="w-full"
                    >
                      <Link to="/login">{tier.cta}</Link>
                    </Button>

                    <ul className="flex flex-col gap-3 border-t pt-6">
                      {tier.features.map((feat) => (
                        <li key={feat} className="flex items-start gap-2.5 text-sm">
                          <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                          <span className="text-foreground/90">{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
            <p className="mt-8 text-center text-xs text-muted-foreground">
              Prices in ZAR, excl. VAT. Every plan starts with a no-obligation walkthrough of
              your operation.
            </p>
          </div>
        </section>

        {/* ── faq ── */}
        <section id="faq" className="scroll-mt-20 border-b bg-muted/30">
          <div className="mx-auto max-w-4xl px-6 py-20">
            <div className="mb-12 flex flex-col gap-3 text-center">
              <SectionLabel>Questions</SectionLabel>
              <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                Straight answers
              </h2>
            </div>
            <dl className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2">
              {FAQS.map((item) => (
                <div key={item.q} className="flex flex-col gap-2 bg-card p-6">
                  <dt className="text-base font-semibold tracking-tight">{item.q}</dt>
                  <dd className="text-sm leading-relaxed text-muted-foreground">{item.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ── closing CTA ── */}
        <section className="border-b">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="relative overflow-hidden rounded-2xl border bg-card p-10 sm:p-14">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-80"
                style={{
                  background:
                    'radial-gradient(90% 120% at 100% 0%, oklch(0.665 0.185 47 / 0.12), transparent 60%)',
                }}
              />
              <div className="relative flex flex-col items-start gap-6">
                <h2 className="max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                  Get every parcel accounted for.
                </h2>
                <p className="max-w-xl text-pretty text-muted-foreground">
                  Bring the whole depot into one console — and settle the next dispute with
                  the record instead of an argument.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button asChild size="lg">
                    <Link to="/login">
                      Sign in to the console
                      <ArrowRight />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline">
                    <a href="#pricing">See pricing</a>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── footer ── */}
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-6 py-10 sm:flex-row">
          <Logo variant="inline" />
          <nav className="flex items-center gap-6">
            <NavLink href="#features">Features</NavLink>
            <NavLink href="#pricing">Pricing</NavLink>
            <NavLink href="#faq">FAQ</NavLink>
            <Link
              to="/login"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign in
            </Link>
          </nav>
          <p className="text-xs text-muted-foreground">
            Rabelani Express · Logistics Solutions
          </p>
        </div>
      </footer>
    </div>
  )
}
