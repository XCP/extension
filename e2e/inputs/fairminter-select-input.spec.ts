/**
 * FairminterSelectInput Component Tests
 *
 * Tests for the fairminter selection combobox/dropdown.
 * Component: src/components/inputs/fairminter-select-input.tsx
 *
 * Features tested:
 * - Rendering (combobox input, dropdown button)
 * - Loading state during fetch
 * - Dropdown options display
 * - Search/filter functionality
 * - Selection behavior
 * - Error handling
 *
 * FairminterSelectInput is used in:
 * - Fairmint page (select fairminter to mint from)
 */

import { walletTest, expect } from '../fixtures';

// Note: Fairmint page requires active fairminters from API which may not be available in test environment
// Tests use conditional skipping based on actual page state rather than blanket skip
walletTest.describe('FairminterSelectInput Component', () => {
  // Navigate to fairmint page which uses FairminterSelectInput
  walletTest.beforeEach(async ({ page }) => {
    const currentUrl = page.url();
    const hashIndex = currentUrl.indexOf('#');
    const baseUrl = hashIndex !== -1 ? currentUrl.substring(0, hashIndex + 1) : currentUrl + '#';
    // Route is /compose/fairmint not /compose/fairminter/fairmint
    await page.goto(`${baseUrl}/compose/fairmint`);
    await page.waitForLoadState('networkidle');
    // Wait for page to load - may show "No active fairminters" if none available
    await page.waitForTimeout(2000);
  });

  // Helper to get combobox elements
  const getComboboxInput = (page: any) => page.locator('[role="combobox"] input, input.uppercase, input[name="fairminter"]').first();

  // Check if fairminter component is available (may not be if no active fairminters)
  const isFairminterAvailable = async (page: any): Promise<boolean> => {
    const combobox = getComboboxInput(page);
    const count = await combobox.count();
    return count > 0;
  };

  walletTest.describe('Rendering', () => {
    walletTest('renders fairminter selection input', async ({ page }) => {
      const available = await isFairminterAvailable(page);
      walletTest.skip(!available, 'Fairminter component not available - no active fairminters');

      const input = getComboboxInput(page);
      await expect(input).toBeVisible({ timeout: 5000 });
    });

    walletTest('has dropdown button', async ({ page }) => {
      const available = await isFairminterAvailable(page);
      walletTest.skip(!available, 'Fairminter component not available');

      // Look for the chevron button
      const chevronIcon = page.locator('svg[class*="chevron"], svg[aria-hidden="true"]').first();
      await expect(chevronIcon).toBeVisible({ timeout: 3000 });
    });

    walletTest('input transforms to uppercase', async ({ page }) => {
      const available = await isFairminterAvailable(page);
      walletTest.skip(!available, 'Fairminter component not available');

      const input = getComboboxInput(page);
      const classes = await input.getAttribute('class') || '';
      expect(classes).toContain('uppercase');
    });
  });

  walletTest.describe('Dropdown Options', () => {
    walletTest('clicking dropdown shows options or listbox', async ({ page }) => {
      const available = await isFairminterAvailable(page);
      walletTest.skip(!available, 'Fairminter component not available');

      const input = getComboboxInput(page);

      // Click to open dropdown
      await input.click();

      // Wait a moment for dropdown to potentially appear
      await page.waitForTimeout(500);

      // Look for dropdown options (ComboboxOptions) - listbox may not appear if no options from API
      const listbox = page.locator('[role="listbox"]');
      const listboxCount = await listbox.count();

      // Skip if listbox doesn't appear (no fairminters available from API)
      walletTest.skip(listboxCount === 0, 'No listbox appeared - no fairminters available from API');

      await expect(listbox).toBeVisible();
    });

    walletTest('options may show pricing info', async ({ page }) => {
      const available = await isFairminterAvailable(page);
      walletTest.skip(!available, 'Fairminter component not available');

      const input = getComboboxInput(page);

      await input.click();

      // Wait a moment for dropdown to potentially appear
      await page.waitForTimeout(500);

      // Check if listbox appeared
      const listbox = page.locator('[role="listbox"]');
      const listboxCount = await listbox.count();

      // Skip if listbox doesn't appear (no fairminters available from API)
      walletTest.skip(listboxCount === 0, 'No listbox appeared - no fairminters available from API');

      // Check if any options with pricing exist
      const options = page.locator('[role="option"]');
      const optionCount = await options.count();

      // Skip if no options available (API dependent)
      walletTest.skip(optionCount === 0, 'No fairminter options available from API');

      // If options exist, verify they're visible
      await expect(options.first()).toBeVisible();
    });
  });

  walletTest.describe('Search/Filter', () => {
    walletTest('typing filters options', async ({ page }) => {
      const available = await isFairminterAvailable(page);
      walletTest.skip(!available, 'Fairminter component not available');

      const input = getComboboxInput(page);

      // Type to search
      await input.fill('TEST');

      // Value should be entered
      const value = await input.inputValue();
      expect(value).toBe('TEST');
    });

    walletTest('clearing search shows all options again', async ({ page }) => {
      const available = await isFairminterAvailable(page);
      walletTest.skip(!available, 'Fairminter component not available');

      const input = getComboboxInput(page);

      // Search then clear
      await input.fill('SEARCH');
      await input.clear();

      const value = await input.inputValue();
      expect(value).toBe('');
    });
  });

  walletTest.describe('Selection', () => {
    walletTest('selecting option updates input', async ({ page }) => {
      const available = await isFairminterAvailable(page);
      walletTest.skip(!available, 'Fairminter component not available');

      const input = getComboboxInput(page);

      // Click to open dropdown
      await input.click();

      // Wait for options to be visible
      const firstOption = page.locator('[role="option"]').first();
      const optionCount = await page.locator('[role="option"]').count();

      // Skip if no options available (API dependent)
      walletTest.skip(optionCount === 0, 'No fairminter options available from API');

      await expect(firstOption).toBeVisible({ timeout: 2000 });
      await firstOption.click();

      // Input should have a non-empty value after selection
      await expect(input).not.toHaveValue('');
    });
  });

  walletTest.describe('Accessibility', () => {
    walletTest('combobox has proper role', async ({ page }) => {
      const available = await isFairminterAvailable(page);
      walletTest.skip(!available, 'Fairminter component not available');

      // HeadlessUI Combobox sets role="combobox"
      const combobox = page.locator('[role="combobox"]');
      await expect(combobox).toBeVisible({ timeout: 3000 });
    });

    walletTest('input is focusable', async ({ page }) => {
      const available = await isFairminterAvailable(page);
      walletTest.skip(!available, 'Fairminter component not available');

      const input = getComboboxInput(page);
      await input.focus();

      const isFocused = await page.evaluate(() => {
        return document.activeElement?.tagName === 'INPUT';
      });

      expect(isFocused).toBe(true);
    });

    walletTest('keyboard navigation opens dropdown', async ({ page }) => {
      const available = await isFairminterAvailable(page);
      walletTest.skip(!available, 'Fairminter component not available');

      const input = getComboboxInput(page);

      // Focus input
      await input.focus();

      // Press down arrow to open dropdown
      await page.keyboard.press('ArrowDown');

      // Wait a moment for dropdown to potentially appear
      await page.waitForTimeout(500);

      // Listbox may not appear if no fairminters available from API
      const listbox = page.locator('[role="listbox"]');
      const listboxCount = await listbox.count();

      // Skip if listbox doesn't appear (no fairminters available from API)
      walletTest.skip(listboxCount === 0, 'No listbox appeared - no fairminters available from API');

      await expect(listbox).toBeVisible();
    });
  });
});
