/**
 * Pool Position Page Tests (/pools/:lpAsset)
 */

import { walletTest, expect } from '@e2e/fixtures';
import { enableValidationBypass } from '../../compose-test-helpers';

walletTest.describe('Pool Position Page (/pools/:lpAsset)', () => {
  walletTest.beforeEach(async ({ page }) => {
    await enableValidationBypass(page);
  });

  walletTest('shows pool details and action buttons', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/pools/A95428956661682177'));
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'PEPECASH / XCP' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Reserve PEPECASH')).toBeVisible();
    await expect(page.getByText('Reserve XCP')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Deposit' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Withdraw' })).toBeVisible();
  });

  walletTest('Deposit opens the prefilled pool deposit flow', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/pools/A95428956661682177'));
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Deposit' }).click();
    await expect(page).toHaveURL(/compose\/pool\/deposit\/XCP\/PEPECASH/, { timeout: 5000 });
  });

  walletTest('Withdraw opens the pool withdraw flow', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/pools/A95428956661682177'));
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Withdraw' }).click();
    await expect(page).toHaveURL(/compose\/pool\/withdraw\/A95428956661682177/, { timeout: 5000 });
  });
});
