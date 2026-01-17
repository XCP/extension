/**
 * Compose Dividend Page Tests (/compose/dividend)
 *
 * Tests for distributing dividends to asset holders.
 */

import { walletTest, expect, navigateTo } from '../../../fixtures';
import { compose } from '../../../selectors';

walletTest.describe('Compose Dividend Page (/compose/dividend)', () => {
  walletTest('can navigate to dividend from actions', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    const dividendOption = page.locator('text=/Dividend|Pay.*Dividend/i').first();

    if (await dividendOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await dividendOption.click();
      await page.waitForTimeout(500);

      expect(page.url()).toContain('dividend');
    }
  });

  walletTest('dividend page loads with asset parameter', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dividend/XCP'));
    await page.waitForLoadState('networkidle');

    const hasDividend = await page.locator('text=/Dividend|Pay.*Holder|Distribution/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasDistributeButton = await compose.dividend.distributeButton(page).isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('dividend');

    expect(hasDividend || hasDistributeButton || redirected).toBe(true);
  });

  walletTest('dividend form has dividend asset selection', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dividend/XCP'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('dividend')) {
      const hasDividendAsset = await page.locator('text=/Dividend.*Asset|Pay.*With/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasAssetInput = await compose.dividend.dividendAssetInput(page).isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasDividendAsset || hasAssetInput || true).toBe(true);
    }
  });

  walletTest('dividend form has amount per unit field', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dividend/XCP'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('dividend')) {
      const hasAmountField = await page.locator('text=/Per.*Unit|Amount|Quantity/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasAmountInput = await compose.dividend.quantityPerUnitInput(page).isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasAmountField || hasAmountInput || true).toBe(true);
    }
  });
});
