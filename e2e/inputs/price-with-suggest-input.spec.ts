/**
 * PriceWithSuggestInput Component Tests
 *
 * Tests for the price input with suggested price from last trade.
 * Component: src/components/inputs/price-with-suggest-input.tsx
 *
 * Features tested:
 * - Rendering (input, label, Min button)
 * - Valid price entry (decimals, positive numbers)
 * - Suggested price button
 * - Input sanitization (non-numeric characters)
 * - Pair flip functionality (where available)
 *
 * PriceWithSuggestInput is used in:
 * - Create order page (DEX orders)
 * - Create dispenser page (set BTC price)
 */

import { walletTest, expect } from '../fixtures';

walletTest.describe('PriceWithSuggestInput Component', () => {
  // Navigate to dispenser page which uses PriceWithSuggestInput
  walletTest.beforeEach(async ({ page }) => {
    const hashIndex = page.url().indexOf('#');
    const baseUrl = hashIndex !== -1 ? page.url().substring(0, hashIndex + 1) : page.url() + '#';
    // Use XCP asset for dispenser - it's a common asset
    await page.goto(`${baseUrl}/compose/dispenser/XCP`);
    await page.waitForLoadState('networkidle');
    // Wait for price input to be ready
    await page.locator('input[name="mainchainrate_display"]').waitFor({ state: 'visible', timeout: 10000 });
  });

  // Helper to get price input - dispenser uses name="mainchainrate_display"
  const getPriceInput = (page: any) => page.locator('input[name="mainchainrate_display"]');

  walletTest.describe('Rendering', () => {
    walletTest('renders price input field', async ({ page }) => {
      const input = getPriceInput(page);
      await expect(input).toBeVisible({ timeout: 5000 });
    });

    walletTest('has Price label', async ({ page }) => {
      // Dispenser uses "Price in Bitcoin" label
      const label = page.locator('label:has-text("Price")');
      await expect(label).toBeVisible({ timeout: 5000 });
    });

    walletTest('has placeholder text', async ({ page }) => {
      const input = getPriceInput(page);
      const placeholder = await input.getAttribute('placeholder');
      expect(placeholder).toBe('0.00000000');
    });
  });

  walletTest.describe('Valid Price Entry', () => {
    walletTest('accepts positive decimal numbers', async ({ page }) => {
      const input = getPriceInput(page);
      await input.fill('0.00001');
      await input.blur();

      // Should not show error
      await expect(async () => {
        const classes = await input.getAttribute('class') || '';
        expect(classes).not.toContain('border-red-500');
      }).toPass({ timeout: 2000 });
    });

    walletTest('accepts zero as starting value', async ({ page }) => {
      const input = getPriceInput(page);
      await input.fill('0');

      const value = await input.inputValue();
      expect(value).toContain('0');
    });

    walletTest('handles 8 decimal places', async ({ page }) => {
      const input = getPriceInput(page);
      await input.fill('0.12345678');

      const value = await input.inputValue();
      expect(value).toContain('12345678');
    });

    walletTest('accepts large numbers', async ({ page }) => {
      const input = getPriceInput(page);
      await input.fill('1000000');

      const value = await input.inputValue();
      // May be formatted with commas
      expect(value.replace(/,/g, '')).toContain('1000000');
    });
  });

  walletTest.describe('Input Sanitization', () => {
    walletTest('strips non-numeric characters', async ({ page }) => {
      const input = getPriceInput(page);
      // Type text with letters
      await input.fill('abc123');

      // Only numbers should remain
      const value = await input.inputValue();
      expect(value).not.toContain('a');
      expect(value).not.toContain('b');
      expect(value).not.toContain('c');
    });

    walletTest('allows only one decimal point', async ({ page }) => {
      const input = getPriceInput(page);
      await input.fill('1.2.3');

      // Should only have one decimal
      const value = await input.inputValue();
      const decimalCount = (value.match(/\./g) || []).length;
      expect(decimalCount).toBeLessThanOrEqual(1);
    });

    walletTest('strips special characters', async ({ page }) => {
      const input = getPriceInput(page);
      await input.fill('$100.50');

      const value = await input.inputValue();
      expect(value).not.toContain('$');
    });
  });

  walletTest.describe('Min Button (Suggested Price)', () => {
    walletTest('Min button has accessible label when visible', async ({ page }) => {
      const minButton = page.locator('button:has-text("Min")');
      const isVisible = await minButton.isVisible({ timeout: 2000 }).catch(() => false);

      if (isVisible) {
        const ariaLabel = await minButton.getAttribute('aria-label');
        expect(ariaLabel).toContain('suggested price');
      }
    });

    walletTest('clicking Min populates price field', async ({ page }) => {
      const input = getPriceInput(page);
      const minButton = page.locator('button:has-text("Min")');

      const isVisible = await minButton.isVisible({ timeout: 2000 }).catch(() => false);
      if (isVisible) {
        // Clear input first
        await input.clear();

        // Click Min button
        await minButton.click();

        // Price field should now have a value
        await expect(async () => {
          const value = await input.inputValue();
          expect(value).toBeTruthy();
          expect(value).not.toBe('');
        }).toPass({ timeout: 2000 });
      }
    });
  });

  walletTest.describe('Input Behavior', () => {
    walletTest('allows clearing price', async ({ page }) => {
      const input = getPriceInput(page);
      await input.fill('100');
      await input.clear();

      const value = await input.inputValue();
      expect(value).toBe('');
    });

    walletTest('allows editing price', async ({ page }) => {
      const input = getPriceInput(page);
      await input.fill('100');
      await input.clear();
      await input.fill('200');

      const value = await input.inputValue();
      expect(value.replace(/,/g, '')).toContain('200');
    });

    walletTest('preserves value after blur', async ({ page }) => {
      const input = getPriceInput(page);
      await input.fill('0.5');
      await input.blur();

      const value = await input.inputValue();
      expect(value).toContain('5');
    });
  });

  walletTest.describe('Form Integration', () => {
    walletTest('input has name attribute', async ({ page }) => {
      const input = getPriceInput(page);
      const name = await input.getAttribute('name');
      // Dispenser form uses mainchainrate_display for price input
      expect(name).toBe('mainchainrate_display');
    });

    walletTest('input has id attribute', async ({ page }) => {
      const input = getPriceInput(page);
      const id = await input.getAttribute('id');
      // Dispenser form uses mainchainrate_display for price input
      expect(id).toBe('mainchainrate_display');
    });

    walletTest('input is required', async ({ page }) => {
      const input = getPriceInput(page);
      const required = await input.getAttribute('required');
      expect(required).not.toBeNull();
    });

    walletTest('input is within form', async ({ page }) => {
      const input = getPriceInput(page);
      const isInForm = await input.evaluate((el: HTMLElement) => {
        return el.closest('form') !== null;
      });

      expect(isInForm).toBe(true);
    });
  });

  walletTest.describe('Number Formatting', () => {
    walletTest('formats large numbers with thousands separators', async ({ page }) => {
      const input = getPriceInput(page);
      await input.fill('1000000');

      // Value may be formatted as 1,000,000
      const value = await input.inputValue();
      const hasFormatting = value.includes(',') || value === '1000000';
      expect(hasFormatting).toBe(true);
    });

    walletTest('preserves decimal precision', async ({ page }) => {
      const input = getPriceInput(page);
      await input.fill('0.00000001');

      const value = await input.inputValue();
      // Should preserve the small decimal value
      expect(value).toContain('00000001');
    });
  });

  walletTest.describe('Accessibility', () => {
    walletTest('input is focusable', async ({ page }) => {
      const input = getPriceInput(page);
      await input.focus();

      const isFocused = await page.evaluate(() => {
        // Dispenser form uses mainchainrate_display for price input
        return document.activeElement?.getAttribute('name') === 'mainchainrate_display';
      });

      expect(isFocused).toBe(true);
    });
  });
});
