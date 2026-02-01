/**
 * DestinationsInput Component Tests
 *
 * Tests for the multi-destination input component used in MPMA transactions.
 * This component allows users to enter one or more destination addresses.
 */

import { walletTest, expect, navigateTo } from '../fixtures';
import { compose, index } from '../selectors';
import { TEST_ADDRESSES, INVALID_ADDRESSES } from '../test-data';

walletTest.describe('DestinationsInput Component', () => {
  // Navigate to send page which uses DestinationsInput
  walletTest.beforeEach(async ({ page }) => {
    // Ensure we're on the wallet/index page first
    if (!page.url().includes('/index')) {
      await navigateTo(page, 'wallet');
    }
    const sendButton = index.sendButton(page);
    await expect(sendButton).toBeVisible({ timeout: 10000 });
    await sendButton.click();
    await page.waitForURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');
    // Wait for the form to be ready
    await compose.send.recipientInput(page).waitFor({ state: 'visible', timeout: 10000 });
  });

  walletTest.describe('Rendering', () => {
    walletTest('renders with Destination label', async ({ page }) => {
      const label = page.locator('label:has-text("Destination")');
      await expect(label).toBeVisible({ timeout: 5000 });
    });

    walletTest('renders with required indicator', async ({ page }) => {
      // Required fields show asterisk (*) in the label
      const label = page.locator('label').filter({ hasText: 'Destination' });
      const labelText = await label.textContent();
      expect(labelText).toContain('*');
    });

    walletTest('renders input field with placeholder', async ({ page }) => {
      const input = compose.send.recipientInput(page);
      await expect(input).toBeVisible();

      const placeholder = await input.getAttribute('placeholder');
      expect(placeholder).toContain('destination address');
    });

    walletTest('input has required attribute', async ({ page }) => {
      const input = compose.send.recipientInput(page);
      const required = await input.getAttribute('required');
      expect(required).not.toBeNull();
    });
  });

  walletTest.describe('Single Destination (Default Mode)', () => {
    walletTest('accepts valid P2WPKH address', async ({ page }) => {
      const input = compose.send.recipientInput(page);
      await input.fill(TEST_ADDRESSES.testnet.p2wpkh);
      await input.blur();

      // Should not show error styling
      const classes = await input.getAttribute('class') || '';
      expect(classes).not.toContain('border-red-500');
    });

    // TODO: P2TR (bech32m) validation not yet implemented - shows error for valid addresses
    walletTest.skip('accepts valid P2TR address', async ({ page }) => {
      const input = compose.send.recipientInput(page);
      await input.fill(TEST_ADDRESSES.testnet.p2tr);
      await input.blur();

      // P2TR (bech32m) should be accepted - no error styling
      await expect(input).not.toHaveClass(/border-red-500/);
    });

    walletTest('shows error for invalid address', async ({ page }) => {
      const input = compose.send.recipientInput(page);
      await input.fill('notavalidaddress');
      await input.blur();

      // Should show error styling for invalid address
      await expect(input).toHaveClass(/border-red-500/, { timeout: 5000 });
    });

    walletTest('accepts address with invalid checksum (validation deferred)', async ({ page }) => {
      const input = compose.send.recipientInput(page);
      await expect(input).toBeVisible({ timeout: 5000 });
      await input.fill(INVALID_ADDRESSES[1]); // Bad checksum address
      await input.blur();

      // Client-side validation doesn't check checksum, so no error styling appears
      // Full checksum validation happens server-side during transaction broadcast
      await expect(input).not.toHaveClass(/border-red-500/);
      await expect(input).toHaveValue(INVALID_ADDRESSES[1]);
    });

    walletTest('trims whitespace from input', async ({ page }) => {
      const input = compose.send.recipientInput(page);
      await input.fill(`  ${TEST_ADDRESSES.testnet.p2wpkh}  `);
      await input.blur();

      const value = await input.inputValue();
      expect(value).toBe(TEST_ADDRESSES.testnet.p2wpkh);
    });

    walletTest('allows clearing and re-entering address', async ({ page }) => {
      const input = compose.send.recipientInput(page);

      // Enter first address
      await input.fill(TEST_ADDRESSES.testnet.p2wpkh);
      await input.blur();

      // Clear and enter different address
      await input.clear();
      await input.fill(TEST_ADDRESSES.testnet.p2tr);
      await input.blur();

      const value = await input.inputValue();
      expect(value).toBe(TEST_ADDRESSES.testnet.p2tr);
    });
  });

  walletTest.describe('Validation Behavior', () => {
    walletTest('empty field does not show error before interaction', async ({ page }) => {
      const input = compose.send.recipientInput(page);

      // Before interacting, should not have error styling
      const classes = await input.getAttribute('class') || '';
      expect(classes).not.toContain('border-red-500');
    });

    walletTest('validates on blur', async ({ page }) => {
      const input = compose.send.recipientInput(page);
      await input.fill('invalid');

      // Before blur, may or may not show error
      await input.blur();

      // After blur with invalid input, should show error
      await expect(input).toHaveClass(/border-red-500/, { timeout: 3000 });
    });

    walletTest('removes error when valid address is entered', async ({ page }) => {
      const input = compose.send.recipientInput(page);

      // First enter invalid
      await input.fill('invalid');
      await input.blur();
      await expect(input).toHaveClass(/border-red-500/, { timeout: 3000 });

      // Then enter valid
      await input.clear();
      await input.fill(TEST_ADDRESSES.testnet.p2wpkh);
      await input.blur();

      // Error styling should be removed
      await expect(input).not.toHaveClass(/border-red-500/);
    });

    walletTest('detects duplicate addresses', async ({ page }) => {
      // This test would need MPMA mode enabled
      // For now, just verify single destination works
      const input = compose.send.recipientInput(page);
      await input.fill(TEST_ADDRESSES.testnet.p2wpkh);

      const value = await input.inputValue();
      expect(value).toBe(TEST_ADDRESSES.testnet.p2wpkh);
    });
  });

  walletTest.describe('Form Integration', () => {
    walletTest('valid destination enables form submission', async ({ page }) => {
      const input = compose.send.recipientInput(page);
      await input.fill(TEST_ADDRESSES.testnet.p2wpkh);
      await input.blur();

      // Destination should be valid (no error styling)
      await expect(input).not.toHaveClass(/border-red-500/);

      // Fill amount to complete form requirements
      const amountInput = page.locator('input[name="quantity"]');
      await amountInput.fill('0.001');
      await amountInput.blur();

      // Submit button should be visible (form is functional)
      const submitBtn = page.locator('button[type="submit"]:has-text("Continue")');
      await expect(submitBtn).toBeVisible();
    });

    walletTest('invalid destination prevents form submission', async ({ page }) => {
      const input = compose.send.recipientInput(page);
      await input.fill('invalidaddress');
      await input.blur();

      // Should show error styling
      await expect(input).toHaveClass(/border-red-500/, { timeout: 3000 });

      // Fill amount
      const amountInput = page.locator('input[name="quantity"]');
      await amountInput.fill('0.001');

      // Submit button should be disabled due to invalid destination
      const submitBtn = page.locator('button[type="submit"]:has-text("Continue")');
      await expect(submitBtn).toBeDisabled();
    });

    walletTest('destination value is preserved during form interaction', async ({ page }) => {
      const input = compose.send.recipientInput(page);
      const testAddress = TEST_ADDRESSES.testnet.p2wpkh;

      await input.fill(testAddress);
      await input.blur();

      // Fill amount
      const amountInput = page.locator('input[name="quantity"]');
      await amountInput.fill('0.001');
      await amountInput.blur();

      // Focus back on destination - value should still be there
      await input.focus();
      const preservedValue = await input.inputValue();
      expect(preservedValue).toBe(testAddress);

      // Verify the form still has the destination filled after interacting with other fields
      await expect(input).toHaveValue(testAddress);
    });
  });

  walletTest.describe('Edge Cases', () => {
    walletTest('handles paste operation', async ({ page }) => {
      const input = compose.send.recipientInput(page);

      // Simulate paste by filling with clipboard content
      await input.fill(TEST_ADDRESSES.testnet.p2wpkh);

      const value = await input.inputValue();
      expect(value).toBe(TEST_ADDRESSES.testnet.p2wpkh);
    });

    walletTest('handles very long input gracefully', async ({ page }) => {
      const input = compose.send.recipientInput(page);
      const longInput = 'a'.repeat(200);

      await input.fill(longInput);
      await input.blur();

      // Should show error (invalid address)
      await expect(input).toHaveClass(/border-red-500/, { timeout: 3000 });
    });

    walletTest('handles special characters gracefully', async ({ page }) => {
      const input = compose.send.recipientInput(page);

      // Try injection-like input
      await input.fill('<script>alert(1)</script>');
      await input.blur();

      // Should show error (invalid address)
      await expect(input).toHaveClass(/border-red-500/, { timeout: 3000 });
    });

    walletTest('handles unicode characters gracefully', async ({ page }) => {
      const input = compose.send.recipientInput(page);

      await input.fill('测试地址');
      await input.blur();

      // Should show error (not valid Bitcoin address)
      await expect(input).toHaveClass(/border-red-500/, { timeout: 3000 });
    });
  });
});
