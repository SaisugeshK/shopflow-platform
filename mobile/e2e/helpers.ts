import { expect, type Page } from '@playwright/test'

/**
 * Signs in through the real OTP screens. The code is read from the demo-mode label (dev profile shows the mock OTP);
 * if the server's resend cooldown is active, waits it out and retries.
 */
export async function login(page: Page, mobile10: string) {
  await page.goto('/')
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
  await page.waitForURL(/\/(admin|shop|registration-status|register)/)
}

/** In-app navigation (the browser build keeps the session in memory, so a full page load would sign out). */
export async function go(page: Page, path: string) {
  await page.evaluate((href) => {
    window.history.pushState({}, '', href)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
  await expect(page).toHaveURL(new RegExp(path.replace(/[?]/g, '\\?')))
}

export async function toast(page: Page, title: string | RegExp) {
  await expect(page.getByTestId('toast-title').filter({ hasText: title }).first()).toBeVisible()
}
