import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, Loader2 } from 'lucide-react'
import type { EmailOtpType } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { Logo } from '@/components/brand/logo'
import { ModeToggle } from '@/components/mode-toggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Landing for the customer invite link. The link routes through Supabase and
 * lands here to establish a session, after which the user sets a password.
 *
 * Two link formats are handled:
 *  - implicit tokens in the URL hash → supabase-js auto-establishes the session
 *    (detectSessionInUrl), surfaced via useAuth().session.
 *  - a `token_hash` + `type` query (email-OTP style links) → verifyOtp() here,
 *    which supabase-js does NOT auto-process.
 * Any `error_description` from Supabase (e.g. an expired link) is surfaced.
 */
export function AcceptInvite() {
  const { session, initializing } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(true)
  const [linkError, setLinkError] = useState<string | null>(null)

  useEffect(() => {
    const url = new URL(window.location.href)
    const q = url.searchParams
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''))

    const errDesc = q.get('error_description') || hash.get('error_description')
    if (errDesc) {
      setLinkError(errDesc.replace(/\+/g, ' '))
      setVerifying(false)
      return
    }

    const tokenHash = q.get('token_hash')
    const type = q.get('type') as EmailOtpType | null
    if (tokenHash && type) {
      // Email-OTP style link — exchange it for a session (not auto-handled).
      supabase.auth
        .verifyOtp({ token_hash: tokenHash, type })
        .then(({ error: otpError }) => {
          if (otpError) setLinkError(otpError.message)
        })
        .finally(() => setVerifying(false))
      return
    }

    // Implicit-token links are handled by detectSessionInUrl → useAuth session.
    setVerifying(false)
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) return setError('Password must be at least 6 characters')
    if (password !== confirm) return setError('Passwords do not match')
    setError(null)
    setSubmitting(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (updateError) return setError(updateError.message)
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
          {initializing || verifying ? (
            <div className="flex justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : !session ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <AlertCircle className="size-6 text-destructive" />
              <div className="flex flex-col gap-1.5">
                <h1 className="text-xl font-semibold tracking-tight">Invite link invalid</h1>
                <p className="text-sm text-muted-foreground">
                  {linkError ?? 'This link is invalid or has expired. Ask your administrator to re-send your invite.'}
                </p>
              </div>
              <Link to="/login" className="text-sm font-medium underline-offset-4 hover:underline">
                Go to sign in
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-8 flex flex-col gap-1.5">
                <h1 className="text-[2rem] font-semibold leading-none tracking-tight">Set your password</h1>
                <p className="text-sm text-muted-foreground">Choose a password to finish setting up your account.</p>
              </div>

              {error && (
                <div role="alert" className="mb-5 flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="password">New password</Label>
                  <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="confirm">Confirm password</Label>
                  <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                </div>
                <Button type="submit" size="lg" disabled={submitting} className="mt-1">
                  {submitting && <Loader2 className="animate-spin" />}
                  {submitting ? 'Saving…' : 'Set password & continue'}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
