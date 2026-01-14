/**
 * Actions Page Tests
 *
 * Tests for the Actions page navigation and available operations.
 */

import { walletTest, expect, navigateTo } from '../../fixtures';
import { actions, common } from '../../selectors';

walletTest.describe('Actions Page', () => {
  walletTest('can navigate to actions page via footer', async ({ page }) => {
    await navigateTo(page, 'actions');

    await expect(page).toHaveURL(/actions/);
    await expect(page.locator('text=/Actions|Tools|Assets/i').first()).toBeVisible();
  });

  walletTest('actions page shows Tools section', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    await expect(actions.toolsSection(page)).toBeVisible();
    await expect(actions.signMessageOption(page)).toBeVisible();
    await expect(actions.verifyMessageOption(page)).toBeVisible();
  });

  walletTest('actions page shows Assets section', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    await expect(actions.assetsSection(page)).toBeVisible();
    await expect(actions.issueAssetOption(page)).toBeVisible();
  });

  walletTest('actions page shows Address section', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    await expect(actions.addressSection(page)).toBeVisible();
    await expect(actions.broadcastOption(page)).toBeVisible();
    await expect(actions.sweepAddressOption(page)).toBeVisible();
  });

  walletTest('actions page shows DEX section', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    await expect(actions.dexSection(page)).toBeVisible();
    await expect(actions.cancelOrderOption(page)).toBeVisible();
    await expect(actions.closeDispenserOption(page)).toBeVisible();
  });

  walletTest('can navigate to Sign Message from actions', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    await actions.signMessageOption(page).click();
    await expect(page).toHaveURL(/sign-message/);

    await expect(page.locator('textarea, input[name="message"]').first()).toBeVisible();
  });

  walletTest('can navigate to Verify Message from actions', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    await actions.verifyMessageOption(page).click();
    await expect(page).toHaveURL(/verify-message/);

    const hasVerifyForm = await page.locator('textarea, input').first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasVerifyForm).toBe(true);
  });

  walletTest('can navigate to Issue Asset from actions', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    await actions.issueAssetOption(page).click();

    const isOnIssuance = page.url().includes('issuance');
    expect(isOnIssuance).toBe(true);
  });

  walletTest('can navigate to Broadcast from actions', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    await actions.broadcastOption(page).click();

    const isOnBroadcast = page.url().includes('broadcast');
    expect(isOnBroadcast).toBe(true);
  });

  walletTest('can navigate to Sweep Address from actions', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    await actions.sweepAddressOption(page).click();

    const isOnSweep = page.url().includes('sweep');
    expect(isOnSweep).toBe(true);
  });

  walletTest('can navigate to Cancel Order from actions', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    await actions.cancelOrderOption(page).click();

    const isOnCancel = page.url().includes('cancel');
    expect(isOnCancel).toBe(true);
  });

  walletTest('can navigate back from actions page', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    await expect(common.backButton(page)).toBeVisible();
    await common.backButton(page).click();

    expect(page.url()).toContain('index');
  });

  walletTest('Recover Bitcoin option is visible', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    await expect(actions.recoverBitcoinOption(page)).toBeVisible();
  });
});
