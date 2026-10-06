import { expect, test } from '@playwright/test'
import { go } from './helpers'

/** Industry words on the app (architecture §0B.15): the textile business (+919000000005) uses Articles/Dealers/Mills. */
test('a textile business sees its own words on the app', async ({ page }) => {
  // The join link signs straight into that business (this number also belongs to another one).
  await page.goto('/join/sri-textiles')
  await page.getByTestId('mobile-input').fill('9000000005')
  const demo = page.getByTestId('demo-otp')
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.getByRole('button', { name: 'Send OTP' }).click()
    if (await demo.waitFor({ timeout: 6000 }).then(() => true, () => false)) break
    const seconds = Number(/wait (\d+) second/i.exec(await page.locator('body').innerText())?.[1] ?? '5')
    await page.waitForTimeout((seconds + 1) * 1000)
  }
  await page.getByTestId('otp-input').fill((await demo.textContent())!.trim())
  await page.waitForURL(/\/admin/)
  await go(page, '/admin/more')
  await expect(page.getByText('Articles', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Mills', { exact: true }).first()).toBeVisible()
  await go(page, '/admin/product-form')
  await expect(page.getByText('Pieces (PCS)').first()).toBeVisible()
})
