import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('joins truthy class values', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('drops falsy values and supports conditional objects/arrays', () => {
    const off = 0 as number
    expect(cn('a', false, null, undefined, ['b', off && 'c'], { d: true, e: false })).toBe('a b d')
  })

  it('merges conflicting tailwind utilities (last wins)', () => {
    expect(cn('px-2 px-4')).toBe('px-4')
    expect(cn('text-sm', 'text-lg')).toBe('text-lg')
  })
})
