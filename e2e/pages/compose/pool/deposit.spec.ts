/**
 * Compose Pool Deposit Page Tests (/compose/pool/deposit)
 */

import { walletTest, expect } from '@e2e/fixtures';
import { compose } from '@e2e/selectors';
import {
  clickBack,
  enableDryRun,
  enableValidationBypass,
  waitForReview,
} from '../../../compose-test-helpers';

walletTest.describe('Pool Deposit Flow - Full Compose Flow', () => {
  walletTest.beforeEach(async ({ page }) => {
    await enableValidationBypass(page);
    await enableDryRun(page);
  });

  // TODO(e2e): compose→review for this pair doesn't complete in headless CI; revisit.
  walletTest.fixme('prefilled pair can quote and reach review', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/pool/deposit/XCP/PEPECASH'));
    await page.waitForLoadState('networkidle');

    await expect(compose.pool.assetAAmountInput(page)).toBeVisible({ timeout: 10000 });
    await compose.pool.assetAAmountInput(page).fill('1');
    await compose.pool.assetBAmountInput(page).fill('0.5');

    await expect(page.getByText(/Quoted partner amount/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Minimum LP tokens/i)).toBeVisible({ timeout: 10000 });

    const submitBtn = compose.pool.depositButton(page);
    await expect(submitBtn).toBeEnabled({ timeout: 10000 });
    await submitBtn.click();

    await waitForReview(page);
    await expect(page.getByText('PEPECASH / XCP')).toBeVisible();
    await expect(page.getByText(/Minimum LP/i)).toBeVisible();
  });

  // TODO(e2e): form state after back-from-review is flaky in headless CI; revisit.
  walletTest.fixme('form data is preserved after returning from review', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/pool/deposit/XCP/PEPECASH'));
    await page.waitForLoadState('networkidle');

    await compose.pool.assetAAmountInput(page).fill('1');
    await compose.pool.assetBAmountInput(page).fill('0.5');

    await expect(compose.pool.depositButton(page)).toBeEnabled({ timeout: 10000 });
    await compose.pool.depositButton(page).click();
    await waitForReview(page);

    await clickBack(page);

    await expect(compose.pool.assetAAmountInput(page)).toHaveValue('1');
    await expect(compose.pool.assetBAmountInput(page)).toHaveValue('0.5');
  });

  walletTest('Use quote fills the partner asset amount', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/pool/deposit/XCP/PEPECASH'));
    await page.waitForLoadState('networkidle');

    await compose.pool.assetAAmountInput(page).fill('1');
    await expect(compose.pool.useQuoteButton(page)).toBeVisible({ timeout: 10000 });
    await compose.pool.useQuoteButton(page).click();

    await expect(compose.pool.assetBAmountInput(page)).toHaveValue('0.5');
  });
});
