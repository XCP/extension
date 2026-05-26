/**
 * Manage Pools Page Tests (/pools)
 *
 * Tests the pool entry point and position list using mocked Counterparty pool data.
 */

import { walletTest, expect } from '@e2e/fixtures';
import { enableValidationBypass } from '../../compose-test-helpers';

walletTest.describe('Manage Pools Page (/pools)', () => {
  walletTest.beforeEach(async ({ page }) => {
    await enableValidationBypass(page);
  });

  walletTest('lists LP positions and opens the position page', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/pools'));
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('PEPECASH / XCP')).toBeVisible({ timeout: 10000 });

    await page.getByRole('button').filter({ hasText: 'PEPECASH / XCP' }).first().click();
    await expect(page).toHaveURL(/\/pools\/A\d+/, { timeout: 5000 });
  });

  walletTest('Enter Pool opens the pool deposit flow', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/pools'));
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /Enter Pool/i }).first().click();
    await expect(page).toHaveURL(/compose\/pool\/deposit/, { timeout: 5000 });
  });
});
