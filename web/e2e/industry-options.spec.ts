import { expect, test } from '@playwright/test'
import { login } from './helpers'

/**
 * Industry options (architecture §0B.7, Phase 2) on the web: a product sold by the case with batch tracking, received
 * on a purchase with a batch and expiry, sold by the case on an invoice with a transport charge, and a scheme.
 * Uses the dev seed tenant "main" (modules switched on by V9002) and "kaveri-build" for the daily rate list.
 */
test('owner sets up a batch-tracked product sold by the case and invoices it with a charge', async ({ page }) => {
  test.setTimeout(180_000)
  const tag = String(Date.now()).slice(-6)
  const name = `E2E Biscuits ${tag}`
  await login(page, '9000000001')
  await expect(page).toHaveURL(/\/app$/)

  // Product with an alternate unit and batch tracking.
  await page.goto('/app/products/new')
  await page.getByLabel('Product name').fill(name)
  await page.getByLabel('Category').selectOption({ index: 1 })
  await page.getByLabel('Purchase price (cost)').fill('8')
  await page.getByLabel('Selling price').fill('10')
  await page.getByLabel('HSN code').fill('1905')
  await page.locator('label', { hasText: 'Track batches and expiry dates' }).click()
  await page.getByRole('button', { name: 'Add unit' }).click()
  await page.getByLabel('Unit', { exact: true }).last().selectOption('CASE')
  await page.getByLabel('Factor').fill('24')
  await page.getByRole('button', { name: 'Create product' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
  await expect(page.getByText('1 CASE = 24 PCS')).toBeVisible()
  await expect(page.getByText('Batch + expiry')).toBeVisible()

  // Purchase 2 cases in batch B-<tag>.
  await page.goto('/app/purchases/new')
  await page.locator('#sup').selectOption({ index: 1 })
  await page.getByLabel('Add product').fill(name)
  await page.getByRole('option', { name: new RegExp(name) }).first().click()
  await page.getByLabel(`Unit of ${name}`).selectOption('CASE')
  await page.getByLabel(`Quantity of ${name}`).fill('2')
  await page.getByLabel(`Batch number of ${name}`).fill(`B-${tag}`)
  await page.getByLabel(`Expiry date of ${name}`).fill('2030-12-31')
  await page.getByRole('button', { name: 'Save & post' }).click()
  await expect(page.getByText(`Batch B-${tag}`)).toBeVisible()

  await page.goto('/app/batches')
  await page.getByRole('tab', { name: 'All in stock' }).click()
  await page.getByLabel('Search', { exact: true }).fill(tag)
  await expect(page.getByRole('cell', { name: `B-${tag}` })).toBeVisible()

  // Invoice one case with a transport charge.
  await page.goto('/app/invoices/new')
  await page.locator('#inv-c').selectOption({ index: 1 })
  await page.getByLabel('Add product').fill(name)
  await page.getByRole('option', { name: new RegExp(name) }).first().click()
  await page.getByLabel(`Unit of ${name}`).selectOption('CASE')
  await page.getByRole('button', { name: 'Add charge' }).click()
  await page.getByLabel('Charge amount').fill('300')
  await page.getByRole('button', { name: 'Calculate (save draft)' }).click()
  await expect(page.getByRole('cell', { name: /Transport/ })).toBeVisible()
  await page.getByRole('button', { name: 'Generate invoice' }).click()
  await expect(page.getByText('Invoice generated')).toBeVisible()
  await expect(page.getByText('1 CASE = 24 base units')).toBeVisible()
  await expect(page.getByText(new RegExp(`Batch: B-${tag}`))).toBeVisible()

  // A quantity slab scheme on the new product.
  await page.goto('/app/schemes')
  await page.getByRole('button', { name: 'New scheme' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(`Bulk ${tag}`)
  await dialog.getByLabel('Type').selectOption('QUANTITY_SLAB')
  await dialog.getByLabel('Add product').fill(name)
  await dialog.getByRole('option', { name: new RegExp(name) }).first().click()
  await dialog.getByLabel('Minimum quantity').fill('48')
  await dialog.getByLabel('Discount (%)').fill('3')
  await dialog.getByRole('button', { name: 'Create scheme' }).click()
  await expect(page.getByText(`Bulk ${tag}`)).toBeVisible()
})

test('a construction business updates its daily rate list', async ({ page }) => {
  await login(page, '9000000012')
  await expect(page).toHaveURL(/\/app$/)
  await page.goto('/app/daily-rates')
  await expect(page.getByText('OPC 53 Grade Cement 50kg')).toBeVisible()
  await page.getByLabel('New rate for OPC 53 Grade Cement 50kg').fill('392')
  await page.getByRole('button', { name: /Save 1 rate/ }).click()
  await expect(page.getByText('Rates saved')).toBeVisible()
  await page.goto('/app/products/00000000-0000-0000-0007-000000000301')
  await expect(page.getByText('Daily rate list')).toBeVisible()
  await expect(page.getByText('₹392.00').first()).toBeVisible()
})
