import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import { ResetPassword } from './reset-password'

// Mutable auth + supabase boundaries, swapped per test.
const auth = vi.hoisted(() => ({
  current: { session: null as unknown, initializing: false, resetPassword: vi.fn() },
}))
vi.mock('@/lib/auth', () => ({ useAuth: () => auth.current }))

const supa = vi.hoisted(() => ({ auth: { updateUser: vi.fn(), verifyOtp: vi.fn() } }))
vi.mock('@/lib/supabase', () => ({ supabase: supa }))

/** Point the jsdom URL at a recovery link (the page reads window.location). */
function setUrl(path: string) {
  window.history.replaceState(null, '', path)
}

const renderReset = (route = '/reset-password') =>
  renderWithProviders(<ResetPassword />, { route, routes: [{ path: '/', element: <div>HOME PAGE</div> }] })

beforeEach(() => {
  auth.current = { session: null, initializing: false, resetPassword: vi.fn() }
  supa.auth.updateUser.mockReset()
  supa.auth.verifyOtp.mockReset()
  setUrl('/reset-password')
})
afterEach(() => setUrl('/'))

describe('ResetPassword — request mode (integration)', () => {
  it('sends a reset link and shows the confirmation screen', async () => {
    auth.current.resetPassword = vi.fn().mockResolvedValue({ success: true })
    const user = userEvent.setup()
    renderReset()

    expect(await screen.findByRole('heading', { name: /reset password/i })).toBeInTheDocument()
    await user.type(screen.getByLabelText(/email address/i), 'buyer@acme.co.za')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    expect(await screen.findByRole('heading', { name: /check your email/i })).toBeInTheDocument()
    expect(auth.current.resetPassword).toHaveBeenCalledWith('buyer@acme.co.za')
  })

  it('validates the email before sending', async () => {
    auth.current.resetPassword = vi.fn()
    const user = userEvent.setup()
    renderReset()
    await user.type(await screen.findByLabelText(/email address/i), 'oops')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    expect(await screen.findByText('Please enter a valid email address')).toBeInTheDocument()
    expect(auth.current.resetPassword).not.toHaveBeenCalled()
  })

  it('surfaces a send failure', async () => {
    auth.current.resetPassword = vi.fn().mockResolvedValue({ success: false, error: 'Rate limited. Try later.' })
    const user = userEvent.setup()
    renderReset()
    await user.type(await screen.findByLabelText(/email address/i), 'buyer@acme.co.za')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    expect(await screen.findByText('Rate limited. Try later.')).toBeInTheDocument()
  })
})

describe('ResetPassword — set mode (integration)', () => {
  it('sets a new password from a recovery link and navigates home', async () => {
    setUrl('/reset-password?type=recovery')
    auth.current = { session: { user: { id: 'u1' } }, initializing: false, resetPassword: vi.fn() }
    supa.auth.updateUser.mockResolvedValue({ error: null })
    const user = userEvent.setup()
    renderReset()

    expect(await screen.findByRole('heading', { name: /set a new password/i })).toBeInTheDocument()
    await user.type(screen.getByLabelText('New password'), 'brand-new-1')
    await user.type(screen.getByLabelText('Confirm password'), 'brand-new-1')
    await user.click(screen.getByRole('button', { name: /set password & continue/i }))

    expect(await screen.findByText('HOME PAGE')).toBeInTheDocument()
    expect(supa.auth.updateUser).toHaveBeenCalledWith({ password: 'brand-new-1' })
  })

  it('blocks mismatched passwords', async () => {
    setUrl('/reset-password?type=recovery')
    auth.current = { session: { user: { id: 'u1' } }, initializing: false, resetPassword: vi.fn() }
    const user = userEvent.setup()
    renderReset()

    await user.type(await screen.findByLabelText('New password'), 'brand-new-1')
    await user.type(screen.getByLabelText('Confirm password'), 'different-2')
    await user.click(screen.getByRole('button', { name: /set password & continue/i }))

    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument()
    expect(supa.auth.updateUser).not.toHaveBeenCalled()
  })

  it('exchanges a token_hash recovery link via verifyOtp', async () => {
    setUrl('/reset-password?token_hash=abc123&type=recovery')
    auth.current = { session: { user: { id: 'u1' } }, initializing: false, resetPassword: vi.fn() }
    supa.auth.verifyOtp.mockResolvedValue({ error: null })
    renderReset()

    expect(await screen.findByRole('heading', { name: /set a new password/i })).toBeInTheDocument()
    expect(supa.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc123', type: 'recovery' })
  })

  it('shows an invalid-link message for an expired link', async () => {
    setUrl('/reset-password?error_description=Link+has+expired')
    auth.current = { session: null, initializing: false, resetPassword: vi.fn() }
    renderReset()

    expect(await screen.findByRole('heading', { name: /reset link invalid/i })).toBeInTheDocument()
    expect(screen.getByText('Link has expired')).toBeInTheDocument()
  })
})
