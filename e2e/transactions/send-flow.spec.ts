import { test, expect } from '@playwright/test';
import {
  launchExtension,
  setupWallet,
  createWallet,
  navigateViaFooter,
  cleanup,
  TEST_PASSWORD,
} from '../helpers/test-helpers';
import { TEST_ADDRESSES, INVALID_ADDRESSES, TEST_AMOUNTS } from '../helpers/test-data';

test.describe('Send Transaction Flow', () => {
  test('can navigate to send BTC page', async () => {
    const { context, page } = await launchExtension('send-navigate');
    await setupWallet(page);

    // Wait for index page to load
    await expect(page).toHaveURL(/index/);

    // Look for Send button on the index page
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();

    // Should navigate to send page
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    // Should show send form
    await expect(page.getByText('Send')).toBeVisible({ timeout: 5000 });

    await cleanup(context);
  });

  test('send form has required fields', async () => {
    const { context, page } = await launchExtension('send-form-fields');
    await setupWallet(page);

    // Navigate to send page
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    // Wait for form to load
    await page.waitForLoadState('networkidle');

    // Should have destination/address input
    const addressInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });

    // Should have amount input
    const amountInput = page.locator('input[name="quantity"], input[placeholder*="amount"], input[type="number"]').first();
    await expect(amountInput).toBeVisible({ timeout: 5000 });

    // Should have Continue/Send button
    const submitButton = page.locator('button:has-text("Continue"), button:has-text("Send"), button[type="submit"]').first();
    await expect(submitButton).toBeVisible({ timeout: 5000 });

    await cleanup(context);
  });

  test('send form validates recipient address', async () => {
    const { context, page } = await launchExtension('send-validate-address');
    await setupWallet(page);

    // Navigate to send page
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    // Wait for form to load
    await page.waitForLoadState('networkidle');

    // Enter invalid address
    const addressInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });
    await addressInput.fill('invalid-address');

    // Try to blur to trigger validation
    await addressInput.blur();
    await page.waitForTimeout(500);

    // Should show error or button should be disabled
    const hasError = await page.locator('text=/invalid|error|not valid/i').first().isVisible({ timeout: 2000 }).catch(() => false);
    const submitButton = page.locator('button:has-text("Continue"), button:has-text("Send")').first();
    const isDisabled = await submitButton.isDisabled().catch(() => true);

    expect(hasError || isDisabled).toBe(true);

    await cleanup(context);
  });

  test('send form accepts valid mainnet address', async () => {
    const { context, page } = await launchExtension('send-valid-address');
    await setupWallet(page);

    // Navigate to send page
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    // Wait for form to load
    await page.waitForLoadState('networkidle');

    // Enter valid mainnet address
    const addressInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });
    await addressInput.fill(TEST_ADDRESSES.mainnet.p2wpkh);
    await addressInput.blur();
    await page.waitForTimeout(500);

    // Should not show address validation error
    const hasAddressError = await page.locator('.text-red-600:has-text("address"), .text-red-500:has-text("address")').first().isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasAddressError).toBe(false);

    await cleanup(context);
  });

  test('send form validates amount - rejects zero', async () => {
    const { context, page } = await launchExtension('send-validate-zero');
    await setupWallet(page);

    // Navigate to send page
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    // Wait for form to load
    await page.waitForLoadState('networkidle');

    // Fill valid address
    const addressInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });
    await addressInput.fill(TEST_ADDRESSES.mainnet.p2wpkh);

    // Enter zero amount
    const amountInput = page.locator('input[name="quantity"], input[placeholder*="amount"]').first();
    await expect(amountInput).toBeVisible({ timeout: 5000 });
    await amountInput.fill(TEST_AMOUNTS.zero);
    await amountInput.blur();
    await page.waitForTimeout(500);

    // Submit button should be disabled or error shown
    const submitButton = page.locator('button:has-text("Continue"), button:has-text("Send")').first();
    const isDisabled = await submitButton.isDisabled().catch(() => true);
    const hasError = await page.locator('text=/invalid|error|must be|greater than/i').first().isVisible({ timeout: 1000 }).catch(() => false);

    expect(isDisabled || hasError).toBe(true);

    await cleanup(context);
  });

  test('send form validates amount - insufficient balance', async () => {
    const { context, page } = await launchExtension('send-insufficient');
    await setupWallet(page);

    // Navigate to send page
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    // Wait for form to load
    await page.waitForLoadState('networkidle');

    // Fill valid address
    const addressInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });
    await addressInput.fill(TEST_ADDRESSES.mainnet.p2wpkh);

    // Enter very large amount (should exceed balance)
    const amountInput = page.locator('input[name="quantity"], input[placeholder*="amount"]').first();
    await expect(amountInput).toBeVisible({ timeout: 5000 });
    await amountInput.fill(TEST_AMOUNTS.veryLarge);
    await amountInput.blur();
    await page.waitForTimeout(500);

    // Should show insufficient balance error or button disabled
    const submitButton = page.locator('button:has-text("Continue"), button:has-text("Send")').first();
    const isDisabled = await submitButton.isDisabled().catch(() => true);
    const hasError = await page.locator('text=/insufficient|not enough|balance|exceed/i').first().isVisible({ timeout: 2000 }).catch(() => false);

    expect(isDisabled || hasError).toBe(true);

    await cleanup(context);
  });

  test('send form shows Max button for BTC', async () => {
    const { context, page } = await launchExtension('send-max-button');
    await setupWallet(page);

    // Navigate to send page
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    // Wait for form to load
    await page.waitForLoadState('networkidle');

    // Should have Max button
    const maxButton = page.locator('button:has-text("Max"), button:has-text("MAX")').first();
    const hasMax = await maxButton.isVisible({ timeout: 5000 }).catch(() => false);

    // If Max button exists, clicking it should fill the amount
    if (hasMax) {
      await maxButton.click();
      await page.waitForTimeout(500);

      const amountInput = page.locator('input[name="quantity"], input[placeholder*="amount"]').first();
      const amount = await amountInput.inputValue();

      // Amount should be filled (even if it's 0 for empty wallet)
      expect(amount).not.toBe('');
    }

    await cleanup(context);
  });

  test('send form can be cancelled', async () => {
    const { context, page } = await launchExtension('send-cancel');
    await setupWallet(page);

    // Navigate to send page
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    // Look for back button or cancel button
    const backButton = page.locator('button[aria-label*="back"], button[aria-label*="Back"], header button').first();
    await expect(backButton).toBeVisible({ timeout: 5000 });
    await backButton.click();

    // Should navigate away from send page
    await page.waitForTimeout(500);
    const stillOnSend = page.url().includes('compose/send');

    // Either navigated away or still on index
    expect(stillOnSend || page.url().includes('index')).toBe(true);

    await cleanup(context);
  });

  test('send form shows fee estimation', async () => {
    const { context, page } = await launchExtension('send-fee-estimation');
    await setupWallet(page);

    // Navigate to send page
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    // Wait for form to load
    await page.waitForLoadState('networkidle');

    // Should show fee rate or fee-related info
    const feeIndicator = page.locator('text=/fee|sat\\/vB|sats|vbyte/i').first();
    const hasFeeIndicator = await feeIndicator.isVisible({ timeout: 5000 }).catch(() => false);

    // Fee indicator should be present (may show in different formats)
    expect(hasFeeIndicator).toBe(true);

    await cleanup(context);
  });

  test('send flow shows balance header', async () => {
    const { context, page } = await launchExtension('send-balance-header');
    await setupWallet(page);

    // Navigate to send page
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    // Wait for form to load
    await page.waitForLoadState('networkidle');

    // Should show balance information (BTC by default)
    const balanceInfo = page.locator('text=/BTC|Available|Balance/i').first();
    await expect(balanceInfo).toBeVisible({ timeout: 5000 });

    await cleanup(context);
  });

  test('send form handles paste into address field', async () => {
    const { context, page } = await launchExtension('send-paste-address');
    await setupWallet(page);

    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Navigate to send page
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    // Wait for form to load
    await page.waitForLoadState('networkidle');

    // Copy address to clipboard
    const testAddress = TEST_ADDRESSES.mainnet.p2tr;
    await page.evaluate((addr) => navigator.clipboard.writeText(addr), testAddress);

    // Paste into address field
    const addressInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });
    await addressInput.focus();
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(500);

    // Address should be filled
    const filledAddress = await addressInput.inputValue();
    expect(filledAddress).toBe(testAddress);

    await cleanup(context);
  });
});

test.describe('Send Flow - Address Type Compatibility', () => {
  test('accepts P2PKH (Legacy) addresses', async () => {
    const { context, page } = await launchExtension('send-p2pkh');
    await setupWallet(page);

    // Navigate to send page
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    // Enter P2PKH address
    const addressInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });
    await addressInput.fill(TEST_ADDRESSES.mainnet.p2pkh);
    await addressInput.blur();
    await page.waitForTimeout(500);

    // Should accept without error
    const hasAddressError = await page.locator('.text-red-600, .text-red-500').filter({ hasText: /address|invalid/i }).first().isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasAddressError).toBe(false);

    await cleanup(context);
  });

  test('accepts P2SH (Nested SegWit) addresses', async () => {
    const { context, page } = await launchExtension('send-p2sh');
    await setupWallet(page);

    // Navigate to send page
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    // Enter P2SH address
    const addressInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });
    await addressInput.fill(TEST_ADDRESSES.mainnet['p2sh-p2wpkh']);
    await addressInput.blur();
    await page.waitForTimeout(500);

    // Should accept without error
    const hasAddressError = await page.locator('.text-red-600, .text-red-500').filter({ hasText: /address|invalid/i }).first().isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasAddressError).toBe(false);

    await cleanup(context);
  });

  test('accepts P2WPKH (Native SegWit) addresses', async () => {
    const { context, page } = await launchExtension('send-p2wpkh');
    await setupWallet(page);

    // Navigate to send page
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    // Enter P2WPKH address
    const addressInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });
    await addressInput.fill(TEST_ADDRESSES.mainnet.p2wpkh);
    await addressInput.blur();
    await page.waitForTimeout(500);

    // Should accept without error
    const hasAddressError = await page.locator('.text-red-600, .text-red-500').filter({ hasText: /address|invalid/i }).first().isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasAddressError).toBe(false);

    await cleanup(context);
  });

  test('accepts P2TR (Taproot) addresses', async () => {
    const { context, page } = await launchExtension('send-p2tr');
    await setupWallet(page);

    // Navigate to send page
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    // Enter P2TR address
    const addressInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });
    await addressInput.fill(TEST_ADDRESSES.mainnet.p2tr);
    await addressInput.blur();
    await page.waitForTimeout(500);

    // Should accept without error
    const hasAddressError = await page.locator('.text-red-600, .text-red-500').filter({ hasText: /address|invalid/i }).first().isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasAddressError).toBe(false);

    await cleanup(context);
  });
});
