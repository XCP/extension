/**
 * Manage Pools Page Tests (/pools)
 *
 * Tests the pool entry point and position list using mocked Counterparty pool data.
 */

import { walletTest, expect, navigateTo } from '@e2e/fixtures';
import { actions } from '@e2e/selectors';
import { enableValidationBypass } from '../../compose-test-helpers';

walletTest.describe('Manage Pools Page (/pools)', () => {
  walletTest.beforeEach(async ({ page }) => {
    await enableValidationBypass(page);
  });

  walletTest('can navigate to Manage Pools from actions', async ({ page }) => {
    await navigateTo(page, 'actions');

    await expect(actions.managePoolsOption(page)).toBeVisible({ timeout: 5000 });
    await actions.managePoolsOption(page).click();

    await expect(page).toHaveURL(/\/pools/, { timeout: 5000 });
    await expect(page.getByRole('button', { name: /Enter Pool/i }).first()).toBeVisible();
  });

  walletTest('lists LP positions and opens the position page', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/pools'));
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('PEPECASH / XCP')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('A95428956661682177')).toBeVisible();

    await page.getByRole('button').filter({ hasText: 'PEPECASH / XCP' }).first().click();
    await expect(page).toHaveURL(/\/pools\/A95428956661682177/, { timeout: 5000 });
  });

  walletTest('Enter Pool opens the pool deposit flow', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/pools'));
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /Enter Pool/i }).first().click();
    await expect(page).toHaveURL(/compose\/pool\/deposit/, { timeout: 5000 });
  });
});
