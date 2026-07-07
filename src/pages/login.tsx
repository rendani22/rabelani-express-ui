import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { Logo } from '@/components/brand/logo'
import { ModeToggle } from '@/components/mode-toggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RouteTimeline, StatusStamp, TrackingNumber, type RouteStop } from '@/components/dispatch'
import { PACKAGE_STATUS } from '@/lib/status'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(field: 'email' | 'password', value: string): string | null {
  if (field === 'email') {
    if (!value) return 'Email is required'
    if (!EMAIL_RE.test(value)) return 'Please enter a valid email address'
  } else {
    if (!value) return 'Password is required'
    if (value.length < 6) return 'Password must be at least 6 characters'
  }
  return null
}

const PANEL_STOPS: RouteStop[] = [
  { label: 'Collected at depot', detail: 'Makhado', timestamp: '08:12', state: 'done' },
  { label: 'On the road', detail: 'Driver S. Nkosi', timestamp: '09:40', state: 'done' },
  { label: 'Out for delivery', detail: 'Polokwane', timestamp: '10:05', state: 'current' },
]

export function Login() {
  const navigate = useNavigate()
  const { signIn } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({})
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const emailError = touched.email ? validate('email', email) : null
  const passwordError = touched.password ? validate('password', password) : null

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setTouched({ email: true, password: true })
    if (validate('email', email) || validate('password', password)) return

    setAuthError(null)
    setSubmitting(true)
    const result = await signIn(email, password)
    setSubmitting(false)

    // Land on "/" and let HomeRedirect route by principal (staff vs customer).
    if (result.success) navigate('/', { replace: true })
    else setAuthError(result.error ?? 'Login failed. Please try again.')
  }

  return (
    <main className="grid min-h-svh lg:grid-cols-[1.05fr_1fr]">
      {/* ── form side ── */}
      <div className="relative flex flex-col px-6 py-8 sm:px-10">
        <header className="flex items-center justify-between">
          <Logo />
          <ModeToggle />
        </header>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">
            <div className="mb-8 flex flex-col gap-1.5">
              <h1 className="text-[2rem] font-semibold leading-none tracking-tight">
                Welcome back
              </h1>
              <p className="text-sm text-muted-foreground">
                Sign in to the dispatch console to continue.
              </p>
            </div>

            {authError && (
              <div
                role="alert"
                className="mb-5 flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  aria-invalid={!!emailError}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                />
                {emailError && (
                  <p className="text-xs text-destructive" role="alert">
                    {emailError}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    to="/reset-password"
                    className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    aria-invalid={!!passwordError}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {passwordError && (
                  <p className="text-xs text-destructive" role="alert">
                    {passwordError}
                  </p>
                )}
              </div>

              <Button type="submit" size="lg" disabled={submitting} className="mt-1">
                {submitting && <Loader2 className="animate-spin" />}
                {submitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>

            <p className="mt-8 text-center text-xs text-muted-foreground">
              Don&apos;t have an account? Request access from your administrator.
            </p>
          </div>
        </div>
      </div>

      {/* ── brand / atmosphere side (always depot-night) ── */}
      <aside className="dark relative hidden overflow-hidden bg-background lg:block">
        {/* sodium-amber glow + faint route grid */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.9]"
          style={{
            background:
              'radial-gradient(120% 80% at 85% 0%, oklch(0.7 0.19 48 / 0.18), transparent 55%), radial-gradient(90% 70% at 0% 100%, oklch(0.55 0.14 245 / 0.12), transparent 50%)',
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage:
              'linear-gradient(to right, oklch(1 0 0 / 0.04) 1px, transparent 1px), linear-gradient(to bottom, oklch(1 0 0 / 0.04) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        <div className="relative flex h-full flex-col justify-between p-12 text-foreground">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Dispatch console
            </span>
          </div>

          <div className="flex max-w-md flex-col gap-8">
            <h2 className="text-[2.75rem] font-semibold leading-[1.03] tracking-tight text-balance">
              Every parcel, accounted for.
            </h2>

            {/* live-feeling manifest card */}
            <div className="rounded-xl border bg-card/70 p-5 backdrop-blur">
              <div className="mb-4 flex items-center justify-between">
                <TrackingNumber value="RBX-2K4H-8801" />
                <StatusStamp status={PACKAGE_STATUS.IN_TRANSIT} />
              </div>
              <RouteTimeline stops={PANEL_STOPS} />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Rabelani Express · Logistics Solutions
          </p>
        </div>
      </aside>
    </main>
  )
}
