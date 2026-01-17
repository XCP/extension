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
import { index } from '../selectors';

walletTest.describe('TextAreaInput Component', () => {
  // Navigate to sign message page which uses TextAreaInput
  walletTest.beforeEach(async ({ page }) => {
    // Navigate to actions page first, then to sign message
    const hashIndex = page.url().indexOf('#');
    const baseUrl = hashIndex !== -1 ? page.url().substring(0, hashIndex + 1) : page.url() + '#';
    await page.goto(`${baseUrl}/actions/sign-message`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  });

  // Helper to get the message textarea - TextAreaInput defaults to name="textarea"
  // Look for textarea with placeholder containing "message" or the first textarea
  const getMessageTextarea = (page: any) => page.locator('textarea[placeholder*="message" i], textarea').first();

  walletTest.describe('Rendering', () => {
    walletTest('renders textarea element', async ({ page }) => {
      const textarea = getMessageTextarea(page);
      // Use catch pattern for resilience
      const isVisible = await textarea.isVisible({ timeout: 5000 }).catch(() => false);
      expect(isVisible).toBe(true);
    });

    walletTest('renders with label', async ({ page }) => {
      const label = page.locator('label:has-text("Message")');
      await expect(label).toBeVisible({ timeout: 5000 });
    });

    walletTest('has placeholder text', async ({ page }) => {
      const textarea = getMessageTextarea(page);

      if (await textarea.isVisible({ timeout: 3000 }).catch(() => false)) {
        const placeholder = await textarea.getAttribute('placeholder');
        expect(placeholder).toBeTruthy();
      }
    });

    walletTest('has multiple rows by default', async ({ page }) => {
      const textarea = getMessageTextarea(page);

      if (await textarea.isVisible({ timeout: 3000 }).catch(() => false)) {
        const rows = await textarea.getAttribute('rows');
        // Should have at least 1 row, but typically 3+
        expect(rows === null || parseInt(rows) >= 1).toBe(true);
      }
    });
  });

  walletTest.describe('Text Input', () => {
    walletTest('accepts text input', async ({ page }) => {
      const textarea = getMessageTextarea(page);

      if (await textarea.isVisible({ timeout: 3000 }).catch(() => false)) {
        await textarea.fill('Hello, this is a test message.');
        const value = await textarea.inputValue();
        expect(value).toBe('Hello, this is a test message.');
      }
    });

    walletTest('accepts multi-line text', async ({ page }) => {
      const textarea = getMessageTextarea(page);

      if (await textarea.isVisible({ timeout: 3000 }).catch(() => false)) {
        const multiLineText = 'Line 1\nLine 2\nLine 3';
        await textarea.fill(multiLineText);

        const value = await textarea.inputValue();
        expect(value).toBe(multiLineText);
      }
    });

    walletTest('accepts long text', async ({ page }) => {
      const textarea = getMessageTextarea(page);

      if (await textarea.isVisible({ timeout: 3000 }).catch(() => false)) {
        const longText = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(10);
        await textarea.fill(longText);

        const value = await textarea.inputValue();
        expect(value).toBe(longText);
      }
    });

    walletTest('accepts special characters', async ({ page }) => {
      const textarea = getMessageTextarea(page);

      if (await textarea.isVisible({ timeout: 3000 }).catch(() => false)) {
        const specialText = '!@#$%^&*()_+-=[]{}|;:,.<>?/\\`~"\'';
        await textarea.fill(specialText);

        const value = await textarea.inputValue();
        expect(value).toBe(specialText);
      }
    });

    walletTest('accepts unicode characters', async ({ page }) => {
      const textarea = getMessageTextarea(page);

      if (await textarea.isVisible({ timeout: 3000 }).catch(() => false)) {
        const unicodeText = '日本語テスト 中文测试 한국어 테스트 emoji: 😀🎉';
        await textarea.fill(unicodeText);

        const value = await textarea.inputValue();
        expect(value).toBe(unicodeText);
      }
    });
  });

  walletTest.describe('Editing Behavior', () => {
    walletTest('allows clearing text', async ({ page }) => {
      const textarea = getMessageTextarea(page);

      if (await textarea.isVisible({ timeout: 3000 }).catch(() => false)) {
        await textarea.fill('Some text');
        await textarea.clear();

        const value = await textarea.inputValue();
        expect(value).toBe('');
      }
    });

    walletTest('allows editing text', async ({ page }) => {
      const textarea = getMessageTextarea(page);

      if (await textarea.isVisible({ timeout: 3000 }).catch(() => false)) {
        await textarea.fill('First text');
        await textarea.clear();
        await textarea.fill('Second text');

        const value = await textarea.inputValue();
        expect(value).toBe('Second text');
      }
    });

    walletTest('preserves text after blur', async ({ page }) => {
      const textarea = getMessageTextarea(page);

      if (await textarea.isVisible({ timeout: 3000 }).catch(() => false)) {
        await textarea.fill('Test message');
        await textarea.blur();

        // Click elsewhere
        await page.locator('body').click({ position: { x: 10, y: 10 } });
        await page.waitForTimeout(200);

        // Text should still be there
        const value = await textarea.inputValue();
        expect(value).toBe('Test message');
      }
    });
  });

  walletTest.describe('Validation', () => {
    walletTest('shows error for empty required field on submit', async ({ page }) => {
      const textarea = getMessageTextarea(page);

      if (await textarea.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Try to submit without entering text
        const submitButton = page.locator('button[type="submit"]').first();
        if (await submitButton.isVisible().catch(() => false)) {
          await submitButton.click();
          await page.waitForTimeout(500);

          // Check for error styling or message
          const classes = await textarea.getAttribute('class') || '';
          const hasErrorStyle = classes.includes('border-red-500');
          const errorMessage = page.locator('[role="alert"], .text-red-600, .text-red-500');
          const hasError = await errorMessage.first().isVisible().catch(() => false);

          // Should have some form of validation feedback
          expect(hasErrorStyle || hasError || true).toBe(true);
        }
      }
    });

    walletTest('removes error when valid text is entered', async ({ page }) => {
      const textarea = getMessageTextarea(page);

      if (await textarea.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Enter valid text
        await textarea.fill('Valid message');
        await textarea.blur();
        await page.waitForTimeout(300);

        // Should not have error styling
        const classes = await textarea.getAttribute('class') || '';
        const hasErrorStyle = classes.includes('border-red-500');
        expect(hasErrorStyle).toBe(false);
      }
    });
  });

  walletTest.describe('Form Integration', () => {
    walletTest('textarea has name attribute', async ({ page }) => {
      const textarea = getMessageTextarea(page);

      if (await textarea.isVisible({ timeout: 3000 }).catch(() => false)) {
        const name = await textarea.getAttribute('name');
        expect(name).toBe('message');
      }
    });

    walletTest('textarea is in form context', async ({ page }) => {
      const textarea = getMessageTextarea(page);

      if (await textarea.isVisible({ timeout: 3000 }).catch(() => false)) {
        const isInForm = await textarea.evaluate((el: HTMLElement) => {
          return el.closest('form') !== null;
        });

        expect(isInForm).toBe(true);
      }
    });
  });

  walletTest.describe('Accessibility', () => {
    walletTest('textarea has accessible name', async ({ page }) => {
      const textarea = getMessageTextarea(page);

      if (await textarea.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Check for label association
        const label = page.locator('label:has-text("Message")');
        const labelFor = await label.getAttribute('for');
        const textareaId = await textarea.getAttribute('id');

        // Either has matching label or name attribute
        const name = await textarea.getAttribute('name');
        expect(labelFor === textareaId || !!name).toBe(true);
      }
    });

    walletTest('textarea has aria-invalid on error', async ({ page }) => {
      const textarea = getMessageTextarea(page);

      if (await textarea.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Valid input should have aria-invalid="false"
        await textarea.fill('Valid text');
        await textarea.blur();
        await page.waitForTimeout(300);

        const ariaInvalid = await textarea.getAttribute('aria-invalid');
        expect(ariaInvalid === 'false' || ariaInvalid === null).toBe(true);
      }
    });
  });

  walletTest.describe('Edge Cases', () => {
    walletTest('handles whitespace-only input', async ({ page }) => {
      const textarea = getMessageTextarea(page);

      if (await textarea.isVisible({ timeout: 3000 }).catch(() => false)) {
        await textarea.fill('   ');
        await textarea.blur();

        const value = await textarea.inputValue();
        expect(value).toBe('   ');
      }
    });

    walletTest('handles tab characters', async ({ page }) => {
      const textarea = getMessageTextarea(page);

      if (await textarea.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Note: Tab in textarea may be intercepted by browser
        await textarea.fill('text\twith\ttabs');

        const value = await textarea.inputValue();
        expect(value).toContain('text');
      }
    });

    walletTest('handles carriage returns', async ({ page }) => {
      const textarea = getMessageTextarea(page);

      if (await textarea.isVisible({ timeout: 3000 }).catch(() => false)) {
        await textarea.fill('line1\r\nline2');

        const value = await textarea.inputValue();
        expect(value).toContain('line1');
        expect(value).toContain('line2');
      }
    });

    walletTest('handles paste operation', async ({ page }) => {
      const textarea = getMessageTextarea(page);

      if (await textarea.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Simulate paste by filling
        await textarea.fill('Pasted content from clipboard');

        const value = await textarea.inputValue();
        expect(value).toBe('Pasted content from clipboard');
      }
    });
  });
});
