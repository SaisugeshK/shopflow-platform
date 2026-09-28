import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * Signs in through the real OTP screens; the OTP is read from the backend's development-only endpoint.
 * If the server's resend cooldown is active (e.g. tests re-run quickly), waits it out and retries.
 */
export async function login(page: Page, mobile10: string) {
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(mobile10)
  const heading = page.getByRole('heading', { name: 'Verify OTP' })
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.getByRole('button', { name: 'Send OTP' }).click()
    const alert = page.getByRole('alert')
    await expect(heading.or(alert)).toBeVisible()
    if (await heading.isVisible()) break
    const text = (await alert.textContent()) ?? ''
    const seconds = Number(/wait (\d+) seconds/.exec(text)?.[1] ?? 'NaN')
    if (Number.isNaN(seconds)) throw new Error(`OTP request failed: ${text}`)
    await page.waitForTimeout((seconds + 1) * 1000)
  }
  await expect(heading).toBeVisible()
  const res = await page.request.get(`/api/v1/dev/otp/latest?mobileNumber=${mobile10}`)
  expect(res.ok()).toBeTruthy()
  const otp: string = (await res.json()).data.otp
  await page.getByLabel('Digit 1').click()
  await page.keyboard.type(otp)
}
