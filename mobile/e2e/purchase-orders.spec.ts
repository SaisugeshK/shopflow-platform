import { expect, test } from '@playwright/test'
import { go, login } from './helpers'

/**
 * Purchase orders on the app (architecture §0B.8): staff see their purchase orders; a supplier (+919000000010) signs in
 * to the supplier area and opens an order from the buying business.
 */
test('staff see purchase orders in More', async ({ page }) => {
  await login(page, '9000000002')
  await go(page, '/admin/more')
  await expect(page.getByText('Purchase orders')).toBeVisible()
  await go(page, '/admin/purchase-orders')
  await expect(page.getByText(/PO\//).first()).toBeVisible()
})

test('a supplier signs in to the supplier area and opens an order', async ({ page }) => {
  await login(page, '9000000010')
  await page.waitForURL(/\/supplier/)
  await page.getByText('All orders').click()
  await page.getByText(/PO\//).first().click()
  await page.waitForURL(/\/supplier\/order\//)
  await expect(page.getByText('Rounds & history')).toBeVisible()
  await go(page, '/supplier/profile')
  await expect(page.getByText('Sample Distributors Pvt Ltd')).toBeVisible()
})
