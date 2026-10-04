import { expect, test } from '@playwright/test'
import { go, login } from './helpers'

/**
 * SaaS operations on the app (architecture §0B.14): the Super Admin (+919000000009) uses the console on the app —
 * businesses, plan and the sign-up request seeded by V9005 — and staff see branches and their plan.
 */
test('the Super Admin manages businesses and sign-ups on the app', async ({ page }) => {
  await login(page, '9000000009')
  await page.waitForURL(/\/platform/)
  await expect(page.getByText(/sign-up request.* waiting/)).toBeVisible()
  await page.getByText('Kaveri Building Materials').click()
  await page.waitForURL(/\/platform\/tenant\//)
  await expect(page.getByText('Usage')).toBeVisible()
  await expect(page.getByText('Modules')).toBeVisible()
  await go(page, '/platform/signups')
  await expect(page.getByText('Lakshmi Paints & Hardware')).toBeVisible()
  await page.getByText('Lakshmi Paints & Hardware').click()
  await expect(page.getByRole('button', { name: 'Reject…' })).toBeVisible()
})

test('staff see branches and their plan', async ({ page }) => {
  await login(page, '9000000002')
  await go(page, '/admin/more')
  await expect(page.getByText('Branches & transfers')).toBeVisible()
  await expect(page.getByText('Working branch').first()).toBeVisible()
  await go(page, '/admin/branches')
  await expect(page.getByText('Central Godown')).toBeVisible()
})

test('the sign-in screen links to business sign-up', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Run a business? Get ShopFlow').click()
  await page.waitForURL(/\/signup/)
  await expect(page.getByText('Get ShopFlow for your business')).toBeVisible()
})
