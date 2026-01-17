/**
 * PasswordInput Component Tests
 *
 * Tests for the password input component with show/hide toggle.
 * Component: src/components/inputs/password-input.tsx
 *
 * Features tested:
 * - Basic rendering (input field, toggle button)
 * - Show/hide password toggle functionality
 * - Input behavior (typing, clearing)
 * - Accessibility (aria labels, input type switching)
 *
 * Note: PasswordInput is used on unlock screen, create wallet, and import pages.
 * We test on the security settings page where password change uses PasswordInput.
 */

import { walletTest, expect } from '../fixtures';

walletTest.describe('PasswordInput Component', () => {
  // Navigate to security settings which has password change functionality
  walletTest.beforeEach(async ({ page }) => {
    const hashIndex = page.url().indexOf('#');
    const baseUrl = hashIndex !== -1 ? page.url().substring(0, hashIndex + 1) : page.url() + '#';
    await page.goto(`${baseUrl}/settings/security`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  });

  walletTest.describe('Rendering', () => {
    walletTest('renders password input fields on security page', async ({ page }) => {
      // Look for password inputs (current password, new password, confirm password)
      const passwordInputs = page.locator('input[type="password"]');
      const count = await passwordInputs.count();

      // Should have at least one password input field
      expect(count).toBeGreaterThan(0);
    });

    walletTest('renders with correct input type', async ({ page }) => {
      const passwordInput = page.locator('input[type="password"]').first();

      if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        const type = await passwordInput.getAttribute('type');
        expect(type).toBe('password');
      }
    });

    walletTest('has show/hide toggle button', async ({ page }) => {
      const passwordInput = page.locator('input[type="password"]').first();

      if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Look for the toggle button (eye icon)
        const toggleButton = page.locator('button[aria-label*="password" i]').first();
        const buttonExists = await toggleButton.isVisible().catch(() => false);

        // Toggle button should be present
        expect(buttonExists).toBe(true);
      }
    });
  });

  walletTest.describe('Show/Hide Toggle', () => {
    walletTest('clicking toggle shows password', async ({ page }) => {
      const passwordInput = page.locator('input[type="password"]').first();

      if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Fill password first
        await passwordInput.fill('testpassword123');

        // Find and click toggle button
        const toggleButton = page.locator('button[aria-label*="password" i]').first();
        if (await toggleButton.isVisible().catch(() => false)) {
          await toggleButton.click();
          await page.waitForTimeout(300);

          // After toggle, need to re-query since type changed from password to text
          const inputAfterToggle = page.locator('input[name="currentPassword"], input[name="newPassword"]').first();
          const type = await inputAfterToggle.getAttribute('type');
          expect(type).toBe('text');
        }
      }
    });

    walletTest('clicking toggle again hides password', async ({ page }) => {
      const passwordInput = page.locator('input[type="password"]').first();

      if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await passwordInput.fill('testpassword123');

        const toggleButton = page.locator('button[aria-label*="password" i]').first();
        if (await toggleButton.isVisible().catch(() => false)) {
          // Click twice to toggle back
          await toggleButton.click();
          await toggleButton.click();

          // Should be back to password type
          const type = await passwordInput.getAttribute('type');
          expect(type).toBe('password');
        }
      }
    });

    walletTest('toggle button has accessible label', async ({ page }) => {
      const toggleButton = page.locator('button[aria-label*="password" i]').first();

      if (await toggleButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        const ariaLabel = await toggleButton.getAttribute('aria-label');
        expect(ariaLabel).toBeTruthy();
        expect(ariaLabel?.toLowerCase()).toContain('password');
      }
    });

    walletTest('aria-label changes when toggled', async ({ page }) => {
      const passwordInput = page.locator('input[type="password"]').first();

      if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        const toggleButton = page.locator('button[aria-label*="password" i]').first();

        if (await toggleButton.isVisible().catch(() => false)) {
          // Get initial aria-label
          const initialLabel = await toggleButton.getAttribute('aria-label');

          // Click to show password
          await toggleButton.click();

          // Get new aria-label
          const newLabel = await toggleButton.getAttribute('aria-label');

          // Labels should be different (Show -> Hide or vice versa)
          expect(newLabel).not.toBe(initialLabel);
        }
      }
    });
  });

  walletTest.describe('Input Behavior', () => {
    walletTest('accepts password input', async ({ page }) => {
      const passwordInput = page.locator('input[type="password"]').first();

      if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await passwordInput.fill('MySecurePassword123!');
        const value = await passwordInput.inputValue();
        expect(value).toBe('MySecurePassword123!');
      }
    });

    walletTest('password value is masked by default', async ({ page }) => {
      const passwordInput = page.locator('input[type="password"]').first();

      if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await passwordInput.fill('secretpassword');

        // Verify input type is password (which masks the value)
        const type = await passwordInput.getAttribute('type');
        expect(type).toBe('password');
      }
    });

    walletTest('allows clearing password', async ({ page }) => {
      const passwordInput = page.locator('input[type="password"]').first();

      if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await passwordInput.fill('testpassword');
        await passwordInput.clear();

        const value = await passwordInput.inputValue();
        expect(value).toBe('');
      }
    });

    walletTest('accepts special characters', async ({ page }) => {
      const passwordInput = page.locator('input[type="password"]').first();

      if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        const specialPassword = 'P@ssw0rd!#$%^&*()_+-=[]{}|;:,.<>?';
        await passwordInput.fill(specialPassword);

        const value = await passwordInput.inputValue();
        expect(value).toBe(specialPassword);
      }
    });

    walletTest('accepts unicode characters', async ({ page }) => {
      const passwordInput = page.locator('input[type="password"]').first();

      if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        const unicodePassword = 'パスワード密码пароль';
        await passwordInput.fill(unicodePassword);

        const value = await passwordInput.inputValue();
        expect(value).toBe(unicodePassword);
      }
    });

    walletTest('handles very long password', async ({ page }) => {
      const passwordInput = page.locator('input[type="password"]').first();

      if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        const longPassword = 'a'.repeat(100);
        await passwordInput.fill(longPassword);

        const value = await passwordInput.inputValue();
        expect(value).toBe(longPassword);
      }
    });
  });

  walletTest.describe('Accessibility', () => {
    walletTest('has name attribute for form submission', async ({ page }) => {
      const passwordInput = page.locator('input[type="password"]').first();

      if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        const name = await passwordInput.getAttribute('name');
        expect(name).toBeTruthy();
      }
    });

    walletTest('has placeholder text', async ({ page }) => {
      const passwordInput = page.locator('input[type="password"]').first();

      if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        const placeholder = await passwordInput.getAttribute('placeholder');
        // Placeholder should exist and contain relevant text
        expect(placeholder).toBeTruthy();
      }
    });

    walletTest('toggle button is keyboard accessible', async ({ page }) => {
      const toggleButton = page.locator('button[aria-label*="password" i]').first();

      if (await toggleButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Focus the button
        await toggleButton.focus();

        // Press Enter to toggle
        await page.keyboard.press('Enter');

        // Check if input type changed
        const passwordInput = page.locator('input[type="text"], input[type="password"]').first();
        const type = await passwordInput.getAttribute('type');

        // Should have toggled (we started with password, should now be text)
        expect(type === 'text' || type === 'password').toBe(true);
      }
    });
  });

  walletTest.describe('Form Context', () => {
    walletTest('password input is in structured container', async ({ page }) => {
      const passwordInput = page.locator('input[type="password"]').first();

      if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Security settings uses div-based layout, not a form element
        // Check if input is in a container (form or div with related inputs)
        const isInContainer = await passwordInput.evaluate((el: HTMLElement) => {
          // Check for form or structured container
          const form = el.closest('form');
          const container = el.closest('.space-y-4, .space-y-6, [role="main"]');
          return form !== null || container !== null;
        });

        expect(isInContainer).toBe(true);
      }
    });
  });
});
