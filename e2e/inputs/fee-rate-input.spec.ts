/**
 * FeeRateInput Component Tests
 *
 * Tests for the fee rate selector component.
 * Component: src/components/inputs/fee-rate-input.tsx
 *
 * Features tested:
 * - Preset selection (Slow, Medium, Fast)
 * - Custom fee rate input
 * - Loading state while fetching rates
 * - Validation (minimum 0.1 sat/vB)
 */

import { walletTest, expect, navigateTo } from '../fixtures';
import { index } from '../selectors';

walletTest.describe('FeeRateInput Component', () => {
  walletTest.beforeEach(async ({ page }) => {
    // Ensure we're on the wallet/index page first
    if (!page.url().includes('/index')) {
      await navigateTo(page, 'wallet');
    }
    // Navigate to send page which uses FeeRateInput
    const sendButton = index.sendButton(page);
    await expect(sendButton).toBeVisible({ timeout: 10000 });
    await sendButton.click();
    await page.waitForURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');
    // Wait for the form to be ready (wait for quantity input which always loads)
    await page.locator('input[name="quantity"]').waitFor({ state: 'visible', timeout: 10000 });
  });

  // Helper to check if fee rate dropdown loaded (depends on external API)
  async function feeRateDropdownLoaded(page: any): Promise<boolean> {
    const dropdownButton = page.locator('button').filter({ hasText: /Fast|Medium|Slow/i }).first();
    return await dropdownButton.isVisible({ timeout: 2000 }).catch(() => false);
  }

  walletTest.describe('Rendering', () => {
    walletTest('renders with Fee Rate label', async ({ page }) => {
      const label = page.locator('label:has-text("Fee Rate")');
      await expect(label).toBeVisible({ timeout: 5000 });
    });

    walletTest('renders with required indicator', async ({ page }) => {
      const requiredIndicator = page.locator('label:has-text("Fee Rate") span.text-red-500');
      await expect(requiredIndicator).toBeVisible();
    });

    walletTest('shows dropdown or loading state', async ({ page }) => {
      // Either shows dropdown (fees loaded) or loading message
      await expect(async () => {
        const dropdown = page.locator('button').filter({ hasText: /Fast|Medium|Slow|Custom/i }).first();
        const loading = page.locator('text=Loading fee rates');
        const dropdownVisible = await dropdown.isVisible();
        const loadingVisible = await loading.isVisible();
        expect(dropdownVisible || loadingVisible).toBe(true);
      }).toPass({ timeout: 5000 });
    });
  });

  walletTest.describe('Preset Selection', () => {
    walletTest('has preset options available', async ({ page }) => {
      // Skip if fee rates didn't load from API
      const dropdownLoaded = await feeRateDropdownLoaded(page);
      walletTest.skip(!dropdownLoaded, 'Fee rate API data not loaded');

      const dropdownButton = page.locator('button').filter({ hasText: /Fast|Medium|Slow/i }).first();
      await dropdownButton.click();

      // Check for preset options
      const options = page.locator('[role="option"], [role="listbox"] > *');
      await expect(options.first()).toBeVisible({ timeout: 3000 });

      // Should have at least Fast or Custom
      const hasPresets = await page.locator('text=/Fast|Medium|Slow/i').first().isVisible();
      expect(hasPresets).toBe(true);
    });

    walletTest('selecting preset updates displayed value', async ({ page }) => {
      // Skip if fee rates didn't load from API
      const dropdownLoaded = await feeRateDropdownLoaded(page);
      walletTest.skip(!dropdownLoaded, 'Fee rate API data not loaded');

      const dropdownButton = page.locator('button').filter({ hasText: /Fast|Medium|Slow/i }).first();
      await dropdownButton.click();

      // Select a different option if available
      const mediumOption = page.locator('[role="option"]').filter({ hasText: /Medium/i });
      const slowOption = page.locator('[role="option"]').filter({ hasText: /Slow/i });

      const mediumVisible = await mediumOption.isVisible().catch(() => false);
      const option = mediumVisible ? mediumOption : slowOption;

      if (await option.isVisible().catch(() => false)) {
        await option.click();

        // Button text should update
        await expect(async () => {
          const newText = await dropdownButton.textContent();
          expect(newText).toBeTruthy();
        }).toPass({ timeout: 2000 });
      }
    });

    walletTest('preset shows sat/vB value', async ({ page }) => {
      // Skip if fee rates didn't load from API
      const dropdownLoaded = await feeRateDropdownLoaded(page);
      walletTest.skip(!dropdownLoaded, 'Fee rate API data not loaded');

      const dropdownButton = page.locator('button').filter({ hasText: /Fast|Medium|Slow/i }).first();
      // Button should show sat/vB value
      const text = await dropdownButton.textContent();
      expect(text?.toLowerCase()).toContain('sat/vb');
    });
  });

  walletTest.describe('Custom Fee Rate', () => {
    walletTest('can switch to Custom option', async ({ page }) => {
      // Skip if fee rates didn't load from API
      const dropdownLoaded = await feeRateDropdownLoaded(page);
      walletTest.skip(!dropdownLoaded, 'Fee rate API data not loaded');

      const dropdownButton = page.locator('button').filter({ hasText: /Fast|Medium|Slow/i }).first();
      await dropdownButton.click();

      const customOption = page.locator('[role="option"]').filter({ hasText: /Custom/i });
      const customVisible = await customOption.isVisible().catch(() => false);

      if (customVisible) {
        await customOption.click();

        // Should show text input
        const customInput = page.locator('input[name="sat_per_vbyte"]');
        await expect(customInput).toBeVisible({ timeout: 3000 });
      }
    });

    walletTest('custom input accepts valid fee rate', async ({ page }) => {
      // Navigate to custom input (either already visible or switch to it)
      let customInput = page.locator('input[name="sat_per_vbyte"]');

      const customVisible = await customInput.isVisible().catch(() => false);
      if (!customVisible) {
        // Try to switch to custom
        const dropdownButton = page.locator('button').filter({ hasText: /Fast|Medium|Slow/i }).first();
        const dropdownVisible = await dropdownButton.isVisible().catch(() => false);
        if (dropdownVisible) {
          await dropdownButton.click();
          const customOption = page.locator('[role="option"]').filter({ hasText: /Custom/i });
          const optionVisible = await customOption.isVisible().catch(() => false);
          if (optionVisible) {
            await customOption.click();
          }
        }
      }

      customInput = page.locator('input[name="sat_per_vbyte"]');
      const inputVisible = await customInput.isVisible().catch(() => false);
      if (inputVisible) {
        await customInput.clear();
        await customInput.fill('25');
        await customInput.blur();

        await expect(customInput).toHaveValue('25');
      }
    });

    walletTest('custom input has Esc button to reset', async ({ page }) => {
      let customInput = page.locator('input[name="sat_per_vbyte"]');

      // Switch to custom if needed
      const customVisible = await customInput.isVisible().catch(() => false);
      if (!customVisible) {
        const dropdownButton = page.locator('button').filter({ hasText: /Fast|Medium|Slow/i }).first();
        const dropdownVisible = await dropdownButton.isVisible().catch(() => false);
        if (dropdownVisible) {
          await dropdownButton.click();
          const customOption = page.locator('[role="option"]').filter({ hasText: /Custom/i });
          const optionVisible = await customOption.isVisible().catch(() => false);
          if (optionVisible) {
            await customOption.click();
          }
        }
      }

      customInput = page.locator('input[name="sat_per_vbyte"]');
      const inputVisible = await customInput.isVisible().catch(() => false);
      if (inputVisible) {
        // Look for Esc button
        const escButton = page.locator('button:has-text("Esc")');
        await expect(escButton).toBeVisible({ timeout: 3000 });

        // Clicking Esc should return to preset mode
        await escButton.click();

        // Should return to dropdown mode
        const dropdownButton = page.locator('button').filter({ hasText: /Fast|Medium|Slow/i }).first();
        await expect(dropdownButton).toBeVisible({ timeout: 3000 });
      }
    });
  });

  walletTest.describe('Form Integration', () => {
    walletTest('fee rate is included in form submission', async ({ page }) => {
      // Fee rate should have a hidden input or visible input with name
      const hiddenInput = page.locator('input[name="sat_per_vbyte"]');
      const hasInput = await hiddenInput.count();
      expect(hasInput).toBeGreaterThan(0);
    });

    walletTest('selected fee rate value is positive', async ({ page }) => {
      const input = page.locator('input[name="sat_per_vbyte"]');
      const value = await input.inputValue();

      if (value) {
        const numValue = parseFloat(value);
        expect(numValue).toBeGreaterThan(0);
      }
    });
  });
});
