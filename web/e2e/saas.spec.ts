import { expect, test } from '@playwright/test'
import { login } from './helpers'

/**
 * SaaS operations (architecture §0B.14): a business signs up from the public page, the Super Admin (+919000000009)
 * approves it and the owner signs in; the demo tenant's owner sees branches and moves stock to the godown
 * (dev seed V9005).
 */
test.describe.serial('self-signup approved by the Super Admin', () => {
  const mobile = `7${String(Date.now()).slice(-9)}`
  const business = `E2E Traders ${mobile.slice(-4)}`
  let otpSentAt = 0

  test('a business owner signs up', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('link', { name: 'Get ShopFlow for your business' }).click()
    await expect(page).toHaveURL(/\/signup$/)
    await page.getByLabel('Your mobile number').fill(mobile)
    await page.getByRole('button', { name: 'Send OTP' }).click()
    otpSentAt = Date.now()
    await expect(page.getByLabel('Business name')).toBeVisible()
    const res = await page.request.get(`/api/v1/dev/otp/latest?mobileNumber=${mobile}`)
    const otp = (await res.json()).data.otp as string
    await page.getByLabel('Digit 1').click()
    await page.keyboard.type(otp)
    await page.getByLabel('Business name').fill(business)
    await page.getByLabel('Your name').fill('E2E Owner')
    await page.getByLabel('Trade').selectOption('HARDWARE')
    await page.getByRole('button', { name: 'Send request' }).click()
    await expect(page.getByText('Request received')).toBeVisible()
  })

  test('the Super Admin approves it and the owner signs in', async ({ page }) => {
    await login(page, '9000000009')
    await expect(page).toHaveURL(/\/platform/)
    await page.goto('/platform/signups')
    await page.getByText(business).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Approve & create business' }).click()
    await expect(page.getByText('Business created')).toBeVisible()
    await page.goto('/platform/tenants')
    await expect(page.getByText(business)).toBeVisible()

    await page.context().clearCookies()
    // The server allows a new OTP for the same number 30 s after the sign-up one.
    await page.waitForTimeout(Math.max(0, otpSentAt + 31_000 - Date.now()))
    await login(page, mobile)
    await expect(page).toHaveURL(/\/app$/)
    await expect(page.getByText(business).first()).toBeVisible()
  })
})

test('owner moves stock to the godown', async ({ page }) => {
  await login(page, '9000000001')
  await expect(page).toHaveURL(/\/app$/)
  await expect(page.getByLabel('Working branch')).toBeVisible()
  await page.goto('/app/branches')
  await expect(page.getByRole('table').getByText('Central Godown')).toBeVisible()
  await page.getByRole('button', { name: 'Transfer stock' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('From').selectOption({ label: 'Main branch' })
  await dialog.getByLabel('To').selectOption({ label: 'Central Godown' })
  await dialog.getByLabel('Add product').fill('Assam')
  await page.getByRole('option', { name: /Assam Tea/ }).first().click()
  await dialog.getByRole('button', { name: 'Move stock' }).click()
  await expect(page.getByText('Stock moved')).toBeVisible()
  await expect(page.getByText(/ST\//).first()).toBeVisible()
  await page.getByRole('tab', { name: 'Stock by branch' }).click()
  await page.getByLabel('Branch', { exact: true }).selectOption({ label: 'Central Godown' })
  await expect(page.getByText('Assam Tea 1kg')).toBeVisible()
})
