import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { go, login } from './helpers'

/**
 * Responsive standard (architecture §0B.11, D-038) for the app's browser build: every screen at phone and tablet sizes
 * must not scroll sideways and must not push headings or buttons off-screen. Horizontal chip/tab rows that scroll
 * inside their own container are allowed. Signs in once per role and navigates in-app (the session lives in memory).
 */
const SIZES = [
  { width: 360, height: 800 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 1366 },
]

interface Problem { route: string; width: number; issue: string }

/** Captures the bearer token the app sends, so the test can look up record ids for detail screens. */
function captureToken(page: Page): () => string | undefined {
  let token: string | undefined
  page.on('request', (req) => {
    const auth = req.headers().authorization
    if (auth?.startsWith('Bearer ')) token = auth.slice(7)
  })
  return () => token
}

async function firstId(page: Page, token: string | undefined, path: string): Promise<string | undefined> {
  if (!token) return undefined
  const res = await page.request.get(`http://localhost:8080${path}${path.includes('?') ? '&' : '?'}pageSize=1`, {
    headers: { Authorization: `Bearer ${token}`, 'X-Client-Type': 'mobile' },
  })
  if (!res.ok()) return undefined
  const body = await res.json()
  const first = Array.isArray(body.data) ? body.data[0] : undefined
  return first?.id ?? first?.productId
}

async function measure(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const issues: string[] = []
    const doc = document.documentElement
    if (doc.scrollWidth > doc.clientWidth + 1) issues.push(`page scrolls sideways (${doc.scrollWidth}px > ${doc.clientWidth}px)`)
    const scrollsSideways = (el: HTMLElement) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX
        if ((ox === 'auto' || ox === 'scroll') && p.scrollWidth > p.clientWidth) return true
      }
      return false
    }
    const els = Array.from(document.querySelectorAll<HTMLElement>('[role="heading"], [role="button"], button'))
    for (const el of els) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0 || el.closest('[aria-hidden="true"]')) continue
      if (getComputedStyle(el).visibility === 'hidden') continue
      // Inactive stack screens stay mounted but are hidden behind the active one.
      if (el.closest('[style*="display: none"]')) continue
      if ((r.right > doc.clientWidth + 1 || r.left < -1) && !scrollsSideways(el)) {
        issues.push(`"${(el.textContent ?? el.getAttribute('aria-label') ?? '').trim().slice(0, 40)}" off-screen`)
      }
    }
    return issues
  })
}

async function sweep(page: Page, routes: string[]): Promise<Problem[]> {
  const problems: Problem[] = []
  for (const size of SIZES) {
    await page.setViewportSize(size)
    for (const route of routes) {
      await go(page, route)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(300)
      for (const issue of await measure(page)) problems.push({ route, width: size.width, issue })
    }
  }
  return problems
}

function report(problems: Problem[]) {
  const unique = [...new Map(problems.map((p) => [`${p.width} ${p.route} ${p.issue}`, p])).values()]
  if (unique.length) console.log(unique.map((p) => `${String(p.width).padStart(4)}px  ${p.route}  ${p.issue}`).join('\n'))
  expect(unique, `${unique.length} responsive problems`).toEqual([])
}

test.describe('responsive @responsive', () => {
  test.setTimeout(900_000)

  test('staff screens fit phones and tablets', async ({ page }) => {
    const token = captureToken(page)
    await login(page, '9000000001')
    await expect(page).toHaveURL(/\/admin/)
    await page.waitForLoadState('networkidle')
    const ids = {
      order: await firstId(page, token(), '/api/v1/orders'),
      product: await firstId(page, token(), '/api/v1/products'),
      purchase: await firstId(page, token(), '/api/v1/purchases'),
      customer: await firstId(page, token(), '/api/v1/customers'),
      supplier: await firstId(page, token(), '/api/v1/suppliers'),
      invoice: await firstId(page, token(), '/api/v1/invoices'),
      payment: await firstId(page, token(), '/api/v1/payments'),
    }
    const routes = [
      '/admin', '/admin/orders', '/admin/products', '/admin/customers', '/admin/more', '/admin/search', '/admin/categories',
      '/admin/stock', '/admin/movements', '/admin/purchases', '/admin/purchase-new', '/admin/purchase-returns',
      '/admin/suppliers', '/admin/invoices', '/admin/invoice-new', '/admin/payments', '/admin/returns', '/admin/reports',
      '/admin/users', '/admin/settings', '/admin/audit', '/admin/notifications', '/admin/customer-new', '/admin/product-form',
      '/admin/quotations', '/admin/quotation-new', '/admin/delivery-challans', '/admin/challan-new', '/admin/job-work',
      '/admin/agents', '/admin/projects', '/admin/branches',
      ids.order && `/admin/order/${ids.order}`, ids.product && `/admin/product/${ids.product}`,
      ids.purchase && `/admin/purchase/${ids.purchase}`, ids.customer && `/admin/customer/${ids.customer}`,
      ids.supplier && `/admin/supplier/${ids.supplier}`, ids.invoice && `/admin/invoice/${ids.invoice}`,
      ids.payment && `/admin/payment/${ids.payment}`,
    ].filter(Boolean) as string[]
    report(await sweep(page, routes))
  })

  test('customer shop fits phones and tablets', async ({ page }) => {
    const token = captureToken(page)
    await login(page, '9000000003')
    await expect(page).toHaveURL(/\/shop/)
    await page.waitForLoadState('networkidle')
    const ids = {
      product: await firstId(page, token(), '/api/v1/catalog/products'),
      order: await firstId(page, token(), '/api/v1/orders'),
      invoice: await firstId(page, token(), '/api/v1/invoices'),
    }
    const routes = [
      '/shop', '/shop/products', '/shop/cart', '/shop/orders', '/shop/account', '/shop/checkout', '/shop/invoices',
      '/shop/payments', '/shop/outstanding', '/shop/returns', '/shop/notifications', '/shop/quotations', '/shop/projects',
      ids.product && `/shop/product/${ids.product}`, ids.order && `/shop/order/${ids.order}`,
      ids.invoice && `/shop/invoice/${ids.invoice}`,
    ].filter(Boolean) as string[]
    report(await sweep(page, routes))
  })

  test('sign-in screen fits phones and tablets', async ({ page }) => {
    await page.goto('/')
    const problems: Problem[] = []
    for (const size of SIZES) {
      await page.setViewportSize(size)
      await page.waitForTimeout(300)
      for (const issue of await measure(page)) problems.push({ route: '/login', width: size.width, issue })
    }
    report(problems)
  })
})
