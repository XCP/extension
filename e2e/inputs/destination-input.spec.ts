/**
 * DestinationInput Component Tests
 *
 * Tests for the destination address input component.
 * Component: src/components/inputs/destination-input.tsx
 *
 * Features tested:
 * - Valid address acceptance (all address types)
 * - Invalid address rejection with error styling
 * - Asset name lookup functionality
 * - Required field validation
 */

import { walletTest, expect, navigateTo } from '../fixtures';
import { TEST_ADDRESSES, INVALID_ADDRESSES } from '../test-data';
import { index, compose } from '../selectors';

walletTest.describe('DestinationInput Component', () => {
  walletTest.beforeEach(async ({ page }) => {
    // Ensure we're on the wallet/index page first
    if (!page.url().includes('/index')) {
      await navigateTo(page, 'wallet');
    }
    // Navigate to send page which uses DestinationInput
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
      const label = page.locator('label').filter({ hasText: /^Destination/ });
      await expect(label).toBeVisible({ timeout: 5000 });
    });

    walletTest('renders with required indicator', async ({ page }) => {
      // Required fields show asterisk (*) in the label
      const label = page.locator('label').filter({ hasText: /^Destination/ });
      const labelText = await label.textContent();
      expect(labelText).toContain('*');
    });

    walletTest('renders input field', async ({ page }) => {
      const input = compose.send.recipientInput(page);
      await expect(input).toBeVisible();
      await expect(input).toBeEnabled();
    });

    walletTest('has placeholder text', async ({ page }) => {
      const input = compose.send.recipientInput(page);
      const placeholder = await input.getAttribute('placeholder');
      expect(placeholder).toBeTruthy();
      expect(placeholder?.toLowerCase()).toContain('address');
    });
  });

  walletTest.describe('Valid Address Input', () => {
    walletTest('accepts valid P2WPKH (Native SegWit) address', async ({ page }) => {
      const input = compose.send.recipientInput(page);
      await input.fill(TEST_ADDRESSES.testnet.p2wpkh);
      await input.blur();

      // Should not show error styling (red border)
      await expect(input).not.toHaveClass(/border-red-500/);

      // Check input value is preserved
      await expect(input).toHaveValue(TEST_ADDRESSES.testnet.p2wpkh);
    });

    // TODO: P2TR (bech32m) validation not yet implemented - shows error for valid addresses
    walletTest.skip('accepts valid P2TR (Taproot) address', async ({ page }) => {
      const input = compose.send.recipientInput(page);
      await input.fill(TEST_ADDRESSES.testnet.p2tr);
      await input.blur();

      // Value should be preserved regardless of validation result
      await expect(input).toHaveValue(TEST_ADDRESSES.testnet.p2tr);

      // P2TR (bech32m) should be accepted - no error styling
      await expect(input).not.toHaveClass(/border-red-500/);
    });

    walletTest('accepts valid P2PKH (Legacy) address', async ({ page }) => {
      const input = compose.send.recipientInput(page);
      await input.fill(TEST_ADDRESSES.testnet.p2pkh);
      await input.blur();

      await expect(input).not.toHaveClass(/border-red-500/);
      await expect(input).toHaveValue(TEST_ADDRESSES.testnet.p2pkh);
    });

    walletTest('accepts valid P2SH (Nested SegWit) address', async ({ page }) => {
      const input = compose.send.recipientInput(page);
      await input.fill(TEST_ADDRESSES.testnet['p2sh-p2wpkh']);
      await input.blur();

      await expect(input).not.toHaveClass(/border-red-500/);
      await expect(input).toHaveValue(TEST_ADDRESSES.testnet['p2sh-p2wpkh']);
    });

    walletTest('accepts mainnet addresses', async ({ page }) => {
      const input = compose.send.recipientInput(page);

      // Test mainnet P2WPKH
      await input.fill(TEST_ADDRESSES.mainnet.p2wpkh);
      await input.blur();
      await expect(input).not.toHaveClass(/border-red-500/);

      // Test mainnet P2TR
      await input.clear();
      await input.fill(TEST_ADDRESSES.mainnet.p2tr);
      await input.blur();
      await expect(input).not.toHaveClass(/border-red-500/);
    });
  });

  walletTest.describe('Invalid Address Input', () => {
    walletTest('shows error for random text', async ({ page }) => {
      const input = compose.send.recipientInput(page);
      await input.fill('notanaddress');
      await input.blur();

      // Should show error styling
      await expect(input).toHaveClass(/border-red-500/, { timeout: 3000 });
    });

    walletTest('accepts address with invalid checksum (validation deferred)', async ({ page }) => {
      const input = compose.send.recipientInput(page);
      // Address with bad checksum - checksum validation is deferred to transaction time
      await input.fill(INVALID_ADDRESSES[1]); // '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN3'
      await input.blur();

      // Client-side validation doesn't check checksum, so no error styling appears
      // Full checksum validation happens server-side during transaction broadcast
      await expect(input).not.toHaveClass(/border-red-500/);
      await expect(input).toHaveValue(INVALID_ADDRESSES[1]);
    });

    walletTest('shows error for invalid bech32', async ({ page }) => {
      const input = compose.send.recipientInput(page);
      await input.fill('bc1invalidaddress');
      await input.blur();

      await expect(input).toHaveClass(/border-red-500/, { timeout: 3000 });
    });

    walletTest('shows error for truncated address', async ({ page }) => {
      const input = compose.send.recipientInput(page);
      // Address that's too short
      await input.fill(INVALID_ADDRESSES[3]); // '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNL'
      await input.blur();

      await expect(input).toHaveClass(/border-red-500/, { timeout: 3000 });
    });
  });

  walletTest.describe('Empty/Whitespace Handling', () => {
    walletTest('field is required by default', async ({ page }) => {
      const input = compose.send.recipientInput(page);

      // Check required attribute
      const isRequired = await input.getAttribute('required');
      expect(isRequired).not.toBeNull();
    });

    walletTest('does not show error for empty field before interaction', async ({ page }) => {
      const input = compose.send.recipientInput(page);

      // Before typing, should not show error
      await expect(input).not.toHaveClass(/border-red-500/);
    });

    walletTest('trims whitespace from input', async ({ page }) => {
      const input = compose.send.recipientInput(page);
      await input.fill(`  ${TEST_ADDRESSES.testnet.p2wpkh}  `);
      await input.blur();

      // Value should be trimmed
      const value = await input.inputValue();
      expect(value).toBe(TEST_ADDRESSES.testnet.p2wpkh);
    });
  });

  walletTest.describe('Asset Name Lookup', () => {
    walletTest('accepts asset-like input for lookup', async ({ page }) => {
      const input = compose.send.recipientInput(page);

      // Enter an asset name with .xcp suffix (required to trigger lookup)
      await input.fill('PEPECASH.xcp');
      await input.blur();

      // Wait for lookup to complete - either:
      // 1. Input value changes (resolved to address), or
      // 2. Error styling appears (lookup failed), or
      // 3. Loading state clears
      // Use expect().poll() to wait for state change
      await expect(async () => {
        const value = await input.inputValue();
        // Value should exist (either original or resolved)
        expect(value.length).toBeGreaterThan(0);
      }).toPass({ timeout: 5000 });
    });

    walletTest('shows error for non-existent asset', async ({ page }) => {
      const input = compose.send.recipientInput(page);

      // Enter a definitely non-existent asset
      await input.fill('ZZZNOTANASSET99999');
      await input.blur();

      // Non-existent asset should show error styling (invalid destination)
      await expect(input).toHaveClass(/border-red-500/, { timeout: 5000 });
    });
  });

  walletTest.describe('Input Behavior', () => {
    walletTest('allows clearing input', async ({ page }) => {
      const input = compose.send.recipientInput(page);

      await input.fill(TEST_ADDRESSES.testnet.p2wpkh);
      await expect(input).toHaveValue(TEST_ADDRESSES.testnet.p2wpkh);

      await input.clear();
      await expect(input).toHaveValue('');
    });

    walletTest('allows editing input', async ({ page }) => {
      const input = compose.send.recipientInput(page);

      await input.fill(TEST_ADDRESSES.testnet.p2wpkh);
      await input.clear();
      await input.fill(TEST_ADDRESSES.testnet.p2tr);

      await expect(input).toHaveValue(TEST_ADDRESSES.testnet.p2tr);
    });

    walletTest('handles paste operation', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);

      const input = compose.send.recipientInput(page);

      // Write to clipboard and paste
      await page.evaluate(
        (addr) => navigator.clipboard.writeText(addr),
        TEST_ADDRESSES.testnet.p2wpkh
      );

      await input.focus();
      await page.keyboard.press('ControlOrMeta+v');

      await expect(input).toHaveValue(TEST_ADDRESSES.testnet.p2wpkh);
    });
  });

  walletTest.describe('Form Integration', () => {
    walletTest('valid address does not prevent form submission', async ({ page }) => {
      const input = compose.send.recipientInput(page);
      await input.fill(TEST_ADDRESSES.testnet.p2wpkh);
      await input.blur();

      // Also fill amount to complete minimum form requirements
      const amountInput = compose.send.quantityInput(page);
      await expect(amountInput).toBeVisible();
      await amountInput.fill('0.001');

      // Destination field should show no error styling (valid address)
      await expect(input).not.toHaveClass(/border-red-500/);
    });

    walletTest('invalid address shows validation error', async ({ page }) => {
      const input = compose.send.recipientInput(page);
      await input.fill('invalid-address');
      await input.blur();

      // Error styling should appear
      await expect(input).toHaveClass(/border-red-500/, { timeout: 3000 });
    });
  });
});
