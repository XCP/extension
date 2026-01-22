/**
 * Compose Send Page Tests (/compose/send)
 *
 * Tests for the main send transaction form including validation,
 * address type compatibility, and user interactions.
 */

import { walletTest, expect, navigateTo } from '../../../fixtures';
import { compose, index } from '../../../selectors';
import { TEST_ADDRESSES, TEST_AMOUNTS } from '../../../test-data';
import {
  enableValidationBypass,
  enableDryRun,
  waitForReview,
  clickBack,
} from '../../../compose-test-helpers';

walletTest.describe('Compose Send Page (/compose/send)', () => {
  // Ensure we start from the index (wallet) page for each test
  walletTest.beforeEach(async ({ page }) => {
    // Navigate to wallet/index if not already there
    if (!page.url().includes('/index')) {
      await navigateTo(page, 'wallet');
    }
    // Wait for send button to be visible
    await page.locator('button[aria-label="Send tokens"]').waitFor({ state: 'visible', timeout: 10000 });
  });

  walletTest('can navigate to send from dashboard', async ({ page }) => {
    const sendButton = index.sendButton(page);
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();

    await page.waitForURL(/compose\/send/, { timeout: 5000 });
  });

  walletTest('send form has destination input', async ({ page }) => {
    await index.sendButton(page).click();
    await page.waitForURL(/compose\/send/, { timeout: 5000 });

    const destinationInput = compose.send.recipientInput(page);
    await expect(destinationInput).toBeVisible({ timeout: 5000 });
  });

  walletTest('send form has quantity input', async ({ page }) => {
    await index.sendButton(page).click();
    await page.waitForURL(/compose\/send/, { timeout: 5000 });

    const quantityInput = compose.send.quantityInput(page);
    await expect(quantityInput).toBeVisible({ timeout: 5000 });
  });

  walletTest('send form validates destination address', async ({ page }) => {
    await index.sendButton(page).click();
    await page.waitForURL(/compose\/send/, { timeout: 5000 });

    const destinationInput = compose.send.recipientInput(page);
    await destinationInput.fill('invalid-address');
    await destinationInput.blur();

    // Invalid address should disable submit button
    const submitButton = compose.common.submitButton(page);
    await expect(submitButton).toBeDisabled({ timeout: 5000 });
  });

  walletTest('send form accepts valid address', async ({ page }) => {
    await index.sendButton(page).click();
    await page.waitForURL(/compose\/send/, { timeout: 5000 });

    const destinationInput = compose.send.recipientInput(page);
    await destinationInput.fill('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh');

    const quantityInput = compose.send.quantityInput(page);
    await quantityInput.fill('0.001');

    // Form should be fillable without errors
    await expect(destinationInput).toHaveValue('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh');
    await expect(quantityInput).toHaveValue('0.001');
  });

  walletTest('send form shows fee estimation', async ({ page }) => {
    await index.sendButton(page).click();
    await page.waitForURL(/compose\/send/, { timeout: 5000 });

    const destinationInput = compose.send.recipientInput(page);
    await destinationInput.fill('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh');

    const quantityInput = compose.send.quantityInput(page);
    await quantityInput.fill('0.001');

    await page.waitForLoadState('networkidle');

    // Fee Rate label should be visible (form has showFeeRate={true})
    const feeRateLabel = page.locator('label:has-text("Fee Rate")');
    await expect(feeRateLabel).toBeVisible({ timeout: 5000 });
  });

  walletTest('can navigate back from send form', async ({ page }) => {
    await index.sendButton(page).click();
    await page.waitForURL(/compose\/send/, { timeout: 5000 });

    const backButton = compose.common.headerBackButton(page);
    await backButton.click();

    await expect(page).toHaveURL(/index/, { timeout: 5000 });
  });

  walletTest('validates amount - rejects zero', async ({ page }) => {
    await index.sendButton(page).click();
    await page.waitForURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    await compose.send.recipientInput(page).fill(TEST_ADDRESSES.mainnet.p2wpkh);
    await compose.send.quantityInput(page).fill(TEST_AMOUNTS.zero);
    await compose.send.quantityInput(page).blur();

    // Zero amount should disable submit button
    const submitButton = compose.common.submitButton(page);
    await expect(submitButton).toBeDisabled({ timeout: 5000 });
  });

  // Note: Balance validation happens server-side via compose API, not client-side.
  // The submit button is enabled until the compose API returns an error.
  // This test verifies that large amounts can be entered (client allows any amount).
  walletTest('allows entering large amounts', async ({ page }) => {
    await index.sendButton(page).click();
    await page.waitForURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    await compose.send.recipientInput(page).fill(TEST_ADDRESSES.mainnet.p2wpkh);
    await compose.send.quantityInput(page).fill(TEST_AMOUNTS.veryLarge);
    await compose.send.quantityInput(page).blur();

    // Button remains enabled - validation happens when compose API is called
    const submitButton = compose.common.submitButton(page);
    await expect(submitButton).toBeEnabled({ timeout: 5000 });
  });

  walletTest('shows Max button for BTC', async ({ page }) => {
    await index.sendButton(page).click();
    await page.waitForURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    // Max button should be visible (part of AmountWithMaxInput component)
    const maxButton = page.locator('button:has-text("Max")');
    await expect(maxButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows balance header', async ({ page }) => {
    await index.sendButton(page).click();
    await page.waitForURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    const balanceInfo = page.locator('text=/BTC|Available|Balance/i').first();
    await expect(balanceInfo).toBeVisible({ timeout: 5000 });
  });

  walletTest('handles paste into address field', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await index.sendButton(page).click();
    await page.waitForURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    const testAddress = TEST_ADDRESSES.mainnet.p2tr;
    await page.evaluate((addr) => navigator.clipboard.writeText(addr), testAddress);

    await compose.send.recipientInput(page).focus();
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(500);

    const filledAddress = await compose.send.recipientInput(page).inputValue();
    expect(filledAddress).toBe(testAddress);
  });
});

walletTest.describe('Send Flow - Address Type Compatibility', () => {
  walletTest('accepts P2PKH (Legacy) addresses', async ({ page }) => {
    await index.sendButton(page).click();
    await page.waitForURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    await compose.send.recipientInput(page).fill(TEST_ADDRESSES.mainnet.p2pkh);
    await compose.send.recipientInput(page).blur();
    await page.waitForTimeout(500);

    const hasAddressError = await page.locator('.text-red-600, .text-red-500').filter({ hasText: /address|invalid/i }).first().isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasAddressError).toBe(false);
  });

  walletTest('accepts P2SH (Nested SegWit) addresses', async ({ page }) => {
    await index.sendButton(page).click();
    await page.waitForURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    await compose.send.recipientInput(page).fill(TEST_ADDRESSES.mainnet['p2sh-p2wpkh']);
    await compose.send.recipientInput(page).blur();
    await page.waitForTimeout(500);

    const hasAddressError = await page.locator('.text-red-600, .text-red-500').filter({ hasText: /address|invalid/i }).first().isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasAddressError).toBe(false);
  });

  walletTest('accepts P2WPKH (Native SegWit) addresses', async ({ page }) => {
    await index.sendButton(page).click();
    await page.waitForURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    await compose.send.recipientInput(page).fill(TEST_ADDRESSES.mainnet.p2wpkh);
    await compose.send.recipientInput(page).blur();
    await page.waitForTimeout(500);

    const hasAddressError = await page.locator('.text-red-600, .text-red-500').filter({ hasText: /address|invalid/i }).first().isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasAddressError).toBe(false);
  });

  walletTest('accepts P2TR (Taproot) addresses', async ({ page }) => {
    await index.sendButton(page).click();
    await page.waitForURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    await compose.send.recipientInput(page).fill(TEST_ADDRESSES.mainnet.p2tr);
    await compose.send.recipientInput(page).blur();
    await page.waitForTimeout(500);

    const hasAddressError = await page.locator('.text-red-600, .text-red-500').filter({ hasText: /address|invalid/i }).first().isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasAddressError).toBe(false);
  });
});

walletTest.describe('Send Flow - Full Compose Flow', () => {
  walletTest.beforeEach(async ({ page }) => {
    // Enable validation bypass (skip balance checks) and dry run (skip broadcast)
    await enableValidationBypass(page);
    await enableDryRun(page);
  });

  walletTest('form → review: valid form shows review page', async ({ page }) => {
    await index.sendButton(page).click();
    await page.waitForURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    // Fill form
    await compose.send.recipientInput(page).fill(TEST_ADDRESSES.mainnet.p2wpkh);
    await compose.send.quantityInput(page).fill('0.001');
    await page.waitForTimeout(500);

    // Submit form
    const submitBtn = compose.common.submitButton(page);
    await expect(submitBtn).toBeEnabled({ timeout: 5000 });
    await submitBtn.click();

    // Wait for review page
    await waitForReview(page);

    // Verify review page shows transaction details
    const reviewContent = await page.content();
    expect(reviewContent).toMatch(/review|confirm|sign/i);
  });

  walletTest('form → review → back: form data preserved', async ({ page }) => {
    await index.sendButton(page).click();
    await page.waitForURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    const testAddress = TEST_ADDRESSES.mainnet.p2wpkh;
    const testAmount = '0.00123';

    // Fill form
    await compose.send.recipientInput(page).fill(testAddress);
    await compose.send.quantityInput(page).fill(testAmount);
    await page.waitForTimeout(500);

    // Submit and wait for review
    await compose.common.submitButton(page).click();
    await waitForReview(page);

    // Go back
    await clickBack(page);
    await page.waitForTimeout(500);

    // Verify form data preserved
    await expect(compose.send.recipientInput(page)).toHaveValue(testAddress);
    await expect(compose.send.quantityInput(page)).toHaveValue(testAmount);
  });

  walletTest('form → review → back → edit → submit: recompose works', async ({ page }) => {
    await index.sendButton(page).click();
    await page.waitForURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    // Initial submission
    await compose.send.recipientInput(page).fill(TEST_ADDRESSES.mainnet.p2wpkh);
    await compose.send.quantityInput(page).fill('0.001');
    await compose.common.submitButton(page).click();
    await waitForReview(page);

    // Go back and edit
    await clickBack(page);
    await compose.send.quantityInput(page).fill('0.002');
    await page.waitForTimeout(500);

    // Resubmit
    await compose.common.submitButton(page).click();
    await waitForReview(page);

    // Should be on review page again
    const reviewContent = await page.content();
    expect(reviewContent).toMatch(/review|confirm|sign/i);
  });

  walletTest('review page shows correct transaction details', async ({ page }) => {
    await index.sendButton(page).click();
    await page.waitForURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    const testAddress = TEST_ADDRESSES.mainnet.p2wpkh;
    const testAmount = '0.00567';

    // Fill and submit
    await compose.send.recipientInput(page).fill(testAddress);
    await compose.send.quantityInput(page).fill(testAmount);
    await compose.common.submitButton(page).click();
    await waitForReview(page);

    // Review should show the destination address (at least partially)
    const pageContent = await page.content();
    const addressPrefix = testAddress.substring(0, 10);
    expect(pageContent).toContain(addressPrefix);
  });
});
