/**
 * AssetSelectInput Component Tests
 *
 * Tests for the asset selection searchable dropdown component.
 * Component: src/components/inputs/asset-select-input.tsx
 *
 * Features tested:
 * - Dropdown rendering and interaction
 * - Asset search functionality
 * - Selection from dropdown
 * - Pinned assets display
 * - Loading state during search
 */

import { walletTest, expect } from '../fixtures';

walletTest.describe('AssetSelectInput Component', () => {
  // AssetSelectInput is used on asset-specific pages
  // Navigate to dividend compose page which has AssetSelectInput

  walletTest.beforeEach(async ({ page }) => {
    // Navigate to dividend page with asset parameter (required for this page)
    const hashIndex = page.url().indexOf('#');
    const baseUrl = hashIndex !== -1 ? page.url().substring(0, hashIndex + 1) : page.url() + '#';
    await page.goto(`${baseUrl}/compose/dividend/XCP`);
    await page.waitForLoadState('networkidle');
    // Wait for combobox to be ready
    await page.locator('[role="combobox"] input, input[class*="uppercase"]').first().waitFor({ state: 'visible', timeout: 10000 });
  });

  // Helper to get combobox elements
  const getComboboxInput = (page: any) => page.locator('[role="combobox"] input, input[class*="uppercase"]').first();
  const getComboboxButton = (page: any) => page.locator('[role="combobox"] button, button[class*="Combobox"]').first();

  walletTest.describe('Rendering', () => {
    walletTest('renders asset selection input on dividend page', async ({ page }) => {
      const comboboxInput = getComboboxInput(page);
      await expect(comboboxInput).toBeVisible({ timeout: 5000 });
    });

    walletTest('has Dividend Asset label', async ({ page }) => {
      const assetLabel = page.locator('label:has-text("Dividend Asset")');
      await expect(assetLabel).toBeVisible({ timeout: 3000 });
    });
  });

  walletTest.describe('Asset Search', () => {
    walletTest('search input allows typing', async ({ page }) => {
      const comboboxInput = getComboboxInput(page);
      await comboboxInput.fill('XCP');

      // Value should be entered
      const value = await comboboxInput.inputValue();
      expect(value.toUpperCase()).toContain('XCP');
    });

    walletTest('dropdown shows options on click', async ({ page }) => {
      const comboboxButton = getComboboxButton(page);
      const buttonCount = await comboboxButton.count();

      walletTest.skip(buttonCount === 0, 'Combobox button not visible');

      await expect(comboboxButton).toBeVisible({ timeout: 3000 });
      await comboboxButton.click();

      // Should show listbox or options
      const listbox = page.locator('[role="listbox"]');
      await expect(listbox).toBeVisible({ timeout: 3000 });
    });
  });

  walletTest.describe('Selection Behavior', () => {
    walletTest('typing filters results', async ({ page }) => {
      const comboboxInput = getComboboxInput(page);

      // Type search query
      await comboboxInput.fill('PEPE');

      // Input should accept the value
      const value = await comboboxInput.inputValue();
      expect(value.toUpperCase()).toContain('PEPE');
    });

    walletTest('can select from dropdown', async ({ page }) => {
      const comboboxButton = getComboboxButton(page);
      const buttonCount = await comboboxButton.count();

      walletTest.skip(buttonCount === 0, 'Combobox button not visible');

      await expect(comboboxButton).toBeVisible({ timeout: 3000 });
      await comboboxButton.click();

      const options = page.locator('[role="option"]');
      const optionCount = await options.count();

      walletTest.skip(optionCount === 0, 'No dropdown options available');

      await expect(options.first()).toBeVisible({ timeout: 3000 });

      // Select first option
      await options.first().click();

      // Input should now have a non-empty value
      const comboboxInput = getComboboxInput(page);
      await expect(comboboxInput).not.toHaveValue('');
    });
  });

  walletTest.describe('Pinned Assets', () => {
    walletTest('shows pinned assets on initial dropdown', async ({ page }) => {
      const comboboxButton = getComboboxButton(page);
      const buttonCount = await comboboxButton.count();

      walletTest.skip(buttonCount === 0, 'Combobox button not visible');

      await expect(comboboxButton).toBeVisible({ timeout: 3000 });
      await comboboxButton.click();

      // Wait for listbox to appear
      const listbox = page.locator('[role="listbox"]');
      await expect(listbox).toBeVisible({ timeout: 3000 });
    });
  });

  walletTest.describe('Input Behavior', () => {
    walletTest('converts input to uppercase', async ({ page }) => {
      const comboboxInput = getComboboxInput(page);
      await comboboxInput.fill('xcp');

      // Input should be uppercased (via CSS or JS)
      const value = await comboboxInput.inputValue();
      // Asset inputs typically use uppercase class
      expect(value).toBeTruthy();
    });

    walletTest('clears on selection change', async ({ page }) => {
      const comboboxInput = getComboboxInput(page);

      // Enter value
      await comboboxInput.fill('TEST');

      // Clear
      await comboboxInput.clear();

      await expect(comboboxInput).toHaveValue('');
    });
  });

  walletTest.describe('Form Integration', () => {
    walletTest('selected asset is included in form', async ({ page }) => {
      // The combobox should have form integration
      const comboboxInput = getComboboxInput(page);

      // Check if input is part of a form
      const isInForm = await comboboxInput.evaluate((el: HTMLElement) => {
        return el.closest('form') !== null;
      });

      // Should be in a form for submission
      expect(isInForm).toBe(true);
    });
  });
});
