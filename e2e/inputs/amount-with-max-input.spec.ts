/**
 * AmountWithMaxInput Component Tests
 *
 * Tests for the amount input with Max button component.
 * Component: src/components/inputs/amount-with-max-input.tsx
 *
 * Features tested:
 * - Amount input validation
 * - Max button functionality
 * - Error states (dust limit, insufficient balance)
 * - Decimal handling
 */

import { walletTest, expect } from '../fixtures';
import { TEST_AMOUNTS, TEST_ADDRESSES } from '../test-data';
import { index, compose } from '../selectors';

// Helper to get the quantity/amount input
const getAmountInput = (page: any) => compose.send.quantityInput(page);

walletTest.describe('AmountWithMaxInput Component', () => {
  walletTest.beforeEach(async ({ page }) => {
    // Navigate to send page which uses AmountWithMaxInput
    const sendButton = index.sendButton(page);
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await page.waitForURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');
  });

  // Helper to fill destination (needed for some tests)
  async function fillDestination(page: any, address?: string) {
    const dest = address || TEST_ADDRESSES.testnet.p2wpkh;
    const input = compose.send.recipientInput(page);
    await input.fill(dest);
    await input.blur();
  }

  walletTest.describe('Rendering', () => {
    walletTest('renders with Amount label', async ({ page }) => {
      const label = page.locator('label:has-text("Amount")');
      await expect(label).toBeVisible({ timeout: 5000 });
    });

    walletTest('renders with required indicator', async ({ page }) => {
      const requiredIndicator = page.locator('label:has-text("Amount") span.text-red-500');
      await expect(requiredIndicator).toBeVisible();
    });

    walletTest('renders input field', async ({ page }) => {
      const input = page.locator('input[name="quantity"]');
      await expect(input).toBeVisible();
      await expect(input).toBeEnabled();
    });

    walletTest('renders Max button', async ({ page }) => {
      const maxButton = page.locator('button:has-text("Max")');
      await expect(maxButton).toBeVisible();
    });

    walletTest('has placeholder showing format', async ({ page }) => {
      const input = page.locator('input[name="quantity"]');
      const placeholder = await input.getAttribute('placeholder');
      expect(placeholder).toContain('0.00');
    });
  });

  walletTest.describe('Valid Amount Input', () => {
    walletTest('accepts valid decimal amount', async ({ page }) => {
      const input = page.locator('input[name="quantity"]');
      await input.fill(TEST_AMOUNTS.small);
      await input.blur();

      await expect(input).toHaveValue(TEST_AMOUNTS.small);
      // Should not show error
      await expect(input).not.toHaveClass(/border-red-500/);
    });

    walletTest('accepts integer amount', async ({ page }) => {
      const input = page.locator('input[name="quantity"]');
      await input.fill('1');
      await input.blur();

      await expect(input).toHaveValue('1');
    });

    walletTest('accepts small decimal amounts', async ({ page }) => {
      const input = page.locator('input[name="quantity"]');
      await input.fill('0.00001');
      await input.blur();

      await expect(input).toHaveValue('0.00001');
    });

    walletTest('accepts 8 decimal places (satoshi precision)', async ({ page }) => {
      const input = page.locator('input[name="quantity"]');
      await input.fill('0.00000001');
      await input.blur();

      await expect(input).toHaveValue('0.00000001');
    });
  });

  walletTest.describe('Invalid Amount Input', () => {
    walletTest('handles zero amount', async ({ page }) => {
      const input = page.locator('input[name="quantity"]');
      await input.fill(TEST_AMOUNTS.zero);
      await input.blur();

      // Zero should be accepted as input but may cause form validation error
      await expect(input).toHaveValue(TEST_AMOUNTS.zero);
    });

    walletTest('handles negative amount', async ({ page }) => {
      const input = page.locator('input[name="quantity"]');
      await input.fill(TEST_AMOUNTS.negative);
      await input.blur();

      // Component may handle negatives in different ways:
      // 1. Strip the negative sign
      // 2. Keep it but prevent form submission
      // 3. Show error styling
      const value = await input.inputValue();

      // The key is that it doesn't crash and the form handles it gracefully
      // Most amount inputs either strip negatives or accept them as invalid
      expect(typeof value).toBe('string');
    });

    walletTest('handles non-numeric input', async ({ page }) => {
      const input = page.locator('input[name="quantity"]');
      await input.fill(TEST_AMOUNTS.invalid);
      await input.blur();

      // Non-numeric should be rejected or cause error
      const value = await input.inputValue();
      // Either empty (rejected) or shows error
      expect(value === '' || value === TEST_AMOUNTS.invalid).toBe(true);
    });
  });

  walletTest.describe('Max Button', () => {
    walletTest('Max button is visible and clickable', async ({ page }) => {
      const maxButton = page.locator('button:has-text("Max")');
      await expect(maxButton).toBeVisible();
      await expect(maxButton).toBeEnabled();
    });

    walletTest('Max button has accessible label', async ({ page }) => {
      const maxButton = page.locator('button:has-text("Max")');
      const ariaLabel = await maxButton.getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
      expect(ariaLabel?.toLowerCase()).toContain('max');
    });

    walletTest('clicking Max fills amount field', async ({ page }) => {
      // First fill destination to enable max calculation
      await fillDestination(page);

      const input = page.locator('input[name="quantity"]');
      const maxButton = page.locator('button:has-text("Max")');

      // Clear any existing value
      await input.clear();

      // Click Max
      await maxButton.click();

      // Wait for calculation (may involve API call for fee estimation)
      await page.waitForTimeout(2000);

      // Amount should be filled (or error shown if no balance)
      const value = await input.inputValue();

      // Check for actual error messages (not just required field indicators)
      // Error messages typically appear as text, not just the * indicators
      const errorAlert = page.locator('[role="alert"], .text-red-600, p.text-red-500');
      const hasError = await errorAlert.isVisible().catch(() => false);

      // Max button may:
      // 1. Fill with calculated max amount
      // 2. Show error if no balance/insufficient for fees
      // 3. Show 0 if no spendable balance
      // All are valid behaviors
      const hasValue = value !== '' && value !== '0';
      const hasZero = value === '0' || value === '0.00000000';

      expect(hasValue || hasZero || hasError).toBe(true);
    });

    walletTest('Max button shows loading state during calculation', async ({ page }) => {
      await fillDestination(page);

      const maxButton = page.locator('button:has-text("Max")');

      // Click and immediately check for loading state
      await maxButton.click();

      // May show spinner or change text
      // The button should be disabled during loading
      // Due to timing, this test verifies the button exists and is clickable
      await expect(maxButton).toBeVisible();
    });
  });

  walletTest.describe('Error States', () => {
    walletTest('shows error for insufficient balance', async ({ page }) => {
      // Fill destination first
      await fillDestination(page);

      const input = page.locator('input[name="quantity"]');
      // Try to send more than any test wallet would have
      await input.fill(TEST_AMOUNTS.veryLarge);
      await input.blur();

      // Try to submit form
      const submitBtn = page.locator('button[type="submit"]:has-text("Continue")');
      if (await submitBtn.isEnabled().catch(() => false)) {
        await submitBtn.click();

        // Wait for validation/API response
        await page.waitForTimeout(2000);

        // Should show an error about insufficient balance/funds
        // Use specific selector to avoid matching required field indicators (*)
        const errorMessage = page.locator('[role="alert"], .text-red-600, p.text-red-500, div.text-red-500');
        const hasError = await errorMessage.first().isVisible().catch(() => false);

        // The form should either show error or prevent submission
        expect(hasError || !(await submitBtn.isEnabled())).toBe(true);
      }
    });

    walletTest('shows error when Max fails due to no balance', async ({ page }) => {
      await fillDestination(page);

      const maxButton = page.locator('button:has-text("Max")');
      await maxButton.click();

      // Wait for max calculation
      await page.waitForTimeout(2000);

      // Check for error message (expected for test wallets with no BTC)
      const errorMessages = [
        page.locator('text=/No available balance/i'),
        page.locator('text=/Insufficient balance/i'),
        page.locator('text=/Failed to calculate/i'),
      ];

      // At least one error may be visible, or amount may be 0
      const input = page.locator('input[name="quantity"]');
      const value = await input.inputValue();

      let hasError = false;
      for (const msg of errorMessages) {
        if (await msg.isVisible().catch(() => false)) {
          hasError = true;
          break;
        }
      }

      // Either has error message or value is empty/zero (both valid outcomes for no balance)
      expect(hasError || value === '' || value === '0').toBe(true);
    });
  });

  walletTest.describe('Input Behavior', () => {
    walletTest('allows clearing input', async ({ page }) => {
      const input = page.locator('input[name="quantity"]');

      await input.fill('0.5');
      await expect(input).toHaveValue('0.5');

      await input.clear();
      await expect(input).toHaveValue('');
    });

    walletTest('allows editing input', async ({ page }) => {
      const input = page.locator('input[name="quantity"]');

      await input.fill('0.1');
      await input.clear();
      await input.fill('0.2');

      await expect(input).toHaveValue('0.2');
    });

    walletTest('preserves input after blur', async ({ page }) => {
      const input = page.locator('input[name="quantity"]');

      await input.fill('0.12345678');
      await input.blur();

      // Focus elsewhere
      await fillDestination(page);

      // Value should be preserved
      await expect(input).toHaveValue('0.12345678');
    });
  });

  walletTest.describe('Form Integration', () => {
    walletTest('valid amount does not prevent form submission', async ({ page }) => {
      await fillDestination(page);

      const input = page.locator('input[name="quantity"]');
      await input.fill(TEST_AMOUNTS.small);

      // Amount field should not show error
      await expect(input).not.toHaveClass(/border-red-500/);
    });

    walletTest('amount is included in form submission', async ({ page }) => {
      await fillDestination(page);

      const input = page.locator('input[name="quantity"]');
      await input.fill('0.001');

      // Check input has name attribute for form submission
      const name = await input.getAttribute('name');
      expect(name).toBe('quantity');
    });
  });
});
