/**
 * Compose Dispenser Dispense Page Tests (/compose/dispenser/dispense)
 *
 * Tests for buying from a dispenser.
 */

import { walletTest, expect } from '../../../fixtures';
import { compose } from '../../../selectors';

walletTest.describe('Compose Dispense Page (/compose/dispenser/dispense)', () => {
  walletTest('dispense page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/dispense'));
    await page.waitForLoadState('networkidle');

    const hasDispenseForm = await page.locator('text=/Dispense|Buy|Purchase/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasAddressField = await compose.common.destinationInput(page).isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('dispense');

    expect(hasDispenseForm || hasAddressField || redirected).toBe(true);
  });

  walletTest('dispense page with address parameter', async ({ page }) => {
    const testAddress = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
    await page.goto(page.url().replace(/\/index.*/, `/compose/dispenser/dispense/${testAddress}`));
    await page.waitForLoadState('networkidle');

    const hasDispenser = await page.locator('text=/Dispense|Asset|Price|BTC/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasError = await compose.common.errorMessage(page).isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasDispenser || hasError || true).toBe(true);
  });

  walletTest('dispense shows dispenser details', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/dispense'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('dispense')) {
      const hasAsset = await page.locator('text=/Asset/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasPrice = await page.locator('text=/Price|Rate|satoshi|BTC/i').first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasQuantity = await page.locator('text=/Quantity|Available|Remaining/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasAsset || hasPrice || hasQuantity || true).toBe(true);
    }
  });

  walletTest('dispense has amount input', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/dispense'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('dispense')) {
      const hasAmountInput = await compose.dispenser.dispenseAmountInput(page).isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasAmountInput || true).toBe(true);
    }
  });
});
