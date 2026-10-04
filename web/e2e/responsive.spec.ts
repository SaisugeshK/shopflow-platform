import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { login } from './helpers'

/**
 * Responsive standard (architecture §0B.11, D-038): every route at every width must not scroll sideways and must not
 * clip headings or buttons. Signs in once per role; the HttpOnly refresh cookie restores the session on each visit.
 */
const WIDTHS = [360, 390, 768, 1024, 1280, 1440]

interface Problem { route: string; width: number; issue: string }

async function apiToken(page: Page): Promise<string> {
  const res = await page.request.post('/api/v1/auth/refresh', { headers: { 'X-Client-Type': 'web' }, data: {} })
  expect(res.ok()).toBeTruthy()
  return (await res.json()).data.accessToken as string
}

async function firstId(page: Page, token: string, path: string): Promise<string | undefined> {
  const res = await page.request.get(`${path}${path.includes('?') ? '&' : '?'}pageSize=1`, { headers: { Authorization: `Bearer ${token}`, 'X-Client-Type': 'web' } })
  if (!res.ok()) return undefined
  const body = await res.json()
  const first = Array.isArray(body.data) ? body.data[0] : undefined
  return first?.id ?? first?.productId
}

/** Measures the page: sideways scroll, plus visible headings/buttons whose content is cut off. */
async function measure(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const issues: string[] = []
    const doc = document.documentElement
    if (doc.scrollWidth > doc.clientWidth + 1) issues.push(`page scrolls sideways (${doc.scrollWidth}px > ${doc.clientWidth}px)`)
    const els = Array.from(document.querySelectorAll<HTMLElement>('h1, h2, .page-header button, .page-header a.btn, .btn'))
    for (const el of els) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const style = getComputedStyle(el)
      if (style.visibility === 'hidden' || el.closest('[aria-hidden="true"]')) continue
      // Text that overflows its own box while overflow is hidden/clipped (and not an intentional ellipsis).
      const clipped = el.scrollWidth > el.clientWidth + 1 && style.textOverflow !== 'ellipsis'
      const offscreen = r.right > doc.clientWidth + 1 || r.left < -1
      if (clipped || offscreen) issues.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 40)}" ${offscreen ? 'off-screen' : 'clipped'}`)
    }
    return issues
  })
}

async function sweep(page: Page, routes: string[]): Promise<Problem[]> {
  const problems: Problem[] = []
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 })
    for (const route of routes) {
      await page.goto(route)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(150)
      for (const issue of await measure(page)) problems.push({ route, width, issue })
    }
  }
  return problems
}

function report(problems: Problem[]) {
  if (problems.length) {
    console.log(problems.map((p) => `${String(p.width).padStart(4)}px  ${p.route}  ${p.issue}`).join('\n'))
  }
  expect(problems, `${problems.length} responsive problems`).toEqual([])
}

test.describe('responsive @responsive', () => {
  test.setTimeout(600_000)

  test('owner screens fit every width', async ({ page }) => {
    await login(page, '9000000001')
    await expect(page).toHaveURL(/\/app$/)
    const token = await apiToken(page)
    const ids = {
      order: await firstId(page, token, '/api/v1/orders'),
      product: await firstId(page, token, '/api/v1/products'),
      purchase: await firstId(page, token, '/api/v1/purchases'),
      customer: await firstId(page, token, '/api/v1/customers'),
      supplier: await firstId(page, token, '/api/v1/suppliers'),
      invoice: await firstId(page, token, '/api/v1/invoices'),
      payment: await firstId(page, token, '/api/v1/payments'),
    }
    const routes = [
      '/app', '/app/search?q=a', '/app/orders', '/app/products', '/app/products/new', '/app/categories', '/app/stock',
      '/app/stock/movements', '/app/purchases', '/app/purchases/new', '/app/purchase-returns', '/app/customers',
      '/app/customers/new', '/app/suppliers', '/app/invoices', '/app/invoices/new', '/app/payments', '/app/returns',
      '/app/reports', '/app/users', '/app/settings', '/app/audit',
      '/app/quotations', '/app/quotations/new', '/app/delivery-challans', '/app/delivery-challans/new', '/app/job-work',
      '/app/agents', '/app/projects', '/app/branches', '/app/purchase-orders',
      ids.order && `/app/orders/${ids.order}`, ids.product && `/app/products/${ids.product}`,
      ids.product && `/app/products/${ids.product}/edit`, ids.purchase && `/app/purchases/${ids.purchase}`,
      ids.customer && `/app/customers/${ids.customer}`, ids.supplier && `/app/suppliers/${ids.supplier}`,
      ids.invoice && `/app/invoices/${ids.invoice}`, ids.payment && `/app/payments/${ids.payment}`,
    ].filter(Boolean) as string[]
    report(await sweep(page, routes))
  })

  test('admin dashboard fits every width', async ({ page }) => {
    await login(page, '9000000002')
    await expect(page).toHaveURL(/\/app$/)
    report(await sweep(page, ['/app']))
  })

  test('customer shop fits every width', async ({ page }) => {
    await login(page, '9000000003')
    await expect(page).toHaveURL(/\/shop$/)
    const token = await apiToken(page)
    const ids = {
      product: await firstId(page, token, '/api/v1/catalog/products'),
      order: await firstId(page, token, '/api/v1/orders'),
      invoice: await firstId(page, token, '/api/v1/invoices'),
    }
    const routes = [
      '/shop', '/shop/products', '/shop/cart', '/shop/checkout', '/shop/orders', '/shop/invoices', '/shop/payments',
      '/shop/outstanding', '/shop/returns', '/shop/profile', '/shop/quotations', '/shop/projects',
      ids.product && `/shop/products/${ids.product}`, ids.order && `/shop/orders/${ids.order}`,
      ids.invoice && `/shop/invoices/${ids.invoice}`,
    ].filter(Boolean) as string[]
    report(await sweep(page, routes))
  })

  test('sign-in screens fit every width', async ({ page }) => {
    report(await sweep(page, ['/login', '/session-expired', '/join/kaveri-build', '/join/no-such-shop', '/signup']))
  })

  test('super admin console fits every width', async ({ page }) => {
    await login(page, '9000000009')
    await expect(page).toHaveURL(/\/platform$/)
    const token = await apiToken(page)
    const res = await page.request.get('/api/v1/platform/tenants', { headers: { Authorization: `Bearer ${token}`, 'X-Client-Type': 'web' } })
    const tenant = (await res.json()).data[0]?.id as string | undefined
    report(await sweep(page, ['/platform', '/platform/tenants', '/platform/tenants/new', '/platform/industries', '/platform/admins',
      '/platform/audit', '/platform/signups', '/platform/plans', ...(tenant ? [`/platform/tenants/${tenant}`] : [])]))
  })
})
