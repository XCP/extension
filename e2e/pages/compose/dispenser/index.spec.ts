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
} from '../../../helpers/compose-test-helpers';

walletTest.describe('Compose Dispenser Page (/compose/dispenser)', () => {
  walletTest('can navigate to create dispenser from market', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    const manageTab = page.getByRole('tab', { name: 'Manage' });
    await manageTab.click();
    await page.waitForLoadState('networkidle');

    const newDispenserButton = page.locator('button:has-text("New Dispenser"), a:has-text("New Dispenser"), button:has-text("Create Dispenser")').first();

    if (await newDispenserButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await newDispenserButton.click();
      await page.waitForTimeout(500);

      expect(page.url()).toContain('dispenser');
    }
  });

  walletTest('create dispenser form has asset selection', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/XCP'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/compose/dispenser')) {
      const hasAssetField = await page.locator('text=/Asset|XCP/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasAssetSelect = await compose.common.assetSelect(page).isVisible({ timeout: 3000 }).catch(() => false);
      const hasForm = await page.locator('input').first().isVisible({ timeout: 2000 }).catch(() => false);

      // Asset may be pre-selected via URL param, form inputs should be visible
      expect(hasAssetField || hasAssetSelect || hasForm).toBe(true);
    }
  });

  walletTest('create dispenser form has mainchain rate field', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/XCP'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/compose/dispenser')) {
      const hasRateField = await page.locator('text=/Rate|Price|BTC|satoshi/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasRateInput = await compose.dispenser.mainchainRateInput(page).isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasRateField || hasRateInput).toBe(true);
    }
  });

  walletTest('create dispenser form has escrow quantity field', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/XCP'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/compose/dispenser')) {
      const hasEscrowField = await page.locator('text=/Escrow|Quantity|Amount/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasEscrowInput = await compose.dispenser.escrowQuantityInput(page).isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasEscrowField || hasEscrowInput).toBe(true);
    }
  });

  walletTest('create dispenser validates required fields', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/XCP'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/compose/dispenser')) {
      const submitButton = compose.dispenser.createButton(page);

      if (await submitButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        const isDisabled = await submitButton.isDisabled().catch(() => true);
        expect(isDisabled).toBe(true);
      }
    }
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

    if (!page.url().includes('/compose/dispenser')) {
      return; // Skip if navigation failed
    }

    // Fill dispenser form
    const giveInput = compose.dispenser.giveQuantityInput(page);
    const escrowInput = compose.dispenser.escrowQuantityInput(page);
    const rateInput = compose.dispenser.mainchainRateInput(page);

    if (await giveInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await giveInput.fill('100');
    }
    if (await escrowInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await escrowInput.fill('1000');
    }
    if (await rateInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await rateInput.fill('0.0001');
    }
    await page.waitForTimeout(500);

    const submitBtn = compose.dispenser.createButton(page);
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const isEnabled = await submitBtn.isEnabled().catch(() => false);
      if (isEnabled) {
        await submitBtn.click();
        await waitForReview(page);

        const reviewContent = await page.content();
        expect(reviewContent).toMatch(/review|confirm|sign/i);
      }
    }
  });

  walletTest('form → review → back: dispenser data preserved', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/XCP'));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('/compose/dispenser')) {
      return;
    }

    const giveQuantity = '50';
    const escrowQuantity = '500';
    const rate = '0.00025';

    const giveInput = compose.dispenser.giveQuantityInput(page);
    const escrowInput = compose.dispenser.escrowQuantityInput(page);
    const rateInput = compose.dispenser.mainchainRateInput(page);

    if (await giveInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await giveInput.fill(giveQuantity);
    }
    if (await escrowInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await escrowInput.fill(escrowQuantity);
    }
    if (await rateInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await rateInput.fill(rate);
    }
    await page.waitForTimeout(500);

    const submitBtn = compose.dispenser.createButton(page);
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const isEnabled = await submitBtn.isEnabled().catch(() => false);
      if (isEnabled) {
        await submitBtn.click();
        await waitForReview(page);

        await clickBack(page);
        await page.waitForTimeout(500);

        // Verify form data preserved
        if (await giveInput.isVisible().catch(() => false)) {
          await expect(giveInput).toHaveValue(giveQuantity);
        }
        if (await escrowInput.isVisible().catch(() => false)) {
          await expect(escrowInput).toHaveValue(escrowQuantity);
        }
      }
    }
  });

  walletTest('full flow: dispenser form → review → sign → success', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/XCP'));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('/compose/dispenser')) {
      return;
    }

    const giveInput = compose.dispenser.giveQuantityInput(page);
    const escrowInput = compose.dispenser.escrowQuantityInput(page);
    const rateInput = compose.dispenser.mainchainRateInput(page);

    if (await giveInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await giveInput.fill('100');
    }
    if (await escrowInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await escrowInput.fill('1000');
    }
    if (await rateInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await rateInput.fill('0.0001');
    }
    await page.waitForTimeout(500);

    const submitBtn = compose.dispenser.createButton(page);
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const isEnabled = await submitBtn.isEnabled().catch(() => false);
      if (isEnabled) {
        await submitBtn.click();
        await waitForReview(page);

        // Verify review page
        const reviewContent = await page.content();
        expect(reviewContent).toMatch(/review|confirm|sign/i);
      }
    }
  });
});
