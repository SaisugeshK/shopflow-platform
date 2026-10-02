import { homeFor } from '@/features/session'
import { orderTimeline } from '@/features/shop'
import { visibleMenu } from '@/navigation/staffMenu'
import { ApiError, toQuery } from '@/services/api'
import type { Order, StatusHistory } from '@/services/types'
import { date, initials, money, quantity, titleCase } from '@/utils/format'
import { GSTIN, MOBILE, PINCODE } from '@/utils/india'

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(), WHEN_UNLOCKED_THIS_DEVICE_ONLY: 0 }))

describe('formatting (display only)', () => {
  it('formats rupees with two decimals in en-IN grouping', () => {
    expect(money(123456.5)).toBe('₹1,23,456.50')
    expect(money(null)).toBe('—')
  })
  it('formats quantities and dates', () => {
    expect(quantity(2.5)).toBe('2.5')
    expect(date('2026-04-01')).toMatch(/01 Apr 2026/)
    expect(date(undefined)).toBe('—')
  })
  it('title-cases enum values and builds initials', () => {
    expect(titleCase('READY_FOR_DELIVERY')).toBe('Ready For Delivery')
    expect(initials('Demo Owner')).toBe('DO')
  })
})

describe('API helpers', () => {
  it('builds query strings, skipping empty values and repeating arrays', () => {
    expect(toQuery({ q: 'tea', page: 2, status: '', from: undefined, ids: ['a', 'b'] })).toBe('?q=tea&page=2&ids=a&ids=b')
    expect(toQuery({})).toBe('')
    expect(toQuery({ q: 'a&b' })).toBe('?q=a%26b')
  })
  it('exposes field errors from the API envelope', () => {
    const e = new ApiError(400, 'VALIDATION_ERROR', 'Invalid', [{ field: 'gstin', message: 'Enter a valid GSTIN' }])
    expect(e.fieldError('gstin')).toBe('Enter a valid GSTIN')
    expect(e.fieldError('pan')).toBeUndefined()
  })
})

describe('role routing', () => {
  it('sends each role to its home and unapproved customers to the status screen', () => {
    expect(homeFor('OWNER')).toBe('/admin')
    expect(homeFor('ADMIN')).toBe('/admin')
    expect(homeFor('CUSTOMER', 'APPROVED')).toBe('/shop')
    expect(homeFor('CUSTOMER', 'PENDING_APPROVAL')).toBe('/registration-status')
    expect(homeFor(undefined)).toBe('/login')
  })
  it('filters the staff menu by permission', () => {
    const labels = visibleMenu(['ORDER_READ', 'PRODUCT_READ']).flatMap((s) => s.items.map((i) => i.label))
    expect(labels).toEqual(expect.arrayContaining(['Orders', 'Products', 'Categories']))
    expect(labels).not.toContain('Audit logs')
    expect(labels).not.toContain('Users & permissions')
    expect(visibleMenu([])).toEqual([])
  })
})

describe('order timeline', () => {
  const order = (status: Order['status']) => ({ status }) as Order
  const h = (newStatus: string): StatusHistory => ({ newStatus, changedAt: '2026-10-01T10:00:00Z' })

  it('marks completed steps, the current step and upcoming steps', () => {
    const steps = orderTimeline(order('PACKING'), [h('PLACED'), h('ACCEPTED'), h('PACKING')])
    expect(steps.map((s) => s.state)).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming', 'upcoming', 'upcoming'])
    expect(steps[0]!.label).toBe('Order placed')
  })
  it('ends with a failed step for cancelled orders and hides steps never reached', () => {
    const steps = orderTimeline(order('CANCELLED'), [h('PLACED'), h('ACCEPTED'), h('CANCELLED')])
    expect(steps.map((s) => s.label)).toEqual(['Order placed', 'Accepted', 'Cancelled'])
    expect(steps[steps.length - 1]!.state).toBe('failed')
  })
})

describe('Indian validation patterns', () => {
  it('accepts valid and rejects invalid values', () => {
    expect(MOBILE.test('9000000001')).toBe(true)
    expect(MOBILE.test('1234567890')).toBe(false)
    expect(PINCODE.test('600001')).toBe(true)
    expect(PINCODE.test('012345')).toBe(false)
    expect(GSTIN.test('33ABCDE1234F1Z5')).toBe(true)
    expect(GSTIN.test('33ABCDE1234F1Y5')).toBe(false)
  })
})
