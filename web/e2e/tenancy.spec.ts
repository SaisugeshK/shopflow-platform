import { expect, test } from '@playwright/test'
import { login } from './helpers'

/**
 * Multi-tenancy (architecture §0B): the Super Admin registers a business and manages its modules and support view;
 * a number in two businesses chooses and switches; a join link registers a retailer with that business.
 * Uses the dev seed (+919000000009 super admin, +919000000005 in two businesses, tenant "kaveri-build").
 */

/** A fresh fictitious mobile that avoids the mock providers' failure suffixes. */
function freshMobile() {
  let tail = ''
  do {
    tail = String(Math.floor(Math.random() * 1e8)).padStart(8, '0')
  } while (/(0000|1111|8888|9999)$/.test(tail))
  return `97${tail}`
}

test.describe.serial('super admin console', () => {
  const ownerMobile = freshMobile()
  const name = `E2E Hardware ${ownerMobile.slice(-4)}`

  test('registers a business, switches a module off and opens a read-only support view', async ({ page }) => {
    await login(page, '9000000009')
    await expect(page).toHaveURL(/\/platform$/)
    await expect(page.getByRole('heading', { name: 'Platform overview' })).toBeVisible()

    await page.goto('/platform/tenants/new')
    await page.getByLabel('Business name').fill(name)
    await page.getByLabel('Industry').selectOption('HARDWARE')
    await page.getByLabel('City').fill('Coimbatore')
    await page.getByLabel('Owner name').fill('E2E Owner')
    await page.getByLabel('Owner mobile').fill(ownerMobile)
    await page.getByRole('button', { name: 'Register business' }).click()
    await expect(page.getByRole('heading', { name })).toBeVisible()
    await expect(page.getByText('Owner logins')).toBeVisible()

    await page.locator('label', { hasText: 'Sales and purchase returns' }).click()
    await expect(page.getByText('Modules updated')).toBeVisible()
    await expect(page.getByRole('switch', { name: 'Sales and purchase returns' })).not.toBeChecked()

    await page.getByRole('button', { name: 'Support view' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Reason').fill('E2E check of the read-only support view')
    await dialog.getByRole('button', { name: 'Open read-only view' }).click()
    await expect(page).toHaveURL(/\/app$/)
    await expect(page.getByText(/Support view of/)).toBeVisible()
    await page.getByRole('button', { name: 'Exit support view' }).click()
    await expect(page).toHaveURL(/\/platform$/)
  })

  test('the new owner signs in to their own business without the switched-off module', async ({ page }) => {
    await login(page, ownerMobile)
    await expect(page).toHaveURL(/\/app$/)
    await expect(page.locator('.sidebar-brand')).toContainText(name)
    await page.getByRole('button', { name: 'Billing' }).click()
    await expect(page.getByRole('link', { name: 'Invoices' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sales Returns' })).toHaveCount(0)
    // The owner can see that support looked at the business.
    await page.goto('/app/audit')
    await expect(page.getByText(/Support Access Started/i).first()).toBeVisible()
  })
})

test('a number in two businesses chooses one and switches to the other', async ({ page }) => {
  await login(page, '9000000005')
  await expect(page.getByRole('heading', { name: 'Choose a business' })).toBeVisible()
  await page.getByRole('button', { name: /Sri Lakshmi Textiles/ }).click()
  await expect(page).toHaveURL(/\/app$/)
  await expect(page.locator('.sidebar-brand')).toContainText('Sri Lakshmi Textiles')

  await page.locator('.user-chip').click()
  await page.getByRole('button', { name: /Demo Wholesale Traders/ }).click()
  await expect(page.getByText('Switched to Demo Wholesale Traders')).toBeVisible()
  await expect(page.locator('.sidebar-brand')).toContainText('Demo Wholesale Traders')
})

test('a join link registers a new retailer with that business', async ({ page }) => {
  await login(page, freshMobile(), '/join/kaveri-build')
  await expect(page).toHaveURL(/\/register$/)
  await expect(page.getByText(/registering with/)).toContainText('Kaveri Building Materials')
})

test('an unknown join link explains itself', async ({ page }) => {
  await page.goto('/join/no-such-shop')
  await expect(page.getByText('Link not found')).toBeVisible()
})
