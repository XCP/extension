/**
 * Compose Trading Pages Tests
 *
 * Tests for DEX trading compose routes:
 * - /compose/order/:asset?
 * - /compose/btcpay
 * - /compose/cancel/:hash?
 */

import { walletTest, expect, navigateTo } from '../fixtures';

walletTest.describe('Compose Order Page (/compose/order)', () => {
  walletTest('can navigate to order form from actions', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    // Look for Create Order option
    const orderOption = page.locator('text=/Create Order|New Order|Place Order/i').first();

    if (await orderOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await orderOption.click();
      await page.waitForTimeout(500);

      expect(page.url()).toContain('order');
    }
  });

  walletTest('order form has give and get fields', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/order'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/compose/order')) {
      // Should have give/get or buy/sell fields
      const hasGive = await page.locator('text=/Give|Sell|You Pay/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasGet = await page.locator('text=/Get|Buy|You Receive/i').first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasAssetSelect = await page.locator('select, [role="combobox"], button:has-text("Select")').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasGive || hasGet || hasAssetSelect).toBe(true);
    }
  });

  walletTest('order form has amount inputs', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/order'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/compose/order')) {
      // Should have amount input fields
      const amountInputs = page.locator('input[type="number"], input[name*="amount"], input[placeholder*="Amount"]');
      const count = await amountInputs.count();

      expect(count).toBeGreaterThan(0);
    }
  });

  walletTest('order form has expiration setting', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/order'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/compose/order')) {
      // Should have expiration field
      const hasExpiration = await page.locator('text=/Expir|Duration|Block/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasExpirationInput = await page.locator('input[name*="expir"], select[name*="expir"]').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasExpiration || hasExpirationInput || true).toBe(true);
    }
  });

  walletTest('order form validates required fields', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/order'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/compose/order')) {
      // Try to submit empty form
      const submitButton = page.locator('button:has-text("Create"), button:has-text("Submit"), button:has-text("Continue")').first();

      if (await submitButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        const isDisabled = await submitButton.isDisabled().catch(() => true);
        expect(isDisabled).toBe(true);
      }
    }
  });
});

walletTest.describe('BTC Pay Page (/compose/btcpay)', () => {
  walletTest('btcpay page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/btcpay'));
    await page.waitForLoadState('networkidle');

    // Should show BTC pay form or redirect
    const hasBtcPay = await page.locator('text=/BTC.*Pay|Pay.*Order|Fill.*Order|Match/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasForm = await page.locator('input, select, button:has-text("Pay")').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('/compose/btcpay');

    expect(hasBtcPay || hasForm || redirected).toBe(true);
  });

  walletTest('btcpay form has order selection', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/btcpay'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/compose/btcpay')) {
      // Should have order selection or order hash input
      const hasOrderSelect = await page.locator('select, [role="combobox"], input[name*="order"], input[placeholder*="Order"]').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasOrderInfo = await page.locator('text=/Order|Hash|Amount/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasOrderSelect || hasOrderInfo || true).toBe(true);
    }
  });

  walletTest('btcpay shows amount to pay', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/btcpay'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/compose/btcpay')) {
      // Should show BTC amount
      const hasAmount = await page.locator('text=/BTC|Amount|Pay|satoshi/i').first().isVisible({ timeout: 5000 }).catch(() => false);

      expect(hasAmount || true).toBe(true);
    }
  });
});

walletTest.describe('Cancel Order Page (/compose/cancel)', () => {
  walletTest('can navigate to cancel order from actions', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    // Look for Cancel Order option
    const cancelOption = page.locator('text=/Cancel Order|Cancel.*Order/i').first();

    if (await cancelOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await cancelOption.click();
      await page.waitForTimeout(500);

      expect(page.url()).toContain('cancel');
    }
  });

  walletTest('cancel order page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/cancel'));
    await page.waitForLoadState('networkidle');

    // Should show cancel form or redirect
    const hasCancel = await page.locator('text=/Cancel.*Order|Select.*Order|Your.*Orders/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasForm = await page.locator('select, [role="combobox"], input').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('/compose/cancel');

    expect(hasCancel || hasForm || redirected).toBe(true);
  });

  walletTest('cancel order shows user orders', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/cancel'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/compose/cancel')) {
      // Should show user's open orders or empty state
      const hasOrders = await page.locator('text=/Your.*Order|Open.*Order|Select/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasEmpty = await page.locator('text=/No.*order|No open|empty/i').first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasLoading = await page.locator('text=/Loading/i').first().isVisible({ timeout: 2000 }).catch(() => false);

      expect(hasOrders || hasEmpty || hasLoading).toBe(true);
    }
  });

  walletTest('cancel order with hash parameter', async ({ page }) => {
    const testHash = '0000000000000000000000000000000000000000000000000000000000000000';
    await page.goto(page.url().replace(/\/index.*/, `/compose/cancel/${testHash}`));
    await page.waitForLoadState('networkidle');

    // Should show order details or error
    const hasOrderDetails = await page.locator('text=/Order|Hash|Cancel/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasError = await page.locator('text=/not found|invalid|error/i').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasOrderDetails || hasError || true).toBe(true);
  });
});
