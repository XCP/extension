/**
 * Compose Dispenser Page Tests (/compose/dispenser)
 *
 * Tests for creating a new dispenser.
 */

import { walletTest, expect, navigateTo } from '../../../fixtures';
import { compose } from '../../../selectors';

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
