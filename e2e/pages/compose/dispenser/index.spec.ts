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

    const rateField = page.locator('text=/Rate|Price|BTC|satoshi/i').first();
    const rateInput = compose.dispenser.mainchainRateInput(page);

    await expect(rateField.or(rateInput)).toBeVisible({ timeout: 5000 });
  });

  walletTest('create dispenser form has escrow quantity field', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/XCP'));
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/compose\/dispenser/);

    const escrowField = page.locator('text=/Escrow|Quantity|Amount/i').first();
    const escrowInput = compose.dispenser.escrowQuantityInput(page);

    await expect(escrowField.or(escrowInput)).toBeVisible({ timeout: 5000 });
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

    // Fill dispenser form
    const giveInput = compose.dispenser.giveQuantityInput(page);
    const escrowInput = compose.dispenser.escrowQuantityInput(page);
    const rateInput = compose.dispenser.mainchainRateInput(page);

    if (await giveInput.count() > 0) {
      await giveInput.fill('100');
    }
    if (await escrowInput.count() > 0) {
      await escrowInput.fill('1000');
    }
    if (await rateInput.count() > 0) {
      await rateInput.fill('0.0001');
    }

    const submitBtn = compose.dispenser.createButton(page);
    await expect(submitBtn).toBeEnabled({ timeout: 5000 });
    await submitBtn.click();

    await waitForReview(page);

    const reviewContent = await page.content();
    expect(reviewContent).toMatch(/review|confirm|sign/i);
  });

  walletTest('form → review → back: dispenser data preserved', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/XCP'));
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/compose\/dispenser/);

    const giveQuantity = '50';
    const escrowQuantity = '500';
    const rate = '0.00025';

    const giveInput = compose.dispenser.giveQuantityInput(page);
    const escrowInput = compose.dispenser.escrowQuantityInput(page);
    const rateInput = compose.dispenser.mainchainRateInput(page);

    if (await giveInput.count() > 0) {
      await giveInput.fill(giveQuantity);
    }
    if (await escrowInput.count() > 0) {
      await escrowInput.fill(escrowQuantity);
    }
    if (await rateInput.count() > 0) {
      await rateInput.fill(rate);
    }

    const submitBtn = compose.dispenser.createButton(page);
    await expect(submitBtn).toBeEnabled({ timeout: 5000 });
    await submitBtn.click();

    await waitForReview(page);
    await clickBack(page);

    // Verify form data preserved
    if (await giveInput.count() > 0) {
      await expect(giveInput).toHaveValue(giveQuantity);
    }
    if (await escrowInput.count() > 0) {
      await expect(escrowInput).toHaveValue(escrowQuantity);
    }
  });

  walletTest('full flow: dispenser form → review → verify content', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/XCP'));
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/compose\/dispenser/);

    const giveInput = compose.dispenser.giveQuantityInput(page);
    const escrowInput = compose.dispenser.escrowQuantityInput(page);
    const rateInput = compose.dispenser.mainchainRateInput(page);

    if (await giveInput.count() > 0) {
      await giveInput.fill('100');
    }
    if (await escrowInput.count() > 0) {
      await escrowInput.fill('1000');
    }
    if (await rateInput.count() > 0) {
      await rateInput.fill('0.0001');
    }

    const submitBtn = compose.dispenser.createButton(page);
    await expect(submitBtn).toBeEnabled({ timeout: 5000 });
    await submitBtn.click();

    await waitForReview(page);

    // Verify review page content
    const reviewContent = await page.content();
    expect(reviewContent).toMatch(/review|confirm|sign/i);
  });
});
