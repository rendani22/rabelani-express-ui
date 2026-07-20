import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import { Login } from './login'

// Mock the auth boundary; everything else (form, validation, routing) is real.
const { signIn } = vi.hoisted(() => ({ signIn: vi.fn() }))
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ signIn }) }))

const renderLogin = () =>
  renderWithProviders(<Login />, {
    route: '/login',
    routes: [{ path: '/', element: <div>HOME PAGE</div> }],
  })

describe('Login (integration)', () => {
  beforeEach(() => signIn.mockReset())

  it('shows validation errors when submitting an empty form', async () => {
    const user = userEvent.setup()
    renderLogin()
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('Email is required')).toBeInTheDocument()
    expect(screen.getByText('Password is required')).toBeInTheDocument()
    expect(signIn).not.toHaveBeenCalled()
  })

  it('rejects a malformed email before calling the API', async () => {
    const user = userEvent.setup()
    renderLogin()
    await user.type(screen.getByLabelText(/email address/i), 'not-an-email')
    await user.type(screen.getByLabelText('Password'), 'secret1')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('Please enter a valid email address')).toBeInTheDocument()
    expect(signIn).not.toHaveBeenCalled()
  })

  it('signs in and navigates home on success', async () => {
    signIn.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    renderLogin()
    await user.type(screen.getByLabelText(/email address/i), 'ops@rabelani.co.za')
    await user.type(screen.getByLabelText('Password'), 'correct-horse')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('HOME PAGE')).toBeInTheDocument()
    expect(signIn).toHaveBeenCalledWith('ops@rabelani.co.za', 'correct-horse')
  })

  it('surfaces the auth error on failure', async () => {
    signIn.mockResolvedValue({ success: false, error: 'Invalid email or password. Please try again.' })
    const user = userEvent.setup()
    renderLogin()
    await user.type(screen.getByLabelText(/email address/i), 'ops@rabelani.co.za')
    await user.type(screen.getByLabelText('Password'), 'wrong-pass')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('Invalid email or password. Please try again.')).toBeInTheDocument()
    expect(screen.queryByText('HOME PAGE')).not.toBeInTheDocument()
  })

  it('toggles password visibility', async () => {
    const user = userEvent.setup()
    renderLogin()
    const pw = screen.getByLabelText('Password') as HTMLInputElement
    expect(pw.type).toBe('password')
    await user.click(screen.getByRole('button', { name: /show password/i }))
    expect(pw.type).toBe('text')
  })
})
