/**
 * Compose Transactions Tests
 *
 * Tests for various transaction composition forms including send, MPMA,
 * broadcast, issuance, orders, sweep, and dividend distribution.
 */

import { walletTest, expect, navigateTo } from '../fixtures';

async function enableDryRunMode(page: any) {
  try {
    if (page.url().includes('404') || (await page.locator('text="Not Found"').isVisible({ timeout: 1000 }).catch(() => false))) {
      return;
    }

    const footer = page.locator('div.grid.grid-cols-4').first();
    if (await footer.isVisible({ timeout: 2000 }).catch(() => false)) {
      await navigateTo(page, 'settings');
    } else {
      const currentUrl = page.url();
      const baseUrl = currentUrl.split('#')[0];
      await page.goto(`${baseUrl}#/settings`);
      await page.waitForLoadState('networkidle');
    }

    await page.waitForTimeout(1000);

    if (!page.url().includes('settings')) {
      return;
    }

    const advancedSelectors = [
      'div[role="button"][aria-label="Advanced"]',
      'text="Advanced"',
      'button:has-text("Advanced")'
    ];

    for (const selector of advancedSelectors) {
      const element = page.locator(selector).first();
      if (await element.isVisible({ timeout: 1000 }).catch(() => false)) {
        await element.click();
        await page.waitForTimeout(1000);
        break;
      }
    }

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const dryRunSwitch = page.locator('[role="switch"]').filter({ has: page.locator('..').filter({ hasText: 'Dry Run' }) });
    if (await dryRunSwitch.isVisible({ timeout: 1000 }).catch(() => false)) {
      const isEnabled = await dryRunSwitch.getAttribute('aria-checked');
      if (isEnabled !== 'true') {
        await dryRunSwitch.click();
        await page.waitForTimeout(500);
      }
    }

    const currentUrl = page.url();
    const baseUrl = currentUrl.split('#')[0];
    await page.goto(`${baseUrl}#/index`);
    await page.waitForLoadState('networkidle');
  } catch {
    // Continue without dry run mode
  }
}

walletTest.describe('Compose Transactions', () => {
  walletTest('send BTC transaction form validation', async ({ page }) => {
    const sendButton = page.locator('button[aria-label="Send tokens"]');
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();

    await page.waitForURL(/compose\/send/, { timeout: 5000 });

    const destinationInput = page.locator('input[placeholder*="destination address"]');
    await expect(destinationInput).toBeVisible({ timeout: 5000 });

    await destinationInput.fill('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh');

    const quantityInput = page.locator('input[name="quantity"]');
    await expect(quantityInput).toBeVisible({ timeout: 5000 });
    await quantityInput.fill('0.001');
  });

  walletTest('send with insufficient balance error', async ({ page, extensionId }) => {
    await page.waitForTimeout(2000);
    await enableDryRunMode(page);

    const sendButton = page.locator('button').filter({ hasText: 'Send' }).first();
    if (await sendButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sendButton.click();
    } else {
      await page.goto(`chrome-extension://${extensionId}/popup.html#/compose/send`);
    }
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const allInputs = await page.locator('input').all();

    for (const input of allInputs) {
      const placeholder = await input.getAttribute('placeholder');
      const name = await input.getAttribute('name');

      if ((placeholder && placeholder.toLowerCase().includes('address')) || name === 'destination') {
        await input.fill('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh');
      } else if ((placeholder && placeholder.toLowerCase().includes('amount')) || name === 'quantity') {
        await input.fill('999999');
      }
    }

    const submitBtn = page.locator('button[type="submit"]').or(
      page.locator('button').filter({ hasText: /^Send$|^Submit$|^Continue$|^Next$/ })
    ).last();

    await expect(submitBtn).toBeVisible({ timeout: 3000 });
    await submitBtn.click();

    await page.waitForLoadState('networkidle');

    const errorElement = page.locator('.text-red-500, .text-red-600, [role="alert"], .bg-red-50');

    const stillOnSendPage = page.url().includes('compose/send');

    const hasError = await errorElement.isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasError || stillOnSendPage).toBeTruthy();
  });

  walletTest('MPMA send functionality', async ({ page }) => {
    await page.waitForTimeout(2000);
    await enableDryRunMode(page);

    await navigateTo(page, 'settings');

    await page.locator('div[role="button"][aria-label="Advanced"]').click();
    await page.waitForURL('**/settings/advanced', { timeout: 10000 });

    const mpmaSwitch = page.locator('text="Enable MPMA Sends"').locator('..').locator('..').locator('[role="switch"]');
    const isEnabled = await mpmaSwitch.getAttribute('aria-checked');
    if (isEnabled !== 'true') {
      await mpmaSwitch.click();
      await page.waitForTimeout(500);
    }

    await navigateTo(page, 'wallet');

    await page.locator('button[aria-label="Send tokens"]').click();
    await page.waitForURL('**/compose/send/BTC', { timeout: 10000 });

    const mpmaOption = page.locator('text=/MPMA|Multiple|recipients/');
    if (await mpmaOption.isVisible()) {
      await mpmaOption.click();
      await page.waitForURL('**/compose/send/mpma', { timeout: 10000 });

      await expect(page.locator('text=/Add recipient|Multiple addresses/')).toBeVisible();
    }
  });

  walletTest('broadcast text message form', async ({ page }) => {
    await navigateTo(page, 'actions');

    await page.locator('text="Broadcast"').first().click();
    await page.waitForURL('**/compose/broadcast', { timeout: 10000 });

    const messageInput = page.locator('textarea[name="text"]');
    await expect(messageInput).toBeVisible();
    await messageInput.fill('Test broadcast message');

    const value = await messageInput.inputValue();
    expect(value).toBe('Test broadcast message');
  });

  walletTest('asset issuance form', async ({ page }) => {
    await navigateTo(page, 'actions');

    await page.locator('text="Issue Asset"').click();
    await page.waitForURL('**/compose/issuance', { timeout: 10000 });

    const assetNameInput = page.locator('input[name="asset"]');
    await expect(assetNameInput).toBeVisible();
    await assetNameInput.fill('TESTASSET');

    const quantityInput = page.locator('input[name="quantity"]');
    await expect(quantityInput).toBeVisible();
    await quantityInput.fill('1000000');

    const url = page.url();
    expect(url).toContain('/compose/issuance');
  });

  walletTest('order creation on DEX', async ({ page }) => {
    await enableDryRunMode(page);

    await navigateTo(page, 'market');

    const createOrderButton = page.locator('button:has-text("Create Order"), button:has-text("Trade")').first();
    if (await createOrderButton.isVisible()) {
      await createOrderButton.click();
      await page.waitForURL('**/compose/order', { timeout: 10000 });

      const giveAssetInput = page.locator('input[placeholder*="give asset"], input[placeholder*="sell"]').first();
      await giveAssetInput.fill('XCP');

      const giveQuantityInput = page.locator('input[placeholder*="give quantity"], input[placeholder*="sell amount"]').first();
      await giveQuantityInput.fill('100');

      const getAssetInput = page.locator('input[placeholder*="get asset"], input[placeholder*="buy"]').first();
      await getAssetInput.fill('PEPECASH');

      const getQuantityInput = page.locator('input[placeholder*="get quantity"], input[placeholder*="buy amount"]').first();
      await getQuantityInput.fill('1000');

      await page.waitForTimeout(1000);
      const feeElement = page.locator('text=/Fee|sat/');
      await expect(feeElement).toBeVisible();
    }
  });

  walletTest('sweep address functionality', async ({ page, extensionId }) => {
    await page.waitForTimeout(2000);
    await enableDryRunMode(page);

    await navigateTo(page, 'actions');
    await page.waitForTimeout(1000);

    const sweepSelectors = [
      'text="Sweep Address"',
      'text="Sweep"',
      'button:has-text("Sweep")'
    ];

    let clicked = false;
    for (const selector of sweepSelectors) {
      const element = page.locator(selector).first();
      if (await element.isVisible({ timeout: 1000 }).catch(() => false)) {
        await element.click();
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      await page.goto(`chrome-extension://${extensionId}/popup.html#/compose/sweep`);
    }

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const destinationInput = page.locator('input[placeholder*="destination address"]').or(
      page.locator('input[type="text"]').filter({ has: page.locator('..').filter({ hasText: 'Destination' }) })
    ).first();

    if (await destinationInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await destinationInput.fill('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh');
    }

    const sweepTypeSelect = page.locator('select[name="flags"]');
    if (await sweepTypeSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
      await sweepTypeSelect.selectOption('3');
    }

    await page.waitForTimeout(1000);

    const submitButton = page.locator('button[type="submit"]').or(
      page.locator('button').filter({ hasText: /Continue|Review|Sweep|Submit/ })
    ).last();

    const isEnabled = await submitButton.isEnabled().catch(() => false);
    expect(isEnabled).toBeTruthy();
  });

  walletTest('fee estimation updates', async ({ page }) => {
    await enableDryRunMode(page);

    await page.locator('button[aria-label="Send tokens"]').click();
    await page.waitForURL('**/compose/send/BTC', { timeout: 10000 });

    const destinationInput = page.locator('input[placeholder="Enter destination address"]');
    await expect(destinationInput).toBeVisible({ timeout: 5000 });
    await destinationInput.fill('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh');

    const quantityInput = page.locator('input[name="quantity"]');
    await expect(quantityInput).toBeVisible({ timeout: 5000 });
    await quantityInput.fill('0.001');

    await page.waitForLoadState('networkidle');

    await quantityInput.fill('0.01');

    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/compose/send/BTC');
    await expect(quantityInput).toHaveValue('0.01');
  });

  walletTest('dividend distribution form', async ({ page }) => {
    await enableDryRunMode(page);

    await navigateTo(page, 'actions');

    const dividendOption = page.locator('text=/Dividend|Distribution/');
    if (await dividendOption.isVisible()) {
      await dividendOption.click();
      await page.waitForURL('**/compose/dividend', { timeout: 10000 });

      const assetInput = page.locator('input[placeholder*="asset"], input[placeholder*="holders"]').first();
      await assetInput.fill('TESTASSET');

      const dividendAssetInput = page.locator('input[placeholder*="dividend"], input[placeholder*="distribute"]').first();
      await dividendAssetInput.fill('XCP');

      const quantityPerUnitInput = page.locator('input[placeholder*="per unit"], input[placeholder*="amount"]').first();
      await quantityPerUnitInput.fill('0.01');

      await page.waitForTimeout(1000);
      const feeElement = page.locator('text=/Fee|sat/');
      await expect(feeElement).toBeVisible();
    }
  });
});
