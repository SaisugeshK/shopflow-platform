import { expect, test } from '@playwright/test'
import { go, login } from './helpers'

/**
 * Trade documents on the app (architecture §0B.9). Dev seed V9004 switches the modules on for tenant "main" and creates
 * the project "New branch fit-out" for Ravi General Stores (+919000000003).
 */
test('staff see quotations, challans, job work, projects and agents', async ({ page }) => {
  await login(page, '9000000002')
  await go(page, '/admin/more')
  for (const item of ['Quotations', 'Delivery challans', 'Job work', 'Projects / sites', 'Agents & commission']) {
    await expect(page.getByText(item, { exact: true })).toBeVisible()
  }
  await go(page, '/admin/projects')
  await expect(page.getByText('New branch fit-out')).toBeVisible()
  await page.getByText('New branch fit-out').click()
  await expect(page.getByText('Billed', { exact: true }).first()).toBeVisible()
  await go(page, '/admin/agents')
  await expect(page.getByText('Suresh Brokers')).toBeVisible()
  await go(page, '/admin/quotations')
  await expect(page.getByRole('button', { name: 'New quotation' })).toBeVisible()
})

test('a customer sees quotations and projects in their account', async ({ page }) => {
  await login(page, '9000000003')
  await page.waitForURL(/\/shop/)
  await go(page, '/shop/account')
  await expect(page.getByText('Quotations', { exact: true })).toBeVisible()
  await page.getByText('Projects', { exact: true }).click()
  await expect(page.getByText('New branch fit-out')).toBeVisible()
})
