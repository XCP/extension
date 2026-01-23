/**
 * SearchInput Component Tests
 *
 * Tests for the search input with debounce, clear button, and loading state.
 * Component: src/components/inputs/search-input.tsx
 *
 * Features tested:
 * - Rendering (input, search icon, clear button)
 * - Input behavior (typing, clearing)
 * - Debounced search triggering
 * - Loading state spinner
 * - Placeholder text
 *
 * SearchInput is used in:
 * - Pinned assets settings (search assets)
 */

import { walletTest, expect } from '../fixtures';

walletTest.describe('SearchInput Component', () => {
  // Navigate to pinned assets settings which uses SearchInput
  walletTest.beforeEach(async ({ page }) => {
    const hashIndex = page.url().indexOf('#');
    const baseUrl = hashIndex !== -1 ? page.url().substring(0, hashIndex + 1) : page.url() + '#';
    await page.goto(`${baseUrl}/settings/pinned-assets`);
    await page.waitForLoadState('networkidle');
    // Wait for search input to confirm page is loaded
    await page.locator('input[name="search"]').waitFor({ state: 'visible', timeout: 10000 });
  });

  // Helper to get search input
  const getSearchInput = (page: any) => page.locator('input[name="search"]');

  walletTest.describe('Rendering', () => {
    walletTest('renders search input field', async ({ page }) => {
      const input = getSearchInput(page);
      await expect(input).toBeVisible();
    });

    walletTest('has search icon', async ({ page }) => {
      // Search icon is positioned absolute left
      const searchIcon = page.locator('svg.text-gray-400').first();
      await expect(searchIcon).toBeVisible();
    });

    walletTest('has placeholder text', async ({ page }) => {
      const input = getSearchInput(page);
      const placeholder = await input.getAttribute('placeholder');
      expect(placeholder).toBeTruthy();
    });

    walletTest('has aria-label for accessibility', async ({ page }) => {
      const input = getSearchInput(page);
      const ariaLabel = await input.getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
    });
  });

  walletTest.describe('Input Behavior', () => {
    walletTest('accepts text input', async ({ page }) => {
      const input = getSearchInput(page);
      await input.fill('XCP');
      await expect(input).toHaveValue('XCP');
    });

    walletTest('allows typing search queries', async ({ page }) => {
      const input = getSearchInput(page);
      await input.fill('test asset');
      await expect(input).toHaveValue('test asset');
    });

    walletTest('preserves value after blur', async ({ page }) => {
      const input = getSearchInput(page);
      await input.fill('PEPECASH');
      await input.blur();
      await expect(input).toHaveValue('PEPECASH');
    });
  });

  walletTest.describe('Clear Button', () => {
    walletTest('shows clear button when input has value', async ({ page }) => {
      const input = getSearchInput(page);

      // Enter text
      await input.fill('test');

      // Clear button should appear
      const clearButton = page.locator('button[aria-label="Clear search"]');
      await expect(clearButton).toBeVisible({ timeout: 2000 });
    });

    walletTest('clicking clear button clears input', async ({ page }) => {
      const input = getSearchInput(page);
      await input.fill('test query');

      const clearButton = page.locator('button[aria-label="Clear search"]');
      await expect(clearButton).toBeVisible({ timeout: 2000 });
      await clearButton.click();

      await expect(input).toHaveValue('');
    });

    walletTest('clear button disappears after clearing', async ({ page }) => {
      const input = getSearchInput(page);
      await input.fill('test');

      const clearButton = page.locator('button[aria-label="Clear search"]');
      await expect(clearButton).toBeVisible({ timeout: 2000 });
      await clearButton.click();

      // Clear button should be hidden now
      await expect(clearButton).not.toBeVisible();
    });
  });

  walletTest.describe('Loading State', () => {
    walletTest('triggers search on input', async ({ page }) => {
      const input = getSearchInput(page);

      // Type to trigger search
      await input.fill('XCP');

      // Wait for search to complete - either spinner shows during search or results appear
      await expect(async () => {
        const spinnerCount = await page.locator('.animate-spin').count();
        // Results list should appear with asset items
        const resultsCount = await page.locator('[role="checkbox"], [role="option"], li').count();
        // Either spinner is visible OR we have results
        expect(spinnerCount > 0 || resultsCount > 0).toBe(true);
      }).toPass({ timeout: 5000 });
    });
  });

  walletTest.describe('Accessibility', () => {
    walletTest('input has name attribute', async ({ page }) => {
      const input = getSearchInput(page);
      const name = await input.getAttribute('name');
      expect(name).toBe('search');
    });

    walletTest('input is focusable', async ({ page }) => {
      const input = getSearchInput(page);
      await input.focus();

      const isFocused = await page.evaluate(() => {
        return document.activeElement?.getAttribute('name') === 'search';
      });
      expect(isFocused).toBe(true);
    });
  });
});
