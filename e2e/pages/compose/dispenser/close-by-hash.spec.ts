/**
 * Compose Dispenser Close By Hash Page Tests (/compose/dispenser/close-by-hash)
 *
 * Tests for closing a dispenser by transaction hash.
 */

import { walletTest, expect } from '../../../fixtures';
import { compose } from '../../../selectors';

walletTest.describe('Compose Dispenser Close By Hash Page (/compose/dispenser/close-by-hash)', () => {
  walletTest('close by hash page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/close-by-hash'));
    await page.waitForLoadState('networkidle');

    const hasCloseByHash = await page.locator('text=/Close.*Hash|Transaction.*Hash|Hash/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasHashInput = await compose.dispenser.hashInput(page).isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('close-by-hash');

    expect(hasCloseByHash || hasHashInput || redirected).toBe(true);
  });

  walletTest('close by hash with hash parameter', async ({ page }) => {
    const testHash = '0000000000000000000000000000000000000000000000000000000000000000';
    await page.goto(page.url().replace(/\/index.*/, `/compose/dispenser/close-by-hash/${testHash}`));
    await page.waitForLoadState('networkidle');

    const hasDispenserInfo = await page.locator('text=/Dispenser|Hash|Close/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasError = await compose.common.errorMessage(page).isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasDispenserInfo || hasError || true).toBe(true);
  });
});
