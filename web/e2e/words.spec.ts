import { expect, test } from '@playwright/test'
import { login } from './helpers'

/**
 * Industry words and units (architecture §0B.15). Dev seed: +919000000005 owns "Sri Lakshmi Textiles" (textile), where
 * products are "Articles", customers "Dealers" and suppliers "Mills", and units are the textile ones.
 */
test('a textile business sees its own words and units', async ({ page }) => {
  await login(page, '9000000005', '/join/sri-textiles')
  await expect(page).toHaveURL(/\/app/)
  const nav = page.locator('aside.sidebar')
  await expect(nav.getByText('Articles').first()).toBeVisible()
  await expect(nav.getByText('Dealers').first()).toBeVisible()
  await expect(nav.getByText('Mills')).toBeVisible()
  await page.goto('/app/products')
  await expect(page.getByRole('heading', { level: 1, name: 'Articles' })).toBeVisible()
  await page.goto('/app/products/new')
  await expect(page.locator('#unit option').first()).toBeAttached()
  const units = await page.locator('#unit option').allTextContents()
  expect(units).toContain('Roll (ROLL)')
  expect(units).toContain('Metre (M)')
  expect(units).not.toContain('Bag (BAG)')
  await page.goto('/app/settings')
  await page.getByRole('tab', { name: 'Words & units' }).click()
  await expect(page.getByText('Industry word: Dealer', { exact: true })).toBeVisible()
})

test('a general business keeps the usual words', async ({ page }) => {
  await login(page, '9000000002')
  await expect(page).toHaveURL(/\/app$/)
  await expect(page.locator('aside.sidebar').getByText('Products').first()).toBeVisible()
})
