import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import type { CustomerPackage, CustomerPackageGroup } from '@/lib/api/customer-packages'
import type { PackageStatus } from '@/lib/status'
import { MyPackagesPage } from './my-packages'

const useMyPackageGroups = vi.hoisted(() => vi.fn())
const useMyPackageStatusCounts = vi.hoisted(() => vi.fn())
const useMyPackagesTotal = vi.hoisted(() => vi.fn())
vi.mock('@/hooks/use-my-packages', () => ({
  useMyPackageGroups,
  useMyPackageStatusCounts,
  useMyPackagesTotal,
}))

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
  receiver_name: null,
  items: [{ description: 'Widget', quantity: 1 }],
  ...over,
})

/** A group as `customer_package_groups` returns it: already grouped, server-side. */
const group = (po: string | null, packages: CustomerPackage[]): CustomerPackageGroup => ({
  key: po ? `po:${po}` : packages[0].id,
  po,
  packages,
})

/** The shape useMyPackageGroups (an infinite query) hands the page. */
function groupsResult(
  pages: CustomerPackageGroup[][],
  over: Partial<{ hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => void }> = {},
) {
  return {
    data: { pages },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    ...over,
  }
}

const counts = (entries: [PackageStatus, number][]) => ({ data: new Map(entries) })

const PO_100 = group('PO-100', [
  pkg({ id: 'a', po_number: 'PO-100', status: 'in_transit' }),
  pkg({ id: 'b', po_number: 'PO-100', status: 'in_transit' }),
])
const PO_200 = group('PO-200', [pkg({ id: 'c', po_number: 'PO-200', status: 'delivered' })])

/** The filters the page last asked the server for. */
const lastQuery = () => useMyPackageGroups.mock.calls.at(-1)![0]

beforeEach(() => {
  useCurrentPrincipal.mockReturnValue({ data: { kind: 'customer', customer: { role: 'buyer' } } })
  useMyPackagesTotal.mockReturnValue({ data: 3 })
  useMyPackageStatusCounts.mockReturnValue(counts([['in_transit', 2], ['delivered', 1]]))
  useMyPackageGroups.mockReturnValue(groupsResult([[PO_100, PO_200]]))
  rescheduleDelivery.mockReset()
  rescheduleDelivery.mockResolvedValue(undefined)
})

describe('MyPackagesPage — the customer can see their own record', () => {
  it('shows a persistent reschedule notice, and stops offering the button again', () => {
    useMyPackageGroups.mockReturnValue(
      groupsResult([
        [group('PO-500', [pkg({ id: 'r1', po_number: 'PO-500', status: 'in_transit', is_receiver: true, reschedule_requested: true })])],
      ]),
    )
    renderWithProviders(<MyPackagesPage />)

    expect(screen.getByText(/reschedule requested/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /request reschedule/i })).not.toBeInTheDocument()
  })

  it('keeps the notice visible after the parcel moves back to being prepared', () => {
    // The request persists and never clears — a customer who asked must still see
    // it once the parcel leaves in_transit, or they'll phone the depot to check.
    useMyPackageGroups.mockReturnValue(
      groupsResult([
        [group('PO-501', [pkg({ id: 'r2', po_number: 'PO-501', status: 'notified', is_receiver: true, reschedule_requested: true })])],
      ]),
    )
    renderWithProviders(<MyPackagesPage />)

    expect(screen.getByText(/reschedule requested/i)).toBeInTheDocument()
  })

  it('shows no notice when nothing was requested', () => {
    renderWithProviders(<MyPackagesPage />)
    expect(screen.queryByText(/reschedule requested/i)).not.toBeInTheDocument()
  })

  it('renders the journey for a parcel still on the move', () => {
    useMyPackageGroups.mockReturnValue(
      groupsResult([[group('PO-600', [pkg({ id: 't1', po_number: 'PO-600', status: 'in_transit' })])]]),
    )
    renderWithProviders(<MyPackagesPage />)

    // Customer wording, not the depot's ("Picked up by driver" / "Receiver notified").
    expect(screen.getByText('Order received')).toBeInTheDocument()
    expect(screen.getByText('Ready for collection')).toBeInTheDocument()
    expect(screen.queryByText(/picked up by driver/i)).not.toBeInTheDocument()
  })

  it('labels the dates so a creation date is never mistaken for an ETA', () => {
    useMyPackageGroups.mockReturnValue(
      groupsResult([
        [group('PO-700', [pkg({ id: 'd1', po_number: 'PO-700', status: 'in_transit', updated_at: '2026-07-02T08:00:00Z' })])],
      ]),
    )
    renderWithProviders(<MyPackagesPage />)

    expect(screen.getByText('Ordered')).toBeInTheDocument()
    expect(screen.getByText('Last updated')).toBeInTheDocument()
  })

  it('groups multiple packages under one PO with a count', () => {
    renderWithProviders(<MyPackagesPage />)
    const po100 = screen.getByText('PO-100').closest('li') as HTMLElement
    expect(within(po100).getByText('2 packages')).toBeInTheDocument()
  })

  it("names the end user on a buyer's parcels but not on the buyer's own", () => {
    useMyPackageGroups.mockReturnValue(
      groupsResult([
        [
          group('PO-300', [pkg({ id: 'x', po_number: 'PO-300', receiver_name: 'Thabo Nkosi', is_receiver: false })]),
          group('PO-400', [pkg({ id: 'y', po_number: 'PO-400', receiver_name: 'Ada Buyer', is_receiver: true })]),
        ],
      ]),
    )
    renderWithProviders(<MyPackagesPage />)

    expect(screen.getByText('Thabo Nkosi')).toBeInTheDocument()
    // Your own parcel is unlabelled — the name would just be noise.
    expect(screen.queryByText('Ada Buyer')).not.toBeInTheDocument()
  })
})

describe('MyPackagesPage — error state', () => {
  it('names the failure, offers a retry, and points at the depot', async () => {
    const user = userEvent.setup()
    const refetch = vi.fn()
    useMyPackageGroups.mockReturnValue({
      ...groupsResult([]),
      data: undefined,
      isError: true,
      refetch,
    })
    renderWithProviders(<MyPackagesPage />)

    expect(screen.getByText(/could not load your packages/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /contact the depot/i })).toHaveAttribute(
      'href',
      'mailto:support@rabelani.co.za',
    )

    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(refetch).toHaveBeenCalled()
  })
})

describe('MyPackagesPage — filters drive the server query', () => {
  it('renders a buyer scope label and only the statuses that are present, with counts', () => {
    renderWithProviders(<MyPackagesPage />)

    expect(screen.getByRole('heading', { name: /my packages/i })).toBeInTheDocument()
    expect(screen.getByText('Your orders, and those of the end users assigned to you')).toBeInTheDocument()

    // "All" sums the server's counts; no Returned chip because the count is absent.
    expect(screen.getByRole('button', { name: /^All\s*3$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /on the way\s*2/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delivered\s*1/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /returned/i })).not.toBeInTheDocument()
  })

  it('asks the server for one status when a chip is selected', async () => {
    const user = userEvent.setup()
    renderWithProviders(<MyPackagesPage />)

    expect(lastQuery()).toMatchObject({ status: null })

    await user.click(screen.getByRole('button', { name: /delivered\s*1/i }))

    // Filtering is the view's job now — the page's job is to ask correctly.
    expect(lastQuery()).toMatchObject({ status: 'delivered' })
  })

  it('debounces a PO search, then asks the server for it', async () => {
    const user = userEvent.setup()
    renderWithProviders(<MyPackagesPage />)

    await user.type(screen.getByLabelText(/search by po number/i), 'PO-200')

    // The counts move with the search so the chips stay honest within scope.
    await waitFor(() => expect(lastQuery()).toMatchObject({ query: 'PO-200' }))
    expect(useMyPackageStatusCounts).toHaveBeenLastCalledWith('PO-200')
  })

  it('shows a filtered-empty state and clears back to an unfiltered query', async () => {
    const user = userEvent.setup()
    useMyPackageGroups.mockReturnValue(groupsResult([[]]))
    useMyPackageStatusCounts.mockReturnValue(counts([]))
    renderWithProviders(<MyPackagesPage />)

    await user.type(screen.getByLabelText(/search by po number/i), 'PO-999')
    expect(await screen.findByText(/no orders match/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /clear filters/i }))
    await waitFor(() => expect(lastQuery()).toMatchObject({ query: '', status: null }))
  })

  it('renders the runner scope label and the base empty state', () => {
    useCurrentPrincipal.mockReturnValue({ data: { kind: 'customer', customer: { role: 'runner' } } })
    useMyPackagesTotal.mockReturnValue({ data: 0 })
    useMyPackageStatusCounts.mockReturnValue(counts([]))
    useMyPackageGroups.mockReturnValue(groupsResult([[]]))
    renderWithProviders(<MyPackagesPage />)

    expect(screen.getByText('Orders assigned to you')).toBeInTheDocument()
    expect(screen.getByText('No orders to show yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^All/i })).not.toBeInTheDocument()
  })
})

describe('MyPackagesPage — scroll pagination', () => {
  it('renders every loaded page as one list', () => {
    useMyPackageGroups.mockReturnValue(
      groupsResult([[PO_100], [PO_200]], { hasNextPage: true }),
    )
    renderWithProviders(<MyPackagesPage />)

    expect(screen.getByText('PO-100')).toBeInTheDocument()
    expect(screen.getByText('PO-200')).toBeInTheDocument()
  })

  it('loads the next page on demand, without a mouse wheel', async () => {
    const user = userEvent.setup()
    const fetchNextPage = vi.fn()
    useMyPackageGroups.mockReturnValue(
      groupsResult([[PO_100]], { hasNextPage: true, fetchNextPage }),
    )
    renderWithProviders(<MyPackagesPage />)

    await user.click(screen.getByRole('button', { name: /load more/i }))
    expect(fetchNextPage).toHaveBeenCalled()
  })

  it('offers nothing more to load once the list is exhausted', () => {
    renderWithProviders(<MyPackagesPage />)
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument()
  })

  it('does not fire a second fetch while one is already in flight', async () => {
    const user = userEvent.setup()
    const fetchNextPage = vi.fn()
    useMyPackageGroups.mockReturnValue(
      groupsResult([[PO_100]], { hasNextPage: true, isFetchingNextPage: true, fetchNextPage }),
    )
    renderWithProviders(<MyPackagesPage />)

    const button = screen.getByRole('button', { name: /loading/i })
    expect(button).toBeDisabled()
    await user.click(button)
    expect(fetchNextPage).not.toHaveBeenCalled()
  })
})

describe('MyPackagesPage — reschedule', () => {
  it('lets the receiver reschedule an in-transit delivery with a reason', async () => {
    const user = userEvent.setup()
    useMyPackageGroups.mockReturnValue(
      groupsResult([
        [group('PO-300', [pkg({ id: 'r1', po_number: 'PO-300', status: 'in_transit', is_receiver: true })])],
      ]),
    )
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
    useMyPackageGroups.mockReturnValue(
      groupsResult([
        [
          group(null, [pkg({ id: 'a', status: 'in_transit', is_receiver: false })]), // not the receiver
          group(null, [pkg({ id: 'b', status: 'notified', is_receiver: true })]), // not out for delivery
        ],
      ]),
    )
    renderWithProviders(<MyPackagesPage />)
    expect(screen.queryByRole('button', { name: /request reschedule/i })).not.toBeInTheDocument()
  })
})
