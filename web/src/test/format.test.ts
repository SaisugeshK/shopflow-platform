import { describe, expect, it } from 'vitest'
import { toQuery, ApiError } from '@/services/api'
import { initials, maskMobile, money, quantity, titleCase } from '@/utils/format'

describe('format', () => {
  it('formats rupees with Indian grouping', () => {
    expect(money(1234567.5)).toContain('12,34,567.50')
    expect(money(null)).toBe('—')
  })
  it('formats quantities without trailing zeros', () => {
    expect(quantity('5.000')).toBe('5')
    expect(quantity(2.5)).toBe('2.5')
  })
  it('title-cases enum values', () => {
    expect(titleCase('READY_FOR_DELIVERY')).toBe('Ready For Delivery')
  })
  it('masks mobiles and builds initials', () => {
    expect(maskMobile('+919876543210')).toBe('+91 ••••• 3210')
    expect(initials('Ravi Kumar')).toBe('RK')
  })
})

describe('api helpers', () => {
  it('builds query strings and skips empty values', () => {
    expect(toQuery({ q: 'rice', page: 2, empty: '', none: undefined, status: ['PLACED', 'ACCEPTED'] })).toBe('?q=rice&page=2&status=PLACED&status=ACCEPTED')
    expect(toQuery({})).toBe('')
  })
  it('exposes field errors from the error envelope', () => {
    const e = new ApiError(400, 'VALIDATION_ERROR', 'Invalid', [{ field: 'mobileNumber', message: 'Bad number' }])
    expect(e.fieldError('mobileNumber')).toBe('Bad number')
    expect(e.fieldError('other')).toBeUndefined()
  })
})
