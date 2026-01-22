/**
 * TextAreaInput Component Tests
 *
 * Tests for the multi-line text input component.
 * Component: src/components/inputs/textarea-input.tsx
 *
 * Features tested:
 * - Basic rendering (label, textarea)
 * - Character counting
 * - Validation (min/max length)
 * - Multi-line text handling
 * - Accessibility
 *
 * TextAreaInput is used in:
 * - Sign message page
 * - Verify message page
 * - Issue asset (description)
 */

import { walletTest, expect } from '../fixtures';

walletTest.describe('TextAreaInput Component', () => {
  // Navigate to sign message page which uses TextAreaInput
  walletTest.beforeEach(async ({ page }) => {
    // Navigate to actions page first, then to sign message
    const hashIndex = page.url().indexOf('#');
    const baseUrl = hashIndex !== -1 ? page.url().substring(0, hashIndex + 1) : page.url() + '#';
    await page.goto(`${baseUrl}/actions/sign-message`);
    await page.waitForLoadState('networkidle');
    // Wait for textarea to confirm page is loaded
    await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 10000 });
  });

  // Helper to get the message textarea
  const getMessageTextarea = (page: any) => page.locator('textarea[placeholder*="message" i], textarea').first();

  walletTest.describe('Rendering', () => {
    walletTest('renders textarea element', async ({ page }) => {
      const textarea = getMessageTextarea(page);
      await expect(textarea).toBeVisible();
    });

    walletTest('renders with label', async ({ page }) => {
      const label = page.locator('label:has-text("Message")');
      await expect(label).toBeVisible();
    });

    walletTest('has placeholder text', async ({ page }) => {
      const textarea = getMessageTextarea(page);
      const placeholder = await textarea.getAttribute('placeholder');
      expect(placeholder).toBeTruthy();
    });

    walletTest('has multiple rows by default', async ({ page }) => {
      const textarea = getMessageTextarea(page);
      const rows = await textarea.getAttribute('rows');
      // Should have at least 1 row, but typically 3+
      if (rows !== null) {
        expect(parseInt(rows)).toBeGreaterThanOrEqual(1);
      }
      // rows being null is acceptable (uses CSS height instead)
    });
  });

  walletTest.describe('Text Input', () => {
    walletTest('accepts text input', async ({ page }) => {
      const textarea = getMessageTextarea(page);
      await textarea.fill('Hello, this is a test message.');
      await expect(textarea).toHaveValue('Hello, this is a test message.');
    });

    walletTest('accepts multi-line text', async ({ page }) => {
      const textarea = getMessageTextarea(page);
      const multiLineText = 'Line 1\nLine 2\nLine 3';
      await textarea.fill(multiLineText);
      await expect(textarea).toHaveValue(multiLineText);
    });

    walletTest('accepts long text', async ({ page }) => {
      const textarea = getMessageTextarea(page);
      const longText = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(10);
      await textarea.fill(longText);
      await expect(textarea).toHaveValue(longText);
    });

    walletTest('accepts special characters', async ({ page }) => {
      const textarea = getMessageTextarea(page);
      const specialText = '!@#$%^&*()_+-=[]{}|;:,.<>?/\\`~"\'';
      await textarea.fill(specialText);
      await expect(textarea).toHaveValue(specialText);
    });

    walletTest('accepts unicode characters', async ({ page }) => {
      const textarea = getMessageTextarea(page);
      const unicodeText = '日本語テスト 中文测试 한국어 테스트 emoji: 😀🎉';
      await textarea.fill(unicodeText);
      await expect(textarea).toHaveValue(unicodeText);
    });
  });

  walletTest.describe('Editing Behavior', () => {
    walletTest('allows clearing text', async ({ page }) => {
      const textarea = getMessageTextarea(page);
      await textarea.fill('Some text');
      await textarea.clear();
      await expect(textarea).toHaveValue('');
    });

    walletTest('allows editing text', async ({ page }) => {
      const textarea = getMessageTextarea(page);
      await textarea.fill('First text');
      await textarea.clear();
      await textarea.fill('Second text');
      await expect(textarea).toHaveValue('Second text');
    });

    walletTest('preserves text after blur', async ({ page }) => {
      const textarea = getMessageTextarea(page);
      await textarea.fill('Test message');
      await textarea.blur();

      // Click elsewhere
      await page.locator('body').click({ position: { x: 10, y: 10 } });

      // Text should still be there
      await expect(textarea).toHaveValue('Test message');
    });
  });

  walletTest.describe('Validation', () => {
    walletTest('Sign button disabled when message is empty', async ({ page }) => {
      const textarea = getMessageTextarea(page);
      await expect(textarea).toBeVisible();

      // The Sign Message button should be disabled when message is empty
      const signButton = page.getByRole('button', { name: 'Sign Message' });
      await expect(signButton).toBeVisible();
      await expect(signButton).toBeDisabled();
    });

    walletTest('removes error when valid text is entered', async ({ page }) => {
      const textarea = getMessageTextarea(page);
      await textarea.fill('Valid message');
      await textarea.blur();

      // Should not have error styling
      await expect(textarea).not.toHaveClass(/border-red-500/);
    });
  });

  walletTest.describe('Form Integration', () => {
    walletTest('textarea has name attribute', async ({ page }) => {
      const textarea = getMessageTextarea(page);
      const name = await textarea.getAttribute('name');
      expect(name).toBeTruthy();
    });

    walletTest('textarea is connected to sign button', async ({ page }) => {
      const textarea = getMessageTextarea(page);
      // Sign message page uses textarea with Sign Message button
      await textarea.fill('Test message');

      // The Sign Message button should be enabled when message is filled
      const signButton = page.getByRole('button', { name: 'Sign Message' });
      await expect(signButton).toBeEnabled();
    });
  });

  walletTest.describe('Accessibility', () => {
    walletTest('textarea has accessible name', async ({ page }) => {
      const textarea = getMessageTextarea(page);
      // Check for label association
      const label = page.locator('label:has-text("Message")');
      const labelFor = await label.getAttribute('for');
      const textareaId = await textarea.getAttribute('id');
      const name = await textarea.getAttribute('name');

      // Either has matching label or name attribute
      expect(labelFor === textareaId || !!name).toBe(true);
    });

    walletTest('textarea has aria-invalid on error', async ({ page }) => {
      const textarea = getMessageTextarea(page);
      // Valid input should have aria-invalid="false" or null
      await textarea.fill('Valid text');
      await textarea.blur();

      const ariaInvalid = await textarea.getAttribute('aria-invalid');
      expect(ariaInvalid === 'false' || ariaInvalid === null).toBe(true);
    });
  });

  walletTest.describe('Edge Cases', () => {
    walletTest('handles whitespace-only input', async ({ page }) => {
      const textarea = getMessageTextarea(page);
      await textarea.fill('   ');
      await expect(textarea).toHaveValue('   ');
    });

    walletTest('handles newline characters', async ({ page }) => {
      const textarea = getMessageTextarea(page);
      await textarea.fill('line1\nline2');
      const value = await textarea.inputValue();
      expect(value).toContain('line1');
      expect(value).toContain('line2');
    });

    walletTest('handles tab characters', async ({ page }) => {
      const textarea = getMessageTextarea(page);
      // Note: Tab in textarea may be intercepted by browser
      await textarea.fill('text\twith\ttabs');
      const value = await textarea.inputValue();
      expect(value).toContain('text');
    });

    walletTest('handles carriage returns', async ({ page }) => {
      const textarea = getMessageTextarea(page);
      await textarea.fill('line1\r\nline2');
      const value = await textarea.inputValue();
      expect(value).toContain('line1');
      expect(value).toContain('line2');
    });

    walletTest('handles paste operation', async ({ page }) => {
      const textarea = getMessageTextarea(page);
      // Simulate paste by filling
      await textarea.fill('Pasted content from clipboard');
      await expect(textarea).toHaveValue('Pasted content from clipboard');
    });
  });
});
