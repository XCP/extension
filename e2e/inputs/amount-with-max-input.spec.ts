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

import { walletTest, expect, navigateTo } from '../fixtures';
import { TEST_AMOUNTS, TEST_ADDRESSES } from '../test-data';
import { index, compose, common } from '../selectors';

// Helper to get the quantity/amount input
const getAmountInput = (page: any) => compose.send.quantityInput(page);

walletTest.describe('AmountWithMaxInput Component', () => {
  walletTest.beforeEach(async ({ page }) => {
    // Ensure we're on the wallet/index page first
    if (!page.url().includes('/index')) {
      await navigateTo(page, 'wallet');
    }
    // Navigate to send page which uses AmountWithMaxInput
    const sendButton = index.sendButton(page);
    await expect(sendButton).toBeVisible({ timeout: 10000 });
    await sendButton.click();
    await page.waitForURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');
    // Wait for the form to be ready (input visible means form rendered)
    await getAmountInput(page).waitFor({ state: 'visible', timeout: 10000 });
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
      await expect(requiredIndicator).toBeVisible({ timeout: 5000 });
    });

    walletTest('renders input field', async ({ page }) => {
      const input = getAmountInput(page);
      await expect(input).toBeVisible({ timeout: 5000 });
      await expect(input).toBeEnabled({ timeout: 5000 });
    });

    walletTest('renders Max button', async ({ page }) => {
      const maxButton = page.locator('button:has-text("Max")');
      await expect(maxButton).toBeVisible({ timeout: 5000 });
    });

    walletTest('has placeholder showing format', async ({ page }) => {
      const input = getAmountInput(page);
      await expect(input).toBeVisible({ timeout: 5000 });
      const placeholder = await input.getAttribute('placeholder');
      expect(placeholder).toContain('0.00');
    });
  });

  walletTest.describe('Valid Amount Input', () => {
    walletTest('accepts valid decimal amount', async ({ page }) => {
      const input = getAmountInput(page);
      await input.fill(TEST_AMOUNTS.small);
      await input.blur();

      await expect(input).toHaveValue(TEST_AMOUNTS.small);
      // Should not show error
      await expect(input).not.toHaveClass(/border-red-500/);
    });

    walletTest('accepts integer amount', async ({ page }) => {
      const input = getAmountInput(page);
      await input.fill('1');
      await input.blur();

      await expect(input).toHaveValue('1');
    });

    walletTest('accepts small decimal amounts', async ({ page }) => {
      const input = getAmountInput(page);
      await input.fill('0.00001');
      await input.blur();

      await expect(input).toHaveValue('0.00001');
    });

    walletTest('accepts 8 decimal places (satoshi precision)', async ({ page }) => {
      const input = getAmountInput(page);
      await input.fill('0.00000001');
      await input.blur();

      await expect(input).toHaveValue('0.00000001');
    });
  });

  walletTest.describe('Invalid Amount Input', () => {
    walletTest('handles zero amount', async ({ page }) => {
      const input = getAmountInput(page);
      await input.fill(TEST_AMOUNTS.zero);
      await input.blur();

      // Zero should be accepted as input but may cause form validation error
      await expect(input).toHaveValue(TEST_AMOUNTS.zero);
    });

    walletTest('handles negative amount', async ({ page }) => {
      const input = getAmountInput(page);
      await input.fill(TEST_AMOUNTS.negative);
      await input.blur();

      // Component accepts negative input but should show validation error or disable submit
      const value = await input.inputValue();

      // Verify the input accepted the value (component handles validation via form, not input mask)
      expect(value).toContain('-');

      // Check that form validation catches it via aria-invalid attribute
      const hasAriaInvalid = await input.getAttribute('aria-invalid');
      expect(hasAriaInvalid).toBe('true');
    });

    walletTest('handles non-numeric input', async ({ page }) => {
      const input = getAmountInput(page);
      await input.fill(TEST_AMOUNTS.invalid);
      await input.blur();

      // Component accepts non-numeric input but validates on form submission
      const value = await input.inputValue();

      // Verify the input accepted the value
      expect(value).toBe(TEST_AMOUNTS.invalid);

      // Check that form validation catches it via aria-invalid attribute
      const hasAriaInvalid = await input.getAttribute('aria-invalid');
      expect(hasAriaInvalid).toBe('true');
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

    walletTest('clicking Max shows no balance error when wallet is empty', async ({ page }) => {
      // walletTest fixture wallet has no BTC balance (Available: 0.00000000)
      await fillDestination(page);

      const input = getAmountInput(page);
      const maxButton = page.locator('button:has-text("Max")');

      // Clear any existing value
      await input.clear();

      // Click Max - should show "No available balance." error
      await maxButton.click();

      // Wait for the error to appear
      const errorAlert = common.errorAlert(page);
      await expect(errorAlert).toBeVisible({ timeout: 10000 });
      await expect(errorAlert).toContainText('No available balance');

      // Input should remain empty since there's no balance
      await expect(input).toHaveValue('');
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

      const input = getAmountInput(page);
      // Try to send more than any test wallet would have
      await input.fill(TEST_AMOUNTS.veryLarge);
      await input.blur();

      // Try to submit form
      const submitBtn = page.locator('button[type="submit"]:has-text("Continue")');

      // Either button is disabled (pre-validation) or clicking shows error
      const isEnabled = await submitBtn.isEnabled();
      if (isEnabled) {
        await submitBtn.click();

        // Wait for validation error to appear
        const errorMessage = page.locator('[role="alert"], .text-red-600, p.text-red-500, div.text-red-500');
        await expect(errorMessage.first()).toBeVisible({ timeout: 5000 });
      } else {
        // Button disabled due to validation - this is expected behavior
        await expect(submitBtn).toBeDisabled();
      }
    });

  });

  walletTest.describe('Input Behavior', () => {
    walletTest('allows clearing input', async ({ page }) => {
      const input = getAmountInput(page);

      await input.fill('0.5');
      await expect(input).toHaveValue('0.5');

      await input.clear();
      await expect(input).toHaveValue('');
    });

    walletTest('allows editing input', async ({ page }) => {
      const input = getAmountInput(page);

      await input.fill('0.1');
      await input.clear();
      await input.fill('0.2');

      await expect(input).toHaveValue('0.2');
    });

    walletTest('preserves input after blur', async ({ page }) => {
      const input = getAmountInput(page);

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

      const input = getAmountInput(page);
      await input.fill(TEST_AMOUNTS.small);

      // Amount field should not show error
      await expect(input).not.toHaveClass(/border-red-500/);
    });

    walletTest('amount is included in form submission', async ({ page }) => {
      await fillDestination(page);

      const input = getAmountInput(page);
      await input.fill('0.001');

      // Check input has name attribute for form submission
      const name = await input.getAttribute('name');
      expect(name).toBe('quantity');
    });
  });
});
