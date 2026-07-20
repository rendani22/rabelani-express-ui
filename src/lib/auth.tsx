import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { AuthError, Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'

interface AuthResult {
  success: boolean
  error?: string
}

interface AuthContextValue {
  user: User | null
  session: Session | null
  /** true until the initial session check resolves */
  initializing: boolean
  signIn: (email: string, password: string) => Promise<AuthResult>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<AuthResult>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Map Supabase auth errors to friendly copy (ported from the Angular facade). */
function friendlyError(error: AuthError): string {
  switch (error.message) {
    case 'Invalid login credentials':
      return 'Invalid email or password. Please try again.'
    case 'Email not confirmed':
      return 'Please confirm your email address before logging in.'
    case 'User already registered':
      return 'An account with this email already exists.'
    case 'Password should be at least 6 characters':
      return 'Password must be at least 6 characters long.'
    default:
      return error.message || 'An error occurred. Please try again.'
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setInitializing(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      initializing,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        return error ? { success: false, error: friendlyError(error) } : { success: true }
      },
      async signOut() {
        await supabase.auth.signOut()
      },
      async resetPassword(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        })
        return error ? { success: false, error: friendlyError(error) } : { success: true }
      },
    }),
    [session, initializing],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
