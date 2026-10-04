import { expect, test, type Page } from '@playwright/test'
import { go } from './helpers'

/**
 * Multi-tenancy on the app (architecture §0B): choosing and switching businesses, join links, and the web-only
 * Super Admin console. Uses the dev seed (+919000000005 in two businesses, +919000000009 super admin).
 */

function freshMobile() {
  let tail = ''
  do {
    tail = String(Math.floor(Math.random() * 1e8)).padStart(8, '0')
  } while (/(0000|1111|8888|9999)$/.test(tail))
  return `96${tail}`
}

/** Mobile + OTP up to the point after verification (no URL assumption: a chooser may follow). */
async function signIn(page: Page, mobile10: string, path = '/') {
  await page.goto(path)
  await page.getByTestId('mobile-input').fill(mobile10)
  const demo = page.getByTestId('demo-otp')
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.getByRole('button', { name: 'Send OTP' }).click()
    if (await demo.waitFor({ timeout: 6000 }).then(() => true, () => false)) break
    const text = await page.locator('body').innerText()
    const seconds = Number(/wait (\d+) second/i.exec(text)?.[1] ?? 'NaN')
    if (Number.isNaN(seconds)) throw new Error(`OTP request failed: ${text.slice(0, 300)}`)
    await page.waitForTimeout((seconds + 1) * 1000)
  }
  await page.getByTestId('otp-input').fill((await demo.textContent())!.trim())
}

test('a number in two businesses chooses one, then switches from More', async ({ page }) => {
  await signIn(page, '9000000005')
  await expect(page.getByText('Choose a business')).toBeVisible()
  await page.getByRole('button', { name: 'Sri Lakshmi Textiles' }).click()
  await page.waitForURL(/\/admin/)
  await expect(page.getByText('Sri Lakshmi Textiles').first()).toBeVisible()

  await go(page, '/admin/more')
  await expect(page.getByText('Switch business')).toBeVisible()
  await page.getByRole('button', { name: 'Demo Wholesale Traders' }).click()
  await expect(page.getByText('Switched to Demo Wholesale Traders')).toBeVisible()
})

test('a join link registers a new retailer with that business', async ({ page }) => {
  await signIn(page, freshMobile(), '/join/kaveri-build')
  await page.waitForURL(/\/register/)
  await expect(page.getByText(/registering with Kaveri Building Materials/)).toBeVisible()
})
