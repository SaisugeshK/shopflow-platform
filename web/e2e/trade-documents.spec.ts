import { expect, test } from '@playwright/test'
import { login } from './helpers'

/**
 * Trade documents (architecture §0B.9): the owner quotes Ravi General Stores, issues a delivery challan and invoices it
 * (no second stock movement), adds a test e-way bill and sees the agent's commission; the customer accepts the
 * quotation from their account, which places the order. Dev seed V9004 switches the modules on for tenant "main" and
 * links Ravi to the agent "Suresh Brokers".
 */
test.describe.serial('quotation, challan, e-way bill and commission', () => {
  let quotation = ''

  test('owner quotes, issues a challan, invoices it and adds an e-way bill', async ({ page }) => {
    await login(page, '9000000001')
    await expect(page).toHaveURL(/\/app$/)

    // Quotation, saved and sent.
    await page.goto('/app/quotations/new')
    await page.locator('#qt-cs').fill('Ravi')
    await expect(page.locator('#qt-c option', { hasText: 'Ravi General Stores' })).toHaveCount(1)
    await page.locator('#qt-c').selectOption({ index: 1 })
    await page.getByLabel('Add product').fill('Assam')
    await page.getByRole('option', { name: /Assam Tea/ }).first().click()
    await page.getByLabel('Quantity of Assam Tea 1kg').fill('3')
    await page.getByLabel('Rate of Assam Tea 1kg').fill('300')
    await page.getByRole('button', { name: 'Save & send' }).click()
    await expect(page.getByText('Quotation sent')).toBeVisible()
    const heading = page.getByRole('heading', { level: 1, name: /QT\// })
    await expect(heading).toBeVisible()
    quotation = (await heading.textContent())?.match(/QT\/[\d-]+\/\d+/)?.[0] ?? ''
    expect(quotation).toMatch(/^QT\//)

    // Delivery challan, then its invoice.
    await page.goto('/app/delivery-challans/new')
    await page.locator('#dc-cs').fill('Ravi')
    await expect(page.locator('#dc-c option', { hasText: 'Ravi General Stores' })).toHaveCount(1)
    await page.locator('#dc-c').selectOption({ index: 1 })
    await page.locator('#dc-v').fill('tn09bx4455')
    await page.getByLabel('Add product').fill('Assam')
    await page.getByRole('option', { name: /Assam Tea/ }).first().click()
    await page.getByLabel('Quantity of Assam Tea 1kg').fill('2')
    await page.getByRole('button', { name: 'Issue challan' }).click()
    await expect(page.getByText('Challan issued')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: /DC\// })).toBeVisible()
    await page.getByRole('button', { name: 'Create invoice' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Generate invoice' }).click()
    await expect(page).toHaveURL(/\/app\/invoices\/[0-9a-f-]+$/)
    await expect(page.getByText('Delivery challan', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Suresh Brokers')).toBeVisible()

    // E-way bill (mock provider → flagged as a test number).
    await page.getByRole('button', { name: 'E-way bill' }).click()
    await page.getByRole('dialog').getByLabel('Distance (km)').fill('350')
    await page.getByRole('dialog').getByRole('button', { name: 'Generate' }).click()
    await expect(page.getByText('E-way bill generated')).toBeVisible()
    await expect(page.getByText('TEST ONLY e-way bill')).toBeVisible()

    // The agent's pending commission is listed.
    await page.goto('/app/agents')
    await page.getByRole('tab', { name: 'Commission' }).click()
    await expect(page.getByRole('table').getByText('Suresh Brokers').first()).toBeVisible()
  })

  test('customer accepts the quotation and an order is placed', async ({ page }) => {
    await login(page, '9000000003')
    await expect(page).toHaveURL(/\/shop/)
    await page.goto('/shop/quotations')
    await page.getByText(quotation).click()
    await page.getByRole('button', { name: 'Accept', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Accept & place order' }).click()
    await expect(page.getByText('Order placed')).toBeVisible()
    await expect(page).toHaveURL(/\/shop\/orders\/[0-9a-f-]+$/)
  })
})
