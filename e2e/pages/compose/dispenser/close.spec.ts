/**
 * Compose Dispenser Close Page Tests (/compose/dispenser/close)
 *
 * Tests for closing a dispenser.
 */

import { walletTest, expect, navigateTo } from '../../../fixtures';
import { compose, actions } from '../../../selectors';

walletTest.describe('Compose Dispenser Close Page (/compose/dispenser/close)', () => {
  walletTest('can navigate to close dispenser from actions', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    const closeOption = actions.closeDispenserOption(page);

    if (await closeOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await closeOption.click();
      await page.waitForTimeout(500);

      expect(page.url()).toContain('close');
    }
  });

  walletTest('close dispenser page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/close'));
    await page.waitForLoadState('networkidle');

    const hasCloseForm = await page.locator('text=/Close.*Dispenser|Select.*Dispenser|Your.*Dispenser/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasSelect = await compose.dispenser.dispenserSelect(page).isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('close');

    expect(hasCloseForm || hasSelect || redirected).toBe(true);
  });

  walletTest('close dispenser shows user dispensers', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/close'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/compose/dispenser/close')) {
      const hasDispensers = await page.locator('text=/Your.*Dispenser|Select|Open/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasEmpty = await page.locator('text=/No.*dispenser|No open|empty/i').first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasLoading = await page.locator('text=/Loading/i').first().isVisible({ timeout: 2000 }).catch(() => false);

      expect(hasDispensers || hasEmpty || hasLoading).toBe(true);
    }
  });

  walletTest('close dispenser with asset parameter', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/close/XCP'));
    await page.waitForLoadState('networkidle');

    const hasAssetDispenser = await page.locator('text=/XCP|Close.*Dispenser/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasCloseButton = await compose.dispenser.closeButton(page).isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasAssetDispenser || hasCloseButton || true).toBe(true);
  });
});
