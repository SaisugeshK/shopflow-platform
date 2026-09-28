import { expect, test } from '@playwright/test'
import { login } from './helpers'

/**
 * Critical web journeys (§75): customer login → catalog → cart → checkout, then staff accept → invoice → deliver →
 * payment, plus authorization checks. Uses the dev seed accounts (fictitious data).
 */
test.describe.serial('order to cash', () => {
  let orderNumber = ''

  test('customer browses, adds to cart and places a cash order', async ({ page }) => {
    await login(page, '9000000003')
    await expect(page).toHaveURL(/\/shop$/)
    await page.goto('/shop/products')
    await page.getByLabel('Search products').fill('Tea')
    const card = page.locator('article.product-card', { hasText: 'Assam Tea' })
    await expect(card).toBeVisible()
    await card.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByText('Added to cart')).toBeVisible()

    await page.goto('/shop/cart')
    await expect(page.getByText('Assam Tea 1kg')).toBeVisible()
    await page.getByRole('button', { name: 'Proceed to checkout' }).click()
    await page.getByLabel(/Cash on delivery/).check()
    await page.getByRole('button', { name: 'Place order' }).click()
    await expect(page.getByRole('heading', { name: 'Order placed' })).toBeVisible()
    orderNumber = (await page.locator('strong', { hasText: /^ORD\// }).first().textContent()) ?? ''
    expect(orderNumber).toMatch(/^ORD\//)
  })

  test('admin accepts, invoices, delivers and records payment', async ({ page }) => {
    await login(page, '9000000002')
    await expect(page).toHaveURL(/\/app$/)
    await page.goto('/app/orders?status=PLACED')
    await page.getByText(orderNumber).click()
    await expect(page.getByRole('heading', { name: orderNumber })).toBeVisible()
    await page.getByRole('button', { name: 'Accept', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Accept order' }).click()
    await expect(page.getByText('Now Accepted')).toBeVisible()

    await page.getByRole('button', { name: 'Generate invoice' }).click()
    await expect(page).toHaveURL(/\/app\/invoices\//)
    await expect(page.getByRole('heading', { name: /INV\// })).toBeVisible()
    await page.getByRole('link', { name: orderNumber }).click()

    await page.getByRole('button', { name: 'Start packing' }).click()
    await page.getByRole('button', { name: 'Ready for delivery' }).click()
    await page.getByRole('button', { name: 'Dispatch' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Dispatch' }).click()
    await page.getByRole('button', { name: 'Mark delivered' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm delivery' }).click()
    await expect(page.getByText('Now Delivered')).toBeVisible()

    await page.getByRole('button', { name: 'Record payment' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Record payment' }).click()
    await expect(page.getByText('Payment recorded')).toBeVisible()
  })
})

test('admin cannot open owner-only screens', async ({ page }) => {
  await login(page, '9000000002')
  await expect(page).toHaveURL(/\/app$/)
  await expect(page.getByRole('link', { name: 'Audit Logs' })).toHaveCount(0)
  await page.goto('/app/audit')
  await expect(page.getByText('Permission denied')).toBeVisible()
})

test('pending customer sees the registration status screen @mobile', async ({ page }) => {
  await login(page, '9000000004')
  await expect(page.getByRole('heading', { name: 'Registration received' })).toBeVisible()
})
