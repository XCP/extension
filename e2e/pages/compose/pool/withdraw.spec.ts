/**
 * Compose Pool Withdraw Page Tests (/compose/pool/withdraw/:lpAsset)
 */

import { walletTest, expect } from '@e2e/fixtures';
import { compose } from '@e2e/selectors';
import {
  clickBack,
  enableDryRun,
  enableValidationBypass,
  waitForReview,
} from '../../../compose-test-helpers';

walletTest.describe('Pool Withdraw Flow - Full Compose Flow', () => {
  walletTest.beforeEach(async ({ page }) => {
    await enableValidationBypass(page);
    await enableDryRun(page);
  });

  walletTest('LP position can quote and reach review', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/pool/withdraw/A95428956661682177'));
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('PEPECASH / XCP')).toBeVisible({ timeout: 10000 });
    await expect(compose.pool.lpWithdrawInput(page)).toBeVisible({ timeout: 10000 });
    await compose.pool.lpWithdrawInput(page).fill('0.1');

    await expect(page.getByText(/Estimated receive/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Minimum received/i)).toBeVisible({ timeout: 10000 });

    const submitBtn = compose.pool.withdrawButton(page);
    await expect(submitBtn).toBeEnabled({ timeout: 10000 });
    await submitBtn.click();

    await waitForReview(page);
    await expect(page.getByText('PEPECASH / XCP')).toBeVisible();
    await expect(page.getByText(/Minimum Receive/i)).toBeVisible();
  });

  walletTest('form data is preserved after returning from review', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/pool/withdraw/A95428956661682177'));
    await page.waitForLoadState('networkidle');

    await compose.pool.lpWithdrawInput(page).fill('0.1');
    await expect(compose.pool.withdrawButton(page)).toBeEnabled({ timeout: 10000 });
    await compose.pool.withdrawButton(page).click();
    await waitForReview(page);

    await clickBack(page);

    await expect(compose.pool.lpWithdrawInput(page)).toHaveValue('0.1');
  });
});
