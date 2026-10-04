import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * Signs in through the real OTP screens. The OTP comes from the demo-mode toast when the server shows it,
 * otherwise from the backend's development-only endpoint.
 * If the server's resend cooldown is active (e.g. tests re-run quickly), waits it out and retries.
 */
export async function login(page: Page, mobile10: string, path = '/login') {
  await page.goto(path)
  await page.getByLabel('Mobile number').fill(mobile10)
  const heading = page.getByRole('heading', { name: 'Verify OTP' })
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.getByRole('button', { name: 'Send OTP' }).click()
    const alert = page.getByRole('alert')
    await expect(heading.or(alert)).toBeVisible()
    if (await heading.isVisible()) break
    // The alert may disappear again (e.g. the OTP screen replaced it); then just re-check.
    const text = (await alert.first().textContent({ timeout: 2000 }).catch(() => '')) ?? ''
    if (!text && (await heading.isVisible())) break
    const seconds = Number(/wait (\d+) seconds/.exec(text)?.[1] ?? (text ? 'NaN' : '1'))
    if (Number.isNaN(seconds)) throw new Error(`OTP request failed: ${text}`)
    await page.waitForTimeout((seconds + 1) * 1000)
  }
  await expect(heading).toBeVisible()
  const demo = page.getByText(/^Demo OTP: \d{6}$/).last()
  let otp: string
  if (await demo.isVisible()) {
    otp = /\d{6}/.exec((await demo.textContent()) ?? '')![0]
  } else {
    const res = await page.request.get(`/api/v1/dev/otp/latest?mobileNumber=${mobile10}`)
    expect(res.ok()).toBeTruthy()
    otp = (await res.json()).data.otp
  }
  await page.getByLabel('Digit 1').click()
  await page.keyboard.type(otp)
}
