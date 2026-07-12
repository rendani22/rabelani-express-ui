import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import type { CustomerPackage } from '@/lib/api/customer-packages'
import { MyPackagesPage } from './my-packages'

const useMyPackages = vi.hoisted(() => vi.fn())
vi.mock('@/hooks/use-my-packages', () => ({ useMyPackages }))

const useCurrentPrincipal = vi.hoisted(() => vi.fn())
vi.mock('@/hooks/use-current-principal', () => ({ useCurrentPrincipal }))

// Avoid pulling the jsPDF-backed POD module into the test.
vi.mock('@/lib/api/customer-pod', () => ({ downloadCustomerPod: vi.fn() }))

const rescheduleDelivery = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api/customer-packages', () => ({ rescheduleDelivery }))

const pkg = (over: Partial<CustomerPackage>): CustomerPackage => ({
  id: Math.random().toString(36).slice(2),
  po_number: null,
  status: 'in_transit',
  customer_notes: null,
  created_at: '2026-07-01T10:00:00Z',
  updated_at: null,
  reschedule_requested: false,
  is_receiver: false,
  items: [{ description: 'Widget', quantity: 1 }],
  ...over,
})

const PACKAGES: CustomerPackage[] = [
  pkg({ id: 'a', po_number: 'PO-100', status: 'in_transit' }),
  pkg({ id: 'b', po_number: 'PO-100', status: 'in_transit' }),
  pkg({ id: 'c', po_number: 'PO-200', status: 'delivered' }),
]

beforeEach(() => {
  useCurrentPrincipal.mockReturnValue({ data: { kind: 'customer', customer: { role: 'buyer' } } })
  useMyPackages.mockReturnValue({ data: PACKAGES, isLoading: false, isError: false })
  rescheduleDelivery.mockReset()
  rescheduleDelivery.mockResolvedValue(undefined)
})

describe('MyPackagesPage — status filters (integration)', () => {
  it('renders a buyer scope label and only the statuses that are present, with counts', () => {
    renderWithProviders(<MyPackagesPage />)

    expect(screen.getByRole('heading', { name: /my packages/i })).toBeInTheDocument()
    expect(screen.getByText('All orders for your company')).toBeInTheDocument()

    // "All" = 3, "On the way" (in_transit) = 2, "Delivered" = 1; no Returned chip.
    expect(screen.getByRole('button', { name: /^All\s*3$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /on the way\s*2/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delivered\s*1/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /returned/i })).not.toBeInTheDocument()
  })

  it('filters the list when a status chip is selected', async () => {
    const user = userEvent.setup()
    renderWithProviders(<MyPackagesPage />)

    expect(screen.getByText('PO-100')).toBeInTheDocument()
    expect(screen.getByText('PO-200')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /delivered\s*1/i }))

    expect(screen.queryByText('PO-100')).not.toBeInTheDocument()
    expect(screen.getByText('PO-200')).toBeInTheDocument()
  })

  it('narrows by PO search and recomputes the chip counts within scope', async () => {
    const user = userEvent.setup()
    renderWithProviders(<MyPackagesPage />)

    await user.type(screen.getByLabelText(/search by po number/i), 'PO-200')

    expect(screen.queryByText('PO-100')).not.toBeInTheDocument()
    expect(screen.getByText('PO-200')).toBeInTheDocument()
    // Within the PO-200 scope only the delivered package remains → All = 1.
    expect(screen.getByRole('button', { name: /^All\s*1$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /on the way/i })).not.toBeInTheDocument()
  })

  it('shows a filtered-empty state with a clear action', async () => {
    const user = userEvent.setup()
    renderWithProviders(<MyPackagesPage />)

    await user.type(screen.getByLabelText(/search by po number/i), 'PO-999')
    expect(await screen.findByText(/no orders match/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /clear filters/i }))
    expect(screen.getByText('PO-100')).toBeInTheDocument()
  })

  it('renders the runner scope label and the base empty state', () => {
    useCurrentPrincipal.mockReturnValue({ data: { kind: 'customer', customer: { role: 'runner' } } })
    useMyPackages.mockReturnValue({ data: [], isLoading: false, isError: false })
    renderWithProviders(<MyPackagesPage />)

    expect(screen.getByText('Orders assigned to you')).toBeInTheDocument()
    expect(screen.getByText('No orders to show yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^All/i })).not.toBeInTheDocument()
  })

  it('groups multiple packages under one PO with a count', () => {
    renderWithProviders(<MyPackagesPage />)
    const po100 = screen.getByText('PO-100').closest('li') as HTMLElement
    expect(within(po100).getByText('2 packages')).toBeInTheDocument()
  })

  it('lets the receiver reschedule an in-transit delivery with a reason', async () => {
    const user = userEvent.setup()
    useMyPackages.mockReturnValue({
      data: [pkg({ id: 'r1', po_number: 'PO-300', status: 'in_transit', is_receiver: true })],
      isLoading: false,
      isError: false,
    })
    renderWithProviders(<MyPackagesPage />)

    await user.click(screen.getByRole('button', { name: /request reschedule/i }))
    await user.type(
      await screen.findByPlaceholderText(/no one available today/i),
      'Please deliver Thursday',
    )
    // The dialog's confirm button (second "Request reschedule" — in the footer).
    const submit = screen.getAllByRole('button', { name: /request reschedule/i }).at(-1)!
    await user.click(submit)

    expect(rescheduleDelivery).toHaveBeenCalledWith('r1', 'Please deliver Thursday')
  })

  it('hides reschedule for non-receivers and non-in-transit parcels', () => {
    useMyPackages.mockReturnValue({
      data: [
        pkg({ id: 'a', status: 'in_transit', is_receiver: false }), // not the receiver
        pkg({ id: 'b', status: 'notified', is_receiver: true }), // not out for delivery
      ],
      isLoading: false,
      isError: false,
    })
    renderWithProviders(<MyPackagesPage />)
    expect(screen.queryByRole('button', { name: /request reschedule/i })).not.toBeInTheDocument()
  })
})
