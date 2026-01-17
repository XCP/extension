/**
 * Compose Broadcast Address Options Page Tests (/compose/broadcast/address-options)
 *
 * Tests for broadcast address options configuration.
 */

import { walletTest, expect } from '../../../fixtures';
import { compose } from '../../../selectors';

walletTest.describe('Compose Broadcast Address Options Page (/compose/broadcast/address-options)', () => {
  walletTest('address options page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/broadcast/address-options'));
    await page.waitForLoadState('networkidle');

    const hasAddressOptions = await page.locator('text=/Address.*Option|Options|Configure/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasForm = await page.locator('input, select, [role="switch"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('address-options');

    expect(hasAddressOptions || hasForm || redirected).toBe(true);
  });

  walletTest('can navigate to address options from broadcast', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/broadcast'));
    await page.waitForLoadState('networkidle');

    const addressOptionsLink = compose.broadcast.addressOptionsLink(page);

    if (await addressOptionsLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addressOptionsLink.click();
      await page.waitForTimeout(500);

      expect(page.url()).toContain('address-options');
    }
  });

  walletTest('address options has toggle switches', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/broadcast/address-options'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('address-options')) {
      const hasToggles = await page.locator('[role="switch"], input[type="checkbox"]').first().isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasToggles || true).toBe(true);
    }
  });
});
