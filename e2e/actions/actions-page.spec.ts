/**
 * Actions Page Tests
 *
 * Tests for the Actions page navigation and available operations.
 */

import {
  walletTest,
  expect,
  navigateTo
} from '../fixtures';

walletTest.describe('Actions Page', () => {
  walletTest('can navigate to actions page via footer', async ({ page }) => {
    await navigateTo(page, 'actions');

    await expect(page).toHaveURL(/actions/);
    await expect(page.locator('text=/Actions|Tools|Assets/i').first()).toBeVisible();
  });

  walletTest('actions page shows Tools section', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    await expect(page.getByText('Tools')).toBeVisible();
    await expect(page.getByText('Sign Message')).toBeVisible();
    await expect(page.getByText('Verify Message')).toBeVisible();
  });

  walletTest('actions page shows Assets section', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    await expect(page.getByText('Assets')).toBeVisible();
    await expect(page.getByText('Issue Asset')).toBeVisible();
  });

  walletTest('actions page shows Address section', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    await expect(page.getByText('Address')).toBeVisible();
    await expect(page.getByText('Broadcast')).toBeVisible();
    await expect(page.getByText('Sweep Address')).toBeVisible();
  });

  walletTest('actions page shows DEX section', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    await expect(page.getByText('DEX')).toBeVisible();
    await expect(page.getByText('Cancel Order')).toBeVisible();
    await expect(page.getByText('Close Dispenser')).toBeVisible();
  });

  walletTest('can navigate to Sign Message from actions', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    await page.getByText('Sign Message').click();
    await expect(page).toHaveURL(/sign-message/);

    await expect(page.locator('textarea, input[name="message"]').first()).toBeVisible();
  });

  walletTest('can navigate to Verify Message from actions', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    await page.getByText('Verify Message').click();
    await expect(page).toHaveURL(/verify-message/);

    const hasVerifyForm = await page.locator('textarea, input').first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasVerifyForm).toBe(true);
  });

  walletTest('can navigate to Issue Asset from actions', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    await page.getByText('Issue Asset').click();

    const isOnIssuance = page.url().includes('issuance');
    expect(isOnIssuance).toBe(true);
  });

  walletTest('can navigate to Broadcast from actions', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    const broadcastOption = page.locator('text=Broadcast').first();
    await broadcastOption.click();

    const isOnBroadcast = page.url().includes('broadcast');
    expect(isOnBroadcast).toBe(true);
  });

  walletTest('can navigate to Sweep Address from actions', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    await page.getByText('Sweep Address').click();

    const isOnSweep = page.url().includes('sweep');
    expect(isOnSweep).toBe(true);
  });

  walletTest('can navigate to Cancel Order from actions', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    await page.getByText('Cancel Order').click();

    const isOnCancel = page.url().includes('cancel');
    expect(isOnCancel).toBe(true);
  });

  walletTest('can navigate back from actions page', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    const backButton = page.locator('button[aria-label*="back"], button[aria-label*="Back"], header button').first();
    await expect(backButton).toBeVisible();
    await backButton.click();

    expect(page.url()).toContain('index');
  });

  walletTest('Recover Bitcoin option is visible', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    const recoverOption = page.getByText('Recover Bitcoin');
    await expect(recoverOption).toBeVisible();
    expect(await recoverOption.isVisible()).toBe(true);
  });
});
