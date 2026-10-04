import { expect, test } from '@playwright/test'
import { go, login } from './helpers'

/**
 * Industry options on the app (architecture §0B.7): alternate units on the staff product screen, ordering by the case
 * in the customer app, and the daily rate list of a construction business. Uses the dev seed (V9002).
 */
const TEA = '00000000-0000-0000-0007-000000000003'

test('staff see the alternate unit and the options menu', async ({ page }) => {
  await login(page, '9000000001')
  await go(page, `/admin/product/${TEA}`)
  await expect(page.getByText('1 CASE = 12 PACK')).toBeVisible()
  await go(page, '/admin/more')
  await expect(page.getByText('Batches & expiry')).toBeVisible()
  await expect(page.getByText('Schemes')).toBeVisible()
  // Daily rates are not switched on for this business.
  await expect(page.getByText('Daily rates')).toHaveCount(0)
})

test('a customer orders tea by the case', async ({ page }) => {
  await login(page, '9000000003')
  await go(page, `/shop/product/${TEA}`)
  await page.getByText('CASE of 12').click()
  await page.getByRole('button', { name: 'Add to cart' }).click()
  await page.waitForURL(/\/shop\/cart/)
  await expect(page.getByText(/\/ CASE \(12 units\)/).first()).toBeVisible()
})

test('a construction business sees its daily rate list', async ({ page }) => {
  await login(page, '9000000012')
  await go(page, '/admin/daily-rates')
  await expect(page.getByText('OPC 53 Grade Cement 50kg')).toBeVisible()
  await expect(page.getByLabel('New rate for TMT Bar 12mm Fe550')).toBeVisible()
})
