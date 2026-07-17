import { describe, expect, it } from 'vitest'
import { PACKAGE_STATUS } from '@/lib/status'
import {
  type ApiErrorResponse,
  type CreatePackageApiResponse,
  type Package,
  type PackageActionApiResponse,
  type UpdatePackageApiResponse,
  computePurchaseOrderLineBalance,
  getAllowedManualStatusTransitions,
  isApiError,
  isCreatePackageError,
  isCreatePackageSuccess,
  isPackageActionSuccess,
  isPackageEditable,
  isUpdatePackageSuccess,
  likeLiteral,
  normalizePoNumber,
} from './package'

const pkg = { id: 'p1', reference: 'RBX-1' } as Package
const err: ApiErrorResponse = { error: 'boom' }

describe('response type guards', () => {
  it('isCreatePackageSuccess / isCreatePackageError', () => {
    const ok = { package: pkg, email_sent: true, email_error: null } as CreatePackageApiResponse
    expect(isCreatePackageSuccess(ok)).toBe(true)
    expect(isCreatePackageSuccess(err)).toBe(false)
    expect(isCreatePackageError(err)).toBe(true)
    expect(isCreatePackageError(ok)).toBe(false)
  })

  it('isUpdatePackageSuccess', () => {
    const ok = { package: pkg } as UpdatePackageApiResponse
    expect(isUpdatePackageSuccess(ok)).toBe(true)
    expect(isUpdatePackageSuccess(err)).toBe(false)
  })

  it('isPackageActionSuccess', () => {
    const ok = { package: pkg, email_sent: false, email_error: null } as PackageActionApiResponse
    expect(isPackageActionSuccess(ok)).toBe(true)
    expect(isPackageActionSuccess(err)).toBe(false)
  })

  it('isApiError guards arbitrary values', () => {
    expect(isApiError(err)).toBe(true)
    expect(isApiError(null)).toBe(false)
    expect(isApiError('nope')).toBe(false)
    expect(isApiError({ package: pkg })).toBe(false)
  })
})

describe('computePurchaseOrderLineBalance', () => {
  it('uses the larger of allocated vs consumed, clamped by ordered', () => {
    expect(computePurchaseOrderLineBalance(10, 3, 7)).toEqual({ allocatedQuantity: 7, remainingQuantity: 3 })
    expect(computePurchaseOrderLineBalance(5, 8, 0)).toEqual({ allocatedQuantity: 5, remainingQuantity: 0 })
  })

  it('coerces invalid/negative numbers to zero', () => {
    expect(computePurchaseOrderLineBalance(NaN, NaN, NaN)).toEqual({ allocatedQuantity: 0, remainingQuantity: 0 })
    expect(computePurchaseOrderLineBalance(-3, 1, 1)).toEqual({ allocatedQuantity: 0, remainingQuantity: 0 })
  })
})

describe('getAllowedManualStatusTransitions', () => {
  it('returns nothing for terminal states', () => {
    expect(getAllowedManualStatusTransitions(PACKAGE_STATUS.COLLECTED)).toEqual([])
    expect(getAllowedManualStatusTransitions(PACKAGE_STATUS.DELIVERED)).toEqual([])
    expect(getAllowedManualStatusTransitions(PACKAGE_STATUS.RETURNED)).toEqual([])
  })

  it('allows ready_for_collection to be re-notified', () => {
    expect(getAllowedManualStatusTransitions(PACKAGE_STATUS.READY_FOR_COLLECTION)).toEqual([
      PACKAGE_STATUS.NOTIFIED,
    ])
  })

  it('lets a draft move to pending or notified', () => {
    expect(getAllowedManualStatusTransitions(PACKAGE_STATUS.DRAFT)).toEqual([
      PACKAGE_STATUS.PENDING,
      PACKAGE_STATUS.NOTIFIED,
    ])
  })

  it('offers forward-only transitions (excluding collected) mid-flow', () => {
    expect(getAllowedManualStatusTransitions(PACKAGE_STATUS.PENDING)).toEqual([
      PACKAGE_STATUS.NOTIFIED,
      PACKAGE_STATUS.IN_TRANSIT,
      PACKAGE_STATUS.READY_FOR_COLLECTION,
    ])
    expect(getAllowedManualStatusTransitions(PACKAGE_STATUS.NOTIFIED)).toEqual([
      PACKAGE_STATUS.IN_TRANSIT,
      PACKAGE_STATUS.READY_FOR_COLLECTION,
    ])
  })

  it('returns nothing for an unrecognised status', () => {
    expect(getAllowedManualStatusTransitions('bogus' as Package['status'])).toEqual([])
  })
})

describe('isPackageEditable', () => {
  it('is editable while draft/pending/notified only', () => {
    expect(isPackageEditable({ status: PACKAGE_STATUS.DRAFT })).toBe(true)
    expect(isPackageEditable({ status: PACKAGE_STATUS.PENDING })).toBe(true)
    expect(isPackageEditable({ status: PACKAGE_STATUS.NOTIFIED })).toBe(true)
    expect(isPackageEditable({ status: PACKAGE_STATUS.IN_TRANSIT })).toBe(false)
  })
})

describe('normalizePoNumber', () => {
  it.each([
    ['GG80700992', 'GG80700992'],
    // The case that splits one Global PO into two: a hand-typed number and an
    // ingested one must land on the same key.
    ['gg80700992', 'GG80700992'],
    ['  GG80700992  ', 'GG80700992'],
    ['\tgG80700992\n', 'GG80700992'],
  ])('normalizes %j to %j', (raw, expected) => {
    expect(normalizePoNumber(raw)).toBe(expected)
  })

  it('treats a missing number as empty rather than throwing', () => {
    expect(normalizePoNumber(null)).toBe('')
    expect(normalizePoNumber(undefined)).toBe('')
    expect(normalizePoNumber('   ')).toBe('')
  })
})

describe('likeLiteral', () => {
  it('leaves an ordinary PO number untouched', () => {
    expect(likeLiteral('GG80700992')).toBe('GG80700992')
  })

  it.each([
    ['GG_1', 'GG\\_1'],
    ['GG%1', 'GG\\%1'],
    ['GG\\1', 'GG\\\\1'],
    ['%_%', '\\%\\_\\%'],
  ])('escapes the ilike wildcards in %j', (raw, expected) => {
    expect(likeLiteral(raw)).toBe(expected)
  })
})
