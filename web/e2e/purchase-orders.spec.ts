import { expect, test } from '@playwright/test'
import { login } from './helpers'

/**
 * Purchase orders and the supplier portal (architecture §0B.8): the owner sends a PO, the supplier signs in and quotes
 * a new rate, the owner accepts and receives the goods. Dev seed: +919000000010 is the portal login of
 * "Sample Distributors Pvt Ltd" in tenant "main".
 */
test.describe.serial('purchase order with a supplier quotation', () => {
  let poNumber = ''

  test('owner sends a purchase order', async ({ page }) => {
    await login(page, '9000000001')
    await expect(page).toHaveURL(/\/app$/)
    await page.goto('/app/purchase-orders/new')
    await page.locator('#po-sup').selectOption({ label: /Sample Distributors/ as unknown as string })
      .catch(async () => page.locator('#po-sup').selectOption({ index: 1 }))
    await page.getByLabel('Add product').fill('Assam')
    await page.getByRole('option', { name: /Assam Tea/ }).first().click()
    await page.getByLabel('Quantity of Assam Tea 1kg').fill('20')
    await page.getByRole('button', { name: 'Send to supplier' }).click()
    await expect(page.getByText('Sent to supplier')).toBeVisible()
    const heading = page.getByRole('heading', { level: 1, name: /PO\// })
    await expect(heading).toBeVisible()
    poNumber = (await heading.textContent())?.match(/PO\/[\d-]+\/\d+/)?.[0] ?? ''
    expect(poNumber).toMatch(/^PO\//)
  })

  test('supplier quotes a new rate in the supplier portal', async ({ page }) => {
    await login(page, '9000000010')
    await expect(page).toHaveURL(/\/supplier$/)
    await page.getByText(poNumber).click()
    await expect(page.getByRole('heading', { name: new RegExp(poNumber) })).toBeVisible()
    await page.getByLabel('Your rate').first().fill('305')
    await page.getByLabel('Message to the buyer').fill('Fresh stock, delivery in 2 days')
    await page.getByRole('button', { name: 'Send quotation' }).click()
    await expect(page.getByText('Quotation sent').first()).toBeVisible()
  })

  test('owner accepts the quotation and receives the goods', async ({ page }) => {
    await login(page, '9000000001')
    await expect(page).toHaveURL(/\/app$/)
    await page.goto('/app/purchase-orders')
    await page.getByText(poNumber).click()
    await expect(page.getByText('Quotation received')).toBeVisible()
    await expect(page.getByText(/rate ₹320\.00 → ₹305\.00|rate .* → ₹305/).first()).toBeVisible()
    await page.getByRole('button', { name: 'Accept', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: /Accept 1 line/ }).click()
    await expect(page.getByText('Quotation accepted')).toBeVisible()
    await page.getByRole('button', { name: 'Receive goods' }).click()
    await page.getByRole('dialog').getByLabel('Supplier invoice no.').fill('SD-INV-77')
    await page.getByRole('dialog').getByRole('button', { name: 'Receive & post' }).click()
    await expect(page.getByText('Goods received')).toBeVisible()
    await expect(page.getByText(/GRN\//).first()).toBeVisible()
    await expect(page.getByText('Received', { exact: true }).first()).toBeVisible()
  })
})
