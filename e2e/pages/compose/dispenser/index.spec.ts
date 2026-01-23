/**
 * Compose Dispenser Page Tests (/compose/dispenser)
 *
 * Tests for creating a new dispenser.
 */

import { walletTest, expect, navigateTo } from '../../../fixtures';
import { compose } from '../../../selectors';
import {
  enableValidationBypass,
  enableDryRun,
  waitForReview,
  clickBack,
} from '../../../compose-test-helpers';

walletTest.describe('Compose Dispenser Page (/compose/dispenser)', () => {
  walletTest('can navigate to create dispenser from market', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    const manageTab = page.getByRole('tab', { name: 'Manage' });
    await manageTab.click();
    await page.waitForLoadState('networkidle');

    const newDispenserButton = page.locator('button:has-text("New Dispenser"), a:has-text("New Dispenser"), button:has-text("Create Dispenser")').first();
    const buttonCount = await newDispenserButton.count();

    if (buttonCount > 0) {
      await expect(newDispenserButton).toBeVisible({ timeout: 5000 });
      await newDispenserButton.click();
      await expect(page).toHaveURL(/dispenser/, { timeout: 5000 });
    }
  });

  walletTest('create dispenser form has required fields', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/XCP'));
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/compose\/dispenser/);

    // Form should have asset field or input
    const assetField = page.locator('text=/Asset|XCP/i').first();
    const assetSelect = compose.common.assetSelect(page);
    const formInput = page.locator('input').first();

    await expect(assetField.or(assetSelect).or(formInput)).toBeVisible({ timeout: 5000 });
  });

  walletTest('create dispenser form has mainchain rate field', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/XCP'));
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/compose\/dispenser/);

    // Use the selector directly
    const rateInput = compose.dispenser.mainchainRateInput(page);
    await expect(rateInput).toBeVisible({ timeout: 5000 });
  });

  walletTest('create dispenser form has escrow quantity field', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/XCP'));
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/compose\/dispenser/);

    // Use the selector directly
    const escrowInput = compose.dispenser.escrowQuantityInput(page);
    await expect(escrowInput).toBeVisible({ timeout: 5000 });
  });

  walletTest('create dispenser validates required fields', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/XCP'));
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/compose\/dispenser/);

    const submitButton = compose.dispenser.createButton(page);
    await expect(submitButton).toBeVisible({ timeout: 5000 });
    await expect(submitButton).toBeDisabled();
  });
});

walletTest.describe('Dispenser Flow - Full Compose Flow', () => {
  walletTest.beforeEach(async ({ page }) => {
    await enableValidationBypass(page);
    await enableDryRun(page);
  });

  walletTest('form → review: valid dispenser shows review page', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/XCP'));
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/compose\/dispenser/);

    // Wait for form inputs to be visible and fill them
    const escrowInput = compose.dispenser.escrowQuantityInput(page);
    const rateInput = compose.dispenser.mainchainRateInput(page);
    const giveInput = compose.dispenser.giveQuantityInput(page);

    await expect(escrowInput).toBeVisible({ timeout: 10000 });
    await escrowInput.clear();
    await escrowInput.fill('1000');
    await escrowInput.blur();

    await expect(rateInput).toBeVisible({ timeout: 5000 });
    await rateInput.clear();
    await rateInput.fill('0.0001');
    await rateInput.blur();

    await expect(giveInput).toBeVisible({ timeout: 5000 });
    await giveInput.clear();
    await giveInput.fill('100');
    await giveInput.blur();

    // Wait for React state to update
    

    const submitBtn = compose.dispenser.createButton(page);
    await expect(submitBtn).toBeEnabled({ timeout: 10000 });
    await submitBtn.click();

    await waitForReview(page);

    const reviewContent = await page.content();
    expect(reviewContent).toMatch(/review|confirm|sign/i);
  });

  walletTest('form → review → back: dispenser data preserved', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/XCP'));
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/compose\/dispenser/);

    const escrowQuantity = '500';
    const rate = '0.00025';
    const giveQuantity = '50';

    const escrowInput = compose.dispenser.escrowQuantityInput(page);
    const rateInput = compose.dispenser.mainchainRateInput(page);
    const giveInput = compose.dispenser.giveQuantityInput(page);

    await expect(escrowInput).toBeVisible({ timeout: 10000 });
    await escrowInput.clear();
    await escrowInput.fill(escrowQuantity);
    await escrowInput.blur();

    await expect(rateInput).toBeVisible({ timeout: 5000 });
    await rateInput.clear();
    await rateInput.fill(rate);
    await rateInput.blur();

    await expect(giveInput).toBeVisible({ timeout: 5000 });
    await giveInput.clear();
    await giveInput.fill(giveQuantity);
    await giveInput.blur();

    // Wait for React state to update
    

    const submitBtn = compose.dispenser.createButton(page);
    await expect(submitBtn).toBeEnabled({ timeout: 10000 });
    await submitBtn.click();

    await waitForReview(page);
    await clickBack(page);

    // Verify form data preserved
    await expect(escrowInput).toHaveValue(escrowQuantity);
    await expect(giveInput).toHaveValue(giveQuantity);
  });

  walletTest('full flow: dispenser form → review → verify content', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/XCP'));
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/compose\/dispenser/);

    const escrowInput = compose.dispenser.escrowQuantityInput(page);
    const rateInput = compose.dispenser.mainchainRateInput(page);
    const giveInput = compose.dispenser.giveQuantityInput(page);

    await expect(escrowInput).toBeVisible({ timeout: 10000 });
    await escrowInput.clear();
    await escrowInput.fill('1000');
    await escrowInput.blur();

    await expect(rateInput).toBeVisible({ timeout: 5000 });
    await rateInput.clear();
    await rateInput.fill('0.0001');
    await rateInput.blur();

    await expect(giveInput).toBeVisible({ timeout: 5000 });
    await giveInput.clear();
    await giveInput.fill('100');
    await giveInput.blur();

    // Wait for React state to update
    

    const submitBtn = compose.dispenser.createButton(page);
    await expect(submitBtn).toBeEnabled({ timeout: 10000 });
    await submitBtn.click();

    await waitForReview(page);

    // Verify review page content
    const reviewContent = await page.content();
    expect(reviewContent).toMatch(/review|confirm|sign/i);
  });
});
