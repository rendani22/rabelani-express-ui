import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import type { AppNotification } from '@/lib/api/notifications'
import { NotificationsMenu } from './notifications-menu'

// Mock the data hook; the component wiring (badge, list, actions) is real.
const useNotifications = vi.hoisted(() => vi.fn())
vi.mock('@/hooks/use-notifications', () => ({ useNotifications }))

const navigate = vi.hoisted(() => vi.fn())
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}))

const notif = (over: Partial<AppNotification>): AppNotification => ({
  id: Math.random().toString(36).slice(2),
  type: 'in_transit',
  emoji: '🚚',
  title: 'Package picked up (RBX-1)',
  description: 'A driver has picked up the package.',
  reference: 'RBX-1',
  package_id: 'pkg-1',
  href: '/orders?id=pkg-1',
  read_at: null,
  created_at: new Date().toISOString(),
  ...over,
})

const markRead = { mutate: vi.fn(), isPending: false }
const markAllRead = { mutate: vi.fn(), isPending: false }
const removeAll = { mutate: vi.fn(), isPending: false }

function setup(over: Partial<ReturnType<typeof useNotifications>> = {}) {
  useNotifications.mockReturnValue({
    items: [],
    unreadCount: 0,
    isLoading: false,
    isError: false,
    markRead,
    markAllRead,
    remove: { mutate: vi.fn() },
    removeAll,
    ...over,
  })
}

beforeEach(() => {
  navigate.mockReset()
  markRead.mutate.mockReset()
  markAllRead.mutate.mockReset()
  removeAll.mutate.mockReset()
})

describe('NotificationsMenu (integration)', () => {
  it('hides the badge when there are no unread notifications', () => {
    setup({ unreadCount: 0 })
    renderWithProviders(<NotificationsMenu />)
    expect(screen.getByRole('button', { name: /^Notifications$/i })).toBeInTheDocument()
  })

  it('shows the unread count on the bell (capped at 9+)', () => {
    setup({ unreadCount: 12 })
    renderWithProviders(<NotificationsMenu />)
    expect(screen.getByRole('button', { name: /Notifications \(12 unread\)/i })).toBeInTheDocument()
    expect(screen.getByText('9+')).toBeInTheDocument()
  })

  it('deep-links to the order (by package_id) and marks read on click', async () => {
    const user = userEvent.setup()
    setup({
      unreadCount: 1,
      items: [
        notif({
          id: 'n1',
          description: 'The package for jo@acme.co.za has arrived at the collection point.',
          reference: 'RBX-9',
          package_id: 'pkg-9',
          href: '/orders', // stored without the query — derived from package_id
        }),
      ],
    })
    renderWithProviders(<NotificationsMenu />)

    await user.click(screen.getByRole('button', { name: /Notifications/i }))
    expect(await screen.findByText('RBX-9')).toBeInTheDocument() // waybill mono token
    await user.click(await screen.findByText(/arrived at the collection point/i))

    expect(markRead.mutate).toHaveBeenCalledWith('n1')
    expect(navigate).toHaveBeenCalledWith('/orders?id=pkg-9')
  })

  it('falls back to the stored href for non-order (customer) notifications', async () => {
    const user = userEvent.setup()
    setup({
      unreadCount: 1,
      items: [notif({ id: 'c1', description: 'A new package has been created for you.', href: '/my-packages', package_id: 'pkg-1' })],
    })
    renderWithProviders(<NotificationsMenu />)

    await user.click(screen.getByRole('button', { name: /Notifications/i }))
    await user.click(await screen.findByText(/new package has been created/i))
    expect(navigate).toHaveBeenCalledWith('/my-packages')
  })

  it('clears the whole inbox from the footer', async () => {
    const user = userEvent.setup()
    setup({ unreadCount: 1, items: [notif({}), notif({})] })
    renderWithProviders(<NotificationsMenu />)

    await user.click(screen.getByRole('button', { name: /Notifications/i }))
    await user.click(await screen.findByRole('button', { name: /clear all/i }))
    expect(removeAll.mutate).toHaveBeenCalled()
  })

  it('marks all read from the header action', async () => {
    const user = userEvent.setup()
    setup({ unreadCount: 3, items: [notif({}), notif({}), notif({})] })
    renderWithProviders(<NotificationsMenu />)

    await user.click(screen.getByRole('button', { name: /Notifications/i }))
    await user.click(await screen.findByRole('button', { name: /mark all read/i }))
    expect(markAllRead.mutate).toHaveBeenCalled()
  })

  it('shows the empty state when there is nothing', async () => {
    const user = userEvent.setup()
    setup({ items: [], unreadCount: 0 })
    renderWithProviders(<NotificationsMenu />)
    await user.click(screen.getByRole('button', { name: /Notifications/i }))
    expect(await screen.findByText(/all caught up/i)).toBeInTheDocument()
  })
})
