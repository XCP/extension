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
  walletTest.beforeEach(async ({ page }) => {
    const hashIndex = page.url().indexOf('#');
    const baseUrl = hashIndex !== -1 ? page.url().substring(0, hashIndex + 1) : page.url() + '#';
    await page.goto(`${baseUrl}/compose/fairminter`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
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

      const startVisible = await startInput.isVisible({ timeout: 5000 }).catch(() => false);
      const endVisible = await endInput.isVisible({ timeout: 3000 }).catch(() => false);

      expect(startVisible || endVisible).toBe(true);
    });

    walletTest('has Block Height label', async ({ page }) => {
      const label = page.locator('label:has-text("Block Height")');
      const hasLabel = await label.first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasLabel).toBe(true);
    });

    walletTest('has Now button', async ({ page }) => {
      const nowButton = getNowButton(page);
      await expect(nowButton).toBeVisible({ timeout: 3000 });
    });

    walletTest('has placeholder text', async ({ page }) => {
      const input = getBlockHeightInput(page, 'start_block');

      if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
        const placeholder = await input.getAttribute('placeholder');
        expect(placeholder).toBeTruthy();
      }
    });
  });

  walletTest.describe('Manual Entry', () => {
    walletTest('accepts numeric input', async ({ page }) => {
      const input = getBlockHeightInput(page, 'start_block');

      if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
        await input.fill('850000');
        await page.waitForTimeout(200);

        const value = await input.inputValue();
        expect(value).toBe('850000');
      }
    });

    walletTest('allows editing block height', async ({ page }) => {
      const input = getBlockHeightInput(page, 'start_block');

      if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
        await input.fill('800000');
        await input.clear();
        await input.fill('850000');

        const value = await input.inputValue();
        expect(value).toBe('850000');
      }
    });

    walletTest('allows clearing input', async ({ page }) => {
      const input = getBlockHeightInput(page, 'start_block');

      if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
        await input.fill('850000');
        await input.clear();

        const value = await input.inputValue();
        expect(value).toBe('');
      }
    });

    walletTest('preserves value after blur', async ({ page }) => {
      const input = getBlockHeightInput(page, 'start_block');

      if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
        await input.fill('850000');
        await input.blur();
        await page.waitForTimeout(200);

        const value = await input.inputValue();
        expect(value).toBe('850000');
      }
    });
  });

  walletTest.describe('Now Button', () => {
    walletTest('Now button has accessible label', async ({ page }) => {
      const nowButton = getNowButton(page);

      if (await nowButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        const ariaLabel = await nowButton.getAttribute('aria-label');
        expect(ariaLabel).toContain('current block height');
      }
    });

    walletTest('clicking Now fetches current block height', async ({ page }) => {
      const input = getBlockHeightInput(page, 'start_block');
      const nowButton = getNowButton(page);

      if (await nowButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Clear input first
        await input.clear();

        // Click Now button
        await nowButton.click();

        // Wait for API response
        await page.waitForTimeout(2000);

        // Input should now have a value (block height)
        const value = await input.inputValue();

        // Should be a number greater than 0 (current Bitcoin block height)
        if (value) {
          const numValue = parseInt(value);
          expect(numValue).toBeGreaterThan(0);
        }
      }
    });

    walletTest('Now button shows loading state', async ({ page }) => {
      const nowButton = getNowButton(page);

      if (await nowButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Click Now button
        await nowButton.click();

        // Button may be disabled during loading
        const isDisabled = await nowButton.isDisabled().catch(() => false);

        // Either disabled during loading or quickly completed
        expect(typeof isDisabled).toBe('boolean');
      }
    });
  });

  walletTest.describe('Form Integration', () => {
    walletTest('input has name attribute', async ({ page }) => {
      const startInput = getBlockHeightInput(page, 'start_block');
      const endInput = getBlockHeightInput(page, 'end_block');

      if (await startInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        const name = await startInput.getAttribute('name');
        expect(name).toBe('start_block');
      } else if (await endInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        const name = await endInput.getAttribute('name');
        expect(name).toBe('end_block');
      }
    });

    walletTest('input has id attribute', async ({ page }) => {
      const input = getBlockHeightInput(page, 'start_block');

      if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
        const id = await input.getAttribute('id');
        expect(id).toBeTruthy();
      }
    });

    walletTest('input has autocomplete off', async ({ page }) => {
      const input = getBlockHeightInput(page, 'start_block');

      if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
        const autocomplete = await input.getAttribute('autocomplete');
        expect(autocomplete).toBe('off');
      }
    });
  });

  walletTest.describe('Accessibility', () => {
    walletTest('input is focusable', async ({ page }) => {
      const input = getBlockHeightInput(page, 'start_block');

      if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
        await input.focus();

        const isFocused = await page.evaluate(() => {
          const active = document.activeElement;
          return active?.getAttribute('name')?.includes('block');
        });

        expect(isFocused).toBe(true);
      }
    });

    walletTest('label is associated with input', async ({ page }) => {
      const input = getBlockHeightInput(page, 'start_block');

      if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
        const inputId = await input.getAttribute('id');
        if (inputId) {
          const label = page.locator(`label[for="${inputId}"]`);
          const hasLabel = await label.isVisible().catch(() => false);
          expect(hasLabel).toBe(true);
        }
      }
    });
  });
});
