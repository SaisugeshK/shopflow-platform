import { expect, test } from '@playwright/test'
import { go, login, toast } from './helpers'

/**
 * Mobile acceptance journeys (Stage 5) with the dev seed accounts (fictitious data):
 * customer catalog → cart → checkout, staff order workflow → invoice → payment, customer sees the invoice,
 * and role/permission checks.
 */
test.describe.serial('order to cash on mobile', () => {
  let orderNumber = ''
  let invoiceNumber = ''

  test('customer adds a product to the cart and places a cash order', async ({ page }) => {
    await login(page, '9000000003')
    await expect(page).toHaveURL(/\/shop$/)
    await expect(page.getByText(/Good (morning|afternoon|evening), Ravi/)).toBeVisible()

    await go(page, '/shop/products')
    await page.getByLabel('Search by name or SKU').fill('Tea')
    const add = page.getByRole('button', { name: 'Add Assam Tea 1kg to cart' })
    await expect(add).toBeVisible()
    await add.click()
    await toast(page, 'Added to cart')

    await go(page, '/shop/cart')
    await expect(page.getByText('Assam Tea 1kg').first()).toBeVisible()
    await page.getByRole('button', { name: 'Proceed to checkout' }).click()
    await expect(page).toHaveURL(/\/shop\/checkout/)
    await page.getByRole('radio', { name: 'Cash on delivery' }).click()
    await page.getByRole('button', { name: /^Place order/ }).click()
    await expect(page.getByText('Order placed', { exact: true })).toBeVisible()
    const text = await page.getByText(/^Order ORD\//).first().textContent()
    orderNumber = /ORD\/\S+/.exec(text ?? '')?.[0] ?? ''
    expect(orderNumber).toMatch(/^ORD\//)

    await page.getByRole('button', { name: 'Track order' }).click()
    await expect(page).toHaveURL(/\/shop\/order\//)
    await expect(page.getByText('Order placed').first()).toBeVisible()
  })

  test('admin accepts, packs, dispatches, delivers, invoices and records payment', async ({ page }) => {
    await login(page, '9000000002')
    await expect(page).toHaveURL(/\/admin$/)
    await go(page, '/admin/orders')
    await page.getByLabel('Order number or customer').fill(orderNumber)
    await page.getByRole('button', { name: new RegExp(`^Order ${orderNumber.replace(/\//g, '\\/')}`) }).click()
    await expect(page).toHaveURL(/\/admin\/order\//)

    await page.getByRole('button', { name: 'Accept order' }).click()
    await page.getByRole('button', { name: 'Accept order' }).last().click()
    await toast(page, orderNumber)
    await expect(page.getByRole('button', { name: 'Start packing' })).toBeVisible()

    await page.getByRole('button', { name: 'Start packing' }).click()
    await expect(page.getByRole('button', { name: 'Ready for delivery' })).toBeVisible()
    await page.getByRole('button', { name: 'Ready for delivery' }).click()
    await expect(page.getByRole('button', { name: 'Dispatch' })).toBeVisible()
    await page.getByRole('button', { name: 'Dispatch' }).click()
    await page.getByLabel('Delivery person', { exact: true }).fill('Kumar')
    await page.getByRole('button', { name: 'Dispatch' }).last().click()
    await expect(page.getByRole('button', { name: 'Mark delivered' })).toBeVisible()
    await page.getByRole('button', { name: 'Mark delivered' }).click()
    await page.getByLabel('Received by').fill('Ravi')
    await page.getByRole('button', { name: 'Confirm delivery' }).click()
    await expect(page.getByRole('button', { name: 'Complete order' })).toBeVisible()

    await page.getByRole('button', { name: 'Generate invoice' }).click()
    await toast(page, 'Invoice generated')
    await expect(page).toHaveURL(/\/admin\/invoice\//)
    const toastText = await page.getByTestId('toast-title').filter({ hasText: 'Invoice generated' }).first().locator('..').innerText()
    invoiceNumber = /INV\/\S+/.exec(toastText)?.[0] ?? ''

    // Customer credit left over from earlier runs may already settle the invoice on generation.
    const record = page.getByRole('button', { name: 'Record payment' })
    if (await record.isVisible({ timeout: 3000 }).catch(() => false)) {
      await record.click()
      await page.getByRole('button', { name: 'Record payment' }).last().click()
      await toast(page, 'Payment recorded')
    }
    await expect(page.getByText('Paid', { exact: true }).filter({ visible: true }).first()).toBeVisible()
  })

  test('customer sees the delivered order invoice', async ({ page }) => {
    await login(page, '9000000003')
    await go(page, '/shop/invoices')
    await expect(page.getByText(invoiceNumber || /INV\//).first()).toBeVisible()
  })
})

test('admin does not see owner-only screens', async ({ page }) => {
  await login(page, '9000000002')
  await go(page, '/admin/more')
  await expect(page.getByText('Users & permissions')).toHaveCount(0)
  await expect(page.getByText('Audit logs')).toHaveCount(0)
  await go(page, '/admin/audit')
  await expect(page.getByText('No access')).toBeVisible()
})

test('new retailer registers and waits for approval', async ({ page }) => {
  // A fresh fictitious number each run, so the test does not depend on seed customers' current status.
  const mobile = `98${String(Date.now()).slice(-8)}`
  await login(page, mobile)
  await expect(page).toHaveURL(/\/register$/)
  await page.getByLabel('Shop or business name').fill('E2E Test Traders')
  await page.getByLabel('Owner or contact person').fill('Test Owner')
  await page.getByLabel('Address line 1').fill('1 Test Street')
  await page.getByLabel('City').fill('Chennai')
  await page.getByLabel('Pincode').fill('600001')
  await page.getByRole('button', { name: 'Submit registration' }).click()
  await expect(page).toHaveURL(/\/registration-status$/)
  await expect(page.getByText('Registration received')).toBeVisible()
})

test('customer pays online through the mock gateway', async ({ page }) => {
  await login(page, '9000000003')
  await go(page, '/shop/products')
  await page.getByLabel('Search by name or SKU').fill('Coffee')
  await page.getByRole('button', { name: 'Add Filter Coffee 500g to cart' }).click()
  await toast(page, 'Added to cart')
  await go(page, '/shop/checkout')
  await page.getByRole('radio', { name: 'Pay online now' }).click()
  await page.getByRole('button', { name: /^Place order & pay/ }).click()
  await expect(page.getByText('Test payment gateway')).toBeVisible()
  await page.getByRole('button', { name: 'Pay now' }).click()
  await toast(page, 'Payment successful')
  await expect(page).toHaveURL(/\/shop\/order\//)
  await expect(page.getByText('Paid', { exact: true }).filter({ visible: true }).first()).toBeVisible()
})
