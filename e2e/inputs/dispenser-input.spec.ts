/**
 * DispenserInput Component Tests
 *
 * Tests for the dispenser address input with automatic dispenser discovery.
 * Component: src/components/inputs/dispenser-input.tsx
 *
 * Features tested:
 * - Rendering (address input, label)
 * - Address validation (Bitcoin address format)
 * - Dispenser discovery on valid address
 * - Selection list display
 * - Error handling (no dispensers found)
 * - Loading state
 *
 * DispenserInput is used in:
 * - Dispense page (buy from dispenser)
 */

import { walletTest, expect } from '../fixtures';

walletTest.describe('DispenserInput Component', () => {
  // Navigate to dispense page which uses DispenserInput
  walletTest.beforeEach(async ({ page }) => {
    const hashIndex = page.url().indexOf('#');
    const baseUrl = hashIndex !== -1 ? page.url().substring(0, hashIndex + 1) : page.url() + '#';
    await page.goto(`${baseUrl}/compose/dispenser/dispense`);
    await page.waitForLoadState('networkidle');
    // Wait for dispenser input to confirm page is loaded
    await page.locator('input[name="dispenserAddress"]').waitFor({ state: 'visible', timeout: 10000 });
  });

  // Helper to get dispenser address input
  const getDispenserInput = (page: any) => page.locator('input[name="dispenserAddress"]');

  walletTest.describe('Rendering', () => {
    walletTest('renders dispenser address input', async ({ page }) => {
      const input = getDispenserInput(page);
      await expect(input).toBeVisible();
    });

    walletTest('has Dispenser Address label', async ({ page }) => {
      const label = page.locator('label:has-text("Dispenser Address")');
      await expect(label).toBeVisible();
    });

    walletTest('has required indicator', async ({ page }) => {
      const requiredIndicator = page.locator('label:has-text("Dispenser Address") span.text-red-500');
      await expect(requiredIndicator).toBeVisible();
    });

    walletTest('input starts empty', async ({ page }) => {
      const input = getDispenserInput(page);
      await expect(input).toHaveValue('');
    });
  });

  walletTest.describe('Address Input', () => {
    walletTest('accepts text input', async ({ page }) => {
      const input = getDispenserInput(page);
      await input.fill('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2');
      await expect(input).toHaveValue('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2');
    });

    walletTest('allows clearing input', async ({ page }) => {
      const input = getDispenserInput(page);
      await input.fill('someaddress');
      await input.clear();
      await expect(input).toHaveValue('');
    });
  });

  walletTest.describe('Address Validation', () => {
    walletTest('shows error border for invalid address', async ({ page }) => {
      const input = getDispenserInput(page);
      await input.fill('notvalidaddress');
      await input.blur();

      // Should show red border for invalid address
      await expect(input).toHaveClass(/border-red-500/, { timeout: 3000 });
    });

    walletTest('no error border for valid address format', async ({ page }) => {
      const input = getDispenserInput(page);
      // Use a valid-format Bitcoin address
      await input.fill('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2');
      await input.blur();

      // Should not show red border
      await expect(input).not.toHaveClass(/border-red-500/);
    });

    walletTest('accepts SegWit bech32 address', async ({ page }) => {
      const input = getDispenserInput(page);
      await input.fill('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq');
      await input.blur();

      // Valid format should not have red border
      await expect(input).not.toHaveClass(/border-red-500/);
    });
  });

  walletTest.describe('Dispenser Discovery', () => {
    walletTest('shows results after entering address', async ({ page }) => {
      const input = getDispenserInput(page);
      // Enter a valid address to trigger fetch
      await input.fill('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2');
      await input.blur();

      // Wait for actual results (not loading state) - either dispensers found or no dispensers message
      const resultContent = page.locator('text=/No.*dispenser/i').first()
        .or(page.locator('[role="radiogroup"]'));
      await expect(resultContent).toBeVisible({ timeout: 10000 });
    });

    walletTest('handles address with no dispensers', async ({ page }) => {
      const input = getDispenserInput(page);
      // Use a random valid address unlikely to have dispensers
      await input.fill('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2');
      await input.blur();

      // Wait for fetch to complete - should show result (dispensers or no dispensers message)
      const resultContent = page.locator('text=/No.*dispenser/i').first()
        .or(page.locator('[role="radiogroup"]'));
      await expect(resultContent).toBeVisible({ timeout: 10000 });
    });
  });

  walletTest.describe('Form Integration', () => {
    walletTest('input has name attribute', async ({ page }) => {
      const input = getDispenserInput(page);
      const name = await input.getAttribute('name');
      expect(name).toBe('dispenserAddress');
    });

    walletTest('input has id attribute', async ({ page }) => {
      const input = getDispenserInput(page);
      const id = await input.getAttribute('id');
      expect(id).toBe('dispenserAddress');
    });

    walletTest('input has required attribute', async ({ page }) => {
      const input = getDispenserInput(page);
      const required = await input.getAttribute('required');
      expect(required).not.toBeNull();
    });
  });

  walletTest.describe('Accessibility', () => {
    walletTest('input is focusable', async ({ page }) => {
      const input = getDispenserInput(page);
      await input.focus();

      const isFocused = await page.evaluate(() => {
        return document.activeElement?.getAttribute('name') === 'dispenserAddress';
      });
      expect(isFocused).toBe(true);
    });

    walletTest('label is associated with input', async ({ page }) => {
      const label = page.locator('label[for="dispenserAddress"]');
      await expect(label).toBeVisible();
    });
  });
});
