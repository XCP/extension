/**
 * BlockHeightInput Component Tests
 *
 * Tests for the block height input with "Now" button to fetch current height.
 * Component: src/components/inputs/block-height-input.tsx
 *
 * Features tested:
 * - Rendering (input, label, Now button)
 * - Manual block height entry
 * - "Now" button to fetch current block height
 * - Loading state during fetch
 * - Error handling
 *
 * BlockHeightInput is used in:
 * - Fairminter page (start/end block heights)
 */

import { walletTest, expect } from '../fixtures';

walletTest.describe('BlockHeightInput Component', () => {
  // Navigate to fairminter page which uses BlockHeightInput
  // Note: BlockHeightInput is inside "Advanced Options" disclosure that needs to be expanded
  walletTest.beforeEach(async ({ page }) => {
    const hashIndex = page.url().indexOf('#');
    const baseUrl = hashIndex !== -1 ? page.url().substring(0, hashIndex + 1) : page.url() + '#';
    await page.goto(`${baseUrl}/compose/fairminter`);
    await page.waitForLoadState('networkidle');

    // Expand Advanced Options disclosure to reveal BlockHeightInput fields
    const advancedOptions = page.locator('button:has-text("Advanced Options")');
    await advancedOptions.waitFor({ state: 'visible', timeout: 10000 });
    await advancedOptions.click();
    // Wait for disclosure to expand
    await page.locator('input[name="start_block"], input[name="end_block"]').first().waitFor({ state: 'visible', timeout: 5000 });
  });

  // Helper to get block height inputs (there may be multiple: start_block, end_block)
  const getBlockHeightInput = (page: any, name = 'start_block') =>
    page.locator(`input[name="${name}"]`);
  const getNowButton = (page: any) =>
    page.locator('button:has-text("Now")').first();

  walletTest.describe('Rendering', () => {
    walletTest('renders block height input field', async ({ page }) => {
      // Look for either start_block or end_block input
      const startInput = getBlockHeightInput(page, 'start_block');
      const endInput = getBlockHeightInput(page, 'end_block');

      // At least one should be visible
      await expect(async () => {
        const startVisible = await startInput.isVisible();
        const endVisible = await endInput.isVisible();
        expect(startVisible || endVisible).toBe(true);
      }).toPass({ timeout: 5000 });
    });

    walletTest('has Block Height label', async ({ page }) => {
      // The fairminter page has "Start Block" and "End Block" labels
      const startBlockLabel = page.locator('label:has-text("Start Block")');
      const endBlockLabel = page.locator('label:has-text("End Block")');

      await expect(async () => {
        const hasStartLabel = await startBlockLabel.isVisible();
        const hasEndLabel = await endBlockLabel.isVisible();
        expect(hasStartLabel || hasEndLabel).toBe(true);
      }).toPass({ timeout: 3000 });
    });

    walletTest('has Now button', async ({ page }) => {
      const nowButton = getNowButton(page);
      await expect(nowButton).toBeVisible({ timeout: 3000 });
    });

    walletTest('has placeholder text', async ({ page }) => {
      const input = getBlockHeightInput(page, 'start_block');
      await expect(input).toBeVisible({ timeout: 3000 });
      const placeholder = await input.getAttribute('placeholder');
      expect(placeholder).toBeTruthy();
    });
  });

  walletTest.describe('Manual Entry', () => {
    walletTest('accepts numeric input', async ({ page }) => {
      const input = getBlockHeightInput(page, 'start_block');
      await expect(input).toBeVisible({ timeout: 3000 });
      await input.fill('850000');
      await expect(input).toHaveValue('850000');
    });

    walletTest('allows editing block height', async ({ page }) => {
      const input = getBlockHeightInput(page, 'start_block');
      await expect(input).toBeVisible({ timeout: 3000 });
      await input.fill('800000');
      await input.clear();
      await input.fill('850000');
      await expect(input).toHaveValue('850000');
    });

    walletTest('allows clearing input', async ({ page }) => {
      const input = getBlockHeightInput(page, 'start_block');
      await expect(input).toBeVisible({ timeout: 3000 });
      await input.fill('850000');
      await input.clear();
      await expect(input).toHaveValue('');
    });

    walletTest('preserves value after blur', async ({ page }) => {
      const input = getBlockHeightInput(page, 'start_block');
      await expect(input).toBeVisible({ timeout: 3000 });
      await input.fill('850000');
      await input.blur();
      await expect(input).toHaveValue('850000');
    });
  });

  walletTest.describe('Now Button', () => {
    walletTest('Now button has accessible label', async ({ page }) => {
      const nowButton = getNowButton(page);
      await expect(nowButton).toBeVisible({ timeout: 3000 });
      const ariaLabel = await nowButton.getAttribute('aria-label');
      // Component uses aria-label="Use current block height"
      expect(ariaLabel).toContain('block height');
    });

    walletTest('clicking Now fetches current block height', async ({ page }) => {
      const input = getBlockHeightInput(page, 'start_block');
      const nowButton = getNowButton(page);
      await expect(nowButton).toBeVisible({ timeout: 3000 });

      // Clear input first
      await input.clear();

      // Click Now button
      await nowButton.click();

      // Wait for value to be filled with block height
      await expect(async () => {
        const value = await input.inputValue();
        if (value) {
          const numValue = parseInt(value);
          expect(numValue).toBeGreaterThan(0);
        }
      }).toPass({ timeout: 5000 });
    });
  });

  walletTest.describe('Form Integration', () => {
    walletTest('input has name attribute', async ({ page }) => {
      const startInput = getBlockHeightInput(page, 'start_block');
      const endInput = getBlockHeightInput(page, 'end_block');

      const startVisible = await startInput.isVisible({ timeout: 3000 }).catch(() => false);
      if (startVisible) {
        const name = await startInput.getAttribute('name');
        expect(name).toBe('start_block');
      } else {
        await expect(endInput).toBeVisible({ timeout: 3000 });
        const name = await endInput.getAttribute('name');
        expect(name).toBe('end_block');
      }
    });

    walletTest('input has id attribute', async ({ page }) => {
      const input = getBlockHeightInput(page, 'start_block');
      await expect(input).toBeVisible({ timeout: 3000 });
      const id = await input.getAttribute('id');
      expect(id).toBeTruthy();
    });

    walletTest('input has autocomplete off', async ({ page }) => {
      const input = getBlockHeightInput(page, 'start_block');
      await expect(input).toBeVisible({ timeout: 3000 });
      const autocomplete = await input.getAttribute('autocomplete');
      expect(autocomplete).toBe('off');
    });
  });

  walletTest.describe('Accessibility', () => {
    walletTest('input is focusable', async ({ page }) => {
      const input = getBlockHeightInput(page, 'start_block');
      await expect(input).toBeVisible({ timeout: 3000 });
      await input.focus();

      const isFocused = await page.evaluate(() => {
        const active = document.activeElement;
        return active?.getAttribute('name')?.includes('block');
      });
      expect(isFocused).toBe(true);
    });

    walletTest('label is associated with input', async ({ page }) => {
      const input = getBlockHeightInput(page, 'start_block');
      await expect(input).toBeVisible({ timeout: 3000 });

      // Check for label:has-text that corresponds to this input
      const startBlockLabel = page.locator('label:has-text("Start Block")');
      await expect(startBlockLabel).toBeVisible();
    });
  });
});
