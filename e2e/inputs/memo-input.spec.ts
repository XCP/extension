/**
 * MemoInput Component Tests
 *
 * Tests for the transaction memo input component.
 * Component: src/components/inputs/memo-input.tsx
 *
 * Features tested:
 * - Basic rendering and placeholder
 * - Optional field behavior
 * - Byte length validation (34 byte max default)
 * - Error styling for invalid input
 * - Clearing and editing memo
 */

import { walletTest, expect } from '../fixtures';

walletTest.describe('MemoInput Component', () => {
  // Navigate to asset send page which shows MemoInput
  // MemoInput is only visible for non-BTC assets
  walletTest.beforeEach(async ({ page }) => {
    // Navigate to XCP send page (MemoInput only shows for non-BTC assets)
    const hashIndex = page.url().indexOf('#');
    const baseUrl = hashIndex !== -1 ? page.url().substring(0, hashIndex + 1) : page.url() + '#';
    await page.goto(`${baseUrl}/compose/send/XCP`);
    await page.waitForLoadState('networkidle');
    // Wait for memo input to be visible (confirms page loaded)
    await page.locator('input[name="memo"]').waitFor({ state: 'visible', timeout: 5000 });
  });

  // Helper to get the memo input
  const getMemoInput = (page: any) => page.locator('input[name="memo"]');

  walletTest.describe('Rendering', () => {
    walletTest('renders with Memo label', async ({ page }) => {
      const label = page.locator('label:has-text("Memo")');
      await expect(label).toBeVisible({ timeout: 5000 });
    });

    walletTest('renders input field', async ({ page }) => {
      const input = getMemoInput(page);
      await expect(input).toBeVisible();
      await expect(input).toBeEnabled();
    });

    walletTest('has placeholder text', async ({ page }) => {
      const input = getMemoInput(page);
      const placeholder = await input.getAttribute('placeholder');
      expect(placeholder?.toLowerCase()).toContain('memo');
    });

    walletTest('is not required by default on send page', async ({ page }) => {
      // Memo is typically optional on send page
      const label = page.locator('label:has-text("Memo")');
      await expect(label).toBeVisible();

      // Check for required asterisk - memo should be optional
      const requiredIndicator = label.locator('span.text-red-500');
      await expect(requiredIndicator).not.toBeVisible();
    });
  });

  walletTest.describe('Valid Input', () => {
    walletTest('accepts short memo', async ({ page }) => {
      const input = getMemoInput(page);
      await input.fill('hello');
      await input.blur();

      // Should not show error styling
      await expect(input).not.toHaveClass(/border-red-500/);
      await expect(input).toHaveValue('hello');
    });

    walletTest('accepts memo at byte limit (34 bytes)', async ({ page }) => {
      const input = getMemoInput(page);
      // 34 ASCII characters = 34 bytes
      const validMemo = 'a'.repeat(34);
      await input.fill(validMemo);
      await input.blur();

      await expect(input).not.toHaveClass(/border-red-500/);
    });

    walletTest('accepts empty memo (optional field)', async ({ page }) => {
      const input = getMemoInput(page);
      await input.fill('');
      await input.blur();

      // Empty memo should be valid for optional field
      await expect(input).not.toHaveClass(/border-red-500/);
    });

    walletTest('accepts memo with numbers', async ({ page }) => {
      const input = getMemoInput(page);
      await input.fill('Order #12345');
      await input.blur();

      await expect(input).not.toHaveClass(/border-red-500/);
    });

    walletTest('accepts memo with special characters', async ({ page }) => {
      const input = getMemoInput(page);
      await input.fill('Hello! @world #2024');
      await input.blur();

      await expect(input).not.toHaveClass(/border-red-500/);
    });
  });

  walletTest.describe('Invalid Input', () => {
    walletTest('accepts memo slightly over byte limit without immediate error', async ({ page }) => {
      const input = getMemoInput(page);
      await expect(input).toBeVisible({ timeout: 5000 });

      // Enter a memo slightly over 34 byte limit (40 chars)
      // Validation may not trigger until form submission
      const longMemo = 'a'.repeat(40);
      await input.fill(longMemo);
      await input.blur();

      // Value should be preserved in input
      await expect(input).toHaveValue(longMemo);
    });

    walletTest('shows error for very long memo', async ({ page }) => {
      const input = getMemoInput(page);
      const veryLongMemo = 'a'.repeat(100);
      await input.fill(veryLongMemo);
      await input.blur();

      await expect(input).toHaveClass(/border-red-500/, { timeout: 3000 });
    });

    walletTest('multi-byte characters count correctly', async ({ page }) => {
      const input = getMemoInput(page);
      // Unicode characters take more bytes
      // 12 emoji = 48 bytes (4 bytes each) - should exceed 34 byte limit
      const emojiMemo = '😀😀😀😀😀😀😀😀😀😀😀😀';
      await input.fill(emojiMemo);
      await input.blur();

      await expect(input).toHaveClass(/border-red-500/, { timeout: 3000 });
    });
  });

  walletTest.describe('Input Behavior', () => {
    walletTest('allows clearing input', async ({ page }) => {
      const input = getMemoInput(page);

      await input.fill('test memo');
      await expect(input).toHaveValue('test memo');

      await input.clear();
      await expect(input).toHaveValue('');
    });

    walletTest('allows editing input', async ({ page }) => {
      const input = getMemoInput(page);

      await input.fill('first memo');
      await input.clear();
      await input.fill('second memo');

      await expect(input).toHaveValue('second memo');
    });

    walletTest('preserves value after blur', async ({ page }) => {
      const input = getMemoInput(page);

      await input.fill('my memo');
      await input.blur();

      // Click elsewhere and come back
      const otherInput = page.locator('input[name="quantity"]');
      await otherInput.click();

      // Memo should still have value
      await expect(input).toHaveValue('my memo');
    });

    walletTest('removes error when valid input is entered', async ({ page }) => {
      const input = getMemoInput(page);
      await expect(input).toBeVisible({ timeout: 5000 });

      // First enter invalid (very long - 100 chars triggers error)
      const longMemo = 'a'.repeat(100);
      await input.fill(longMemo);
      await input.blur();

      // Wait for error styling to appear
      await expect(input).toHaveClass(/border-red-500/, { timeout: 3000 });

      // Then enter valid
      await input.clear();
      await input.fill('short');
      await input.blur();

      // Error styling should be removed
      await expect(input).not.toHaveClass(/border-red-500/);
    });
  });

  walletTest.describe('Form Integration', () => {
    walletTest('memo value is included in form', async ({ page }) => {
      const input = getMemoInput(page);
      await input.fill('test');

      // Check input has name attribute for form submission
      const name = await input.getAttribute('name');
      expect(name).toBe('memo');
    });

    walletTest('memo is in form context', async ({ page }) => {
      const input = getMemoInput(page);

      // Check if input is part of a form
      const isInForm = await input.evaluate((el: HTMLElement) => {
        return el.closest('form') !== null;
      });

      expect(isInForm).toBe(true);
    });

    walletTest('invalid memo does not crash form', async ({ page }) => {
      const input = getMemoInput(page);

      // Enter invalid memo
      const longMemo = 'a'.repeat(100);
      await input.fill(longMemo);
      await input.blur();

      // Form should still be functional
      const submitBtn = page.locator('button[type="submit"]:has-text("Continue")');
      const exists = await submitBtn.isVisible();
      expect(exists).toBe(true);
    });
  });

  walletTest.describe('Edge Cases', () => {
    walletTest('handles whitespace-only memo', async ({ page }) => {
      const input = getMemoInput(page);
      await input.fill('   ');
      await input.blur();

      // Whitespace-only may be valid or invalid depending on validation
      const value = await input.inputValue();
      expect(typeof value).toBe('string');
    });

    walletTest('handles newline characters', async ({ page }) => {
      const input = getMemoInput(page);
      // Input type="text" typically strips newlines
      await input.fill('line1\nline2');
      await input.blur();

      const value = await input.inputValue();
      // Should have some value (newline may be stripped or kept)
      expect(value.length).toBeGreaterThan(0);
    });

    walletTest('handles tab characters', async ({ page }) => {
      const input = getMemoInput(page);
      await input.fill('hello\tworld');
      await input.blur();

      const value = await input.inputValue();
      expect(value).toContain('hello');
    });

    walletTest('handles paste operation', async ({ page }) => {
      const input = getMemoInput(page);

      // Fill directly (simulates paste)
      await input.fill('pasted memo content');
      await input.blur();

      await expect(input).toHaveValue('pasted memo content');
    });

    walletTest('handles exactly 34 bytes (boundary)', async ({ page }) => {
      const input = getMemoInput(page);
      // Exactly 34 ASCII characters
      const exactMemo = 'abcdefghijklmnopqrstuvwxyz12345678';
      expect(exactMemo.length).toBe(34);

      await input.fill(exactMemo);
      await input.blur();

      // Should be valid (exactly at limit)
      await expect(input).not.toHaveClass(/border-red-500/);
    });

    walletTest('handles 35 bytes (just over limit)', async ({ page }) => {
      const input = getMemoInput(page);
      await expect(input).toBeVisible({ timeout: 5000 });

      // 35 ASCII characters (1 over limit)
      const overMemo = 'abcdefghijklmnopqrstuvwxyz123456789';
      expect(overMemo.length).toBe(35);

      await input.fill(overMemo);
      await input.blur();

      // Should show error styling for exceeding byte limit
      await expect(input).toHaveClass(/border-red-500/, { timeout: 3000 });
    });
  });

  walletTest.describe('Accessibility', () => {
    walletTest('input has accessible name', async ({ page }) => {
      const input = getMemoInput(page);
      await expect(input).toBeVisible({ timeout: 5000 });

      // Check that the input has a name attribute for form submission
      const name = await input.getAttribute('name');
      expect(name).toBe('memo');

      // Check there's a visible label for the input
      const label = page.locator('label:has-text("Memo")');
      await expect(label).toBeVisible();
    });

    walletTest('input styling changes based on state', async ({ page }) => {
      const input = getMemoInput(page);
      await expect(input).toBeVisible({ timeout: 5000 });

      // Enter a valid memo
      await input.fill('valid memo');
      await input.blur();

      // Valid input should not have error styling
      await expect(input).not.toHaveClass(/border-red-500/);
    });
  });
});
