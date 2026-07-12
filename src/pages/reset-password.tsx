import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowLeft, Loader2, MailCheck } from 'lucide-react'
import type { EmailOtpType } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { Logo } from '@/components/brand/logo'
import { ModeToggle } from '@/components/mode-toggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Password reset — a single public page serving both halves of the flow:
 *
 *  1. "request" — the default when reached from the login "Forgot password?"
 *     link. The user enters their email and we send a recovery link
 *     (auth.resetPassword → Supabase resetPasswordForEmail, redirecting back
 *     here).
 *  2. "set" — reached by clicking the emailed recovery link, which carries
 *     recovery tokens. Supabase establishes a (recovery) session and the user
 *     chooses a new password via updateUser().
 *
 * Link handling mirrors accept-invite: implicit tokens in the URL hash are
 * auto-processed by supabase-js (detectSessionInUrl); `token_hash` + `type`
 * links are exchanged here with verifyOtp(). Any Supabase `error_description`
 * (e.g. an expired link) is surfaced.
 */
export function ResetPassword() {
  const { session, initializing, resetPassword } = useAuth()
  const navigate = useNavigate()

  // Which half of the flow we're in. `checking` covers URL parsing / OTP verify.
  const [mode, setMode] = useState<'request' | 'set'>('request')
  const [checking, setChecking] = useState(true)
  const [linkError, setLinkError] = useState<string | null>(null)

  // request-mode state
  const [email, setEmail] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)

  // set-mode state
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [setError, setSetError] = useState<string | null>(null)

  useEffect(() => {
    const url = new URL(window.location.href)
    const q = url.searchParams
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''))

    const errDesc = q.get('error_description') || hash.get('error_description')
    if (errDesc) {
      setLinkError(errDesc.replace(/\+/g, ' '))
      setMode('set')
      setChecking(false)
      return
    }

    const tokenHash = q.get('token_hash')
    const type = (q.get('type') || hash.get('type')) as EmailOtpType | null

    if (tokenHash && type) {
      // Email-OTP style recovery link — exchange it for a session.
      setMode('set')
      supabase.auth
        .verifyOtp({ token_hash: tokenHash, type })
        .then(({ error }) => {
          if (error) setLinkError(error.message)
        })
        .finally(() => setChecking(false))
      return
    }

    if (type === 'recovery' || hash.get('access_token')) {
      // Implicit recovery link — detectSessionInUrl establishes the session.
      setMode('set')
      setChecking(false)
      return
    }

    // No recovery indicators → the user is here to request a reset email.
    setMode('request')
    setChecking(false)
  }, [])

  const emailError = emailTouched && !EMAIL_RE.test(email) ? 'Please enter a valid email address' : null

  async function onRequest(e: React.FormEvent) {
    e.preventDefault()
    setEmailTouched(true)
    if (!EMAIL_RE.test(email)) return
    setRequestError(null)
    setSending(true)
    const result = await resetPassword(email)
    setSending(false)
    if (result.success) setSent(true)
    else setRequestError(result.error ?? 'Could not send the reset email. Please try again.')
  }

  async function onSetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) return setSetError('Password must be at least 6 characters')
    if (password !== confirm) return setSetError('Passwords do not match')
    setSetError(null)
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (error) return setSetError(error.message)
    // Recovery session is now a full session — land on "/" and let HomeRedirect route.
    navigate('/', { replace: true })
  }

  return (
    <main className="flex min-h-svh flex-col px-6 py-8 sm:px-10">
      <header className="flex items-center justify-between">
        <Logo />
        <ModeToggle />
      </header>

      <div className="flex flex-1 items-center justify-center py-10">
        <div className="w-full max-w-sm">
          {checking || (mode === 'set' && initializing) ? (
            <div className="flex justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : mode === 'set' ? (
            !session ? (
              <div className="flex flex-col items-center gap-4 text-center">
                <AlertCircle className="size-6 text-destructive" />
                <div className="flex flex-col gap-1.5">
                  <h1 className="text-xl font-semibold tracking-tight">Reset link invalid</h1>
                  <p className="text-sm text-muted-foreground">
                    {linkError ?? 'This link is invalid or has expired. Request a new reset link below.'}
                  </p>
                </div>
                <Link to="/reset-password" className="text-sm font-medium underline-offset-4 hover:underline">
                  Request a new link
                </Link>
              </div>
            ) : (
              <>
                <div className="mb-8 flex flex-col gap-1.5">
                  <h1 className="text-[2rem] font-semibold leading-none tracking-tight">Set a new password</h1>
                  <p className="text-sm text-muted-foreground">Choose a new password for your account.</p>
                </div>

                {setError && (
                  <div role="alert" className="mb-5 flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    <span>{setError}</span>
                  </div>
                )}

                <form onSubmit={onSetPassword} noValidate className="flex flex-col gap-5">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="password">New password</Label>
                    <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="confirm">Confirm password</Label>
                    <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                  </div>
                  <Button type="submit" size="lg" disabled={saving} className="mt-1">
                    {saving && <Loader2 className="animate-spin" />}
                    {saving ? 'Saving…' : 'Set password & continue'}
                  </Button>
                </form>
              </>
            )
          ) : sent ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <MailCheck className="size-6 text-primary" />
              <div className="flex flex-col gap-1.5">
                <h1 className="text-xl font-semibold tracking-tight">Check your email</h1>
                <p className="text-sm text-muted-foreground">
                  If an account exists for <span className="font-medium text-foreground">{email}</span>, we&apos;ve sent a link to reset your password. It may take a minute to arrive.
                </p>
              </div>
              <Link to="/login" className="inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline">
                <ArrowLeft className="size-4" /> Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-8 flex flex-col gap-1.5">
                <h1 className="text-[2rem] font-semibold leading-none tracking-tight">Reset password</h1>
                <p className="text-sm text-muted-foreground">
                  Enter your email and we&apos;ll send you a link to reset your password.
                </p>
              </div>

              {requestError && (
                <div role="alert" className="mb-5 flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{requestError}</span>
                </div>
              )}

              <form onSubmit={onRequest} noValidate className="flex flex-col gap-5">
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
                    onBlur={() => setEmailTouched(true)}
                  />
                  {emailError && (
                    <p className="text-xs text-destructive" role="alert">
                      {emailError}
                    </p>
                  )}
                </div>
                <Button type="submit" size="lg" disabled={sending} className="mt-1">
                  {sending && <Loader2 className="animate-spin" />}
                  {sending ? 'Sending…' : 'Send reset link'}
                </Button>
              </form>

              <p className="mt-8 text-center">
                <Link to="/login" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                  <ArrowLeft className="size-4" /> Back to sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
