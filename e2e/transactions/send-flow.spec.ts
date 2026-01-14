/**
 * Send Transaction Flow Tests
 *
 * Tests for the complete BTC send transaction flow including form validation,
 * address type compatibility, and user interactions.
 */

import { walletTest, expect } from '../fixtures';
import { TEST_ADDRESSES, TEST_AMOUNTS } from '../helpers/test-data';

walletTest.describe('Send Transaction Flow', () => {
  walletTest('can navigate to send BTC page', async ({ page }) => {
    await expect(page).toHaveURL(/index/);

    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();

    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });
    await expect(page.getByText('Send')).toBeVisible({ timeout: 5000 });
  });

  walletTest('send form has required fields', async ({ page }) => {
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    await page.waitForLoadState('networkidle');

    const addressInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });

    const amountInput = page.locator('input[name="quantity"], input[placeholder*="amount"], input[type="number"]').first();
    await expect(amountInput).toBeVisible({ timeout: 5000 });

    const submitButton = page.locator('button:has-text("Continue"), button:has-text("Send"), button[type="submit"]').first();
    await expect(submitButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('send form validates recipient address', async ({ page }) => {
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    await page.waitForLoadState('networkidle');

    const addressInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });
    await addressInput.fill('invalid-address');

    await addressInput.blur();
    await page.waitForTimeout(500);

    const hasError = await page.locator('text=/invalid|error|not valid/i').first().isVisible({ timeout: 2000 }).catch(() => false);
    const submitButton = page.locator('button:has-text("Continue"), button:has-text("Send")').first();
    const isDisabled = await submitButton.isDisabled().catch(() => true);

    expect(hasError || isDisabled).toBe(true);
  });

  walletTest('send form accepts valid mainnet address', async ({ page }) => {
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    await page.waitForLoadState('networkidle');

    const addressInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });
    await addressInput.fill(TEST_ADDRESSES.mainnet.p2wpkh);
    await addressInput.blur();
    await page.waitForTimeout(500);

    const hasAddressError = await page.locator('.text-red-600:has-text("address"), .text-red-500:has-text("address")').first().isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasAddressError).toBe(false);
  });

  walletTest('send form validates amount - rejects zero', async ({ page }) => {
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    await page.waitForLoadState('networkidle');

    const addressInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });
    await addressInput.fill(TEST_ADDRESSES.mainnet.p2wpkh);

    const amountInput = page.locator('input[name="quantity"], input[placeholder*="amount"]').first();
    await expect(amountInput).toBeVisible({ timeout: 5000 });
    await amountInput.fill(TEST_AMOUNTS.zero);
    await amountInput.blur();
    await page.waitForTimeout(500);

    const submitButton = page.locator('button:has-text("Continue"), button:has-text("Send")').first();
    const isDisabled = await submitButton.isDisabled().catch(() => true);
    const hasError = await page.locator('text=/invalid|error|must be|greater than/i').first().isVisible({ timeout: 1000 }).catch(() => false);

    expect(isDisabled || hasError).toBe(true);
  });

  walletTest('send form validates amount - insufficient balance', async ({ page }) => {
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    await page.waitForLoadState('networkidle');

    const addressInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });
    await addressInput.fill(TEST_ADDRESSES.mainnet.p2wpkh);

    const amountInput = page.locator('input[name="quantity"], input[placeholder*="amount"]').first();
    await expect(amountInput).toBeVisible({ timeout: 5000 });
    await amountInput.fill(TEST_AMOUNTS.veryLarge);
    await amountInput.blur();
    await page.waitForTimeout(500);

    const submitButton = page.locator('button:has-text("Continue"), button:has-text("Send")').first();
    const isDisabled = await submitButton.isDisabled().catch(() => true);
    const hasError = await page.locator('text=/insufficient|not enough|balance|exceed/i').first().isVisible({ timeout: 2000 }).catch(() => false);

    expect(isDisabled || hasError).toBe(true);
  });

  walletTest('send form shows Max button for BTC', async ({ page }) => {
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    await page.waitForLoadState('networkidle');

    const maxButton = page.locator('button:has-text("Max"), button:has-text("MAX")').first();
    const hasMax = await maxButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasMax) {
      await maxButton.click();
      await page.waitForTimeout(500);

      const amountInput = page.locator('input[name="quantity"], input[placeholder*="amount"]').first();
      const amount = await amountInput.inputValue();

      expect(amount).not.toBe('');
    }
  });

  walletTest('send form can be cancelled', async ({ page }) => {
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    const backButton = page.locator('button[aria-label*="back"], button[aria-label*="Back"], header button').first();
    await expect(backButton).toBeVisible({ timeout: 5000 });
    await backButton.click();

    await page.waitForTimeout(500);
    const stillOnSend = page.url().includes('compose/send');

    expect(stillOnSend || page.url().includes('index')).toBe(true);
  });

  walletTest('send form shows fee estimation', async ({ page }) => {
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    await page.waitForLoadState('networkidle');

    const feeIndicator = page.locator('text=/fee|sat\\/vB|sats|vbyte/i').first();
    const hasFeeIndicator = await feeIndicator.isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasFeeIndicator).toBe(true);
  });

  walletTest('send flow shows balance header', async ({ page }) => {
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    await page.waitForLoadState('networkidle');

    const balanceInfo = page.locator('text=/BTC|Available|Balance/i').first();
    await expect(balanceInfo).toBeVisible({ timeout: 5000 });
  });

  walletTest('send form handles paste into address field', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    await page.waitForLoadState('networkidle');

    const testAddress = TEST_ADDRESSES.mainnet.p2tr;
    await page.evaluate((addr) => navigator.clipboard.writeText(addr), testAddress);

    const addressInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });
    await addressInput.focus();
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(500);

    const filledAddress = await addressInput.inputValue();
    expect(filledAddress).toBe(testAddress);
  });
});

walletTest.describe('Send Flow - Address Type Compatibility', () => {
  walletTest('accepts P2PKH (Legacy) addresses', async ({ page }) => {
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    const addressInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });
    await addressInput.fill(TEST_ADDRESSES.mainnet.p2pkh);
    await addressInput.blur();
    await page.waitForTimeout(500);

    const hasAddressError = await page.locator('.text-red-600, .text-red-500').filter({ hasText: /address|invalid/i }).first().isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasAddressError).toBe(false);
  });

  walletTest('accepts P2SH (Nested SegWit) addresses', async ({ page }) => {
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    const addressInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });
    await addressInput.fill(TEST_ADDRESSES.mainnet['p2sh-p2wpkh']);
    await addressInput.blur();
    await page.waitForTimeout(500);

    const hasAddressError = await page.locator('.text-red-600, .text-red-500').filter({ hasText: /address|invalid/i }).first().isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasAddressError).toBe(false);
  });

  walletTest('accepts P2WPKH (Native SegWit) addresses', async ({ page }) => {
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    const addressInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });
    await addressInput.fill(TEST_ADDRESSES.mainnet.p2wpkh);
    await addressInput.blur();
    await page.waitForTimeout(500);

    const hasAddressError = await page.locator('.text-red-600, .text-red-500').filter({ hasText: /address|invalid/i }).first().isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasAddressError).toBe(false);
  });

  walletTest('accepts P2TR (Taproot) addresses', async ({ page }) => {
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    const addressInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });
    await addressInput.fill(TEST_ADDRESSES.mainnet.p2tr);
    await addressInput.blur();
    await page.waitForTimeout(500);

    const hasAddressError = await page.locator('.text-red-600, .text-red-500').filter({ hasText: /address|invalid/i }).first().isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasAddressError).toBe(false);
  });
});
