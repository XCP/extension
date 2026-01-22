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
    // Wait for the password input to be visible (confirms page loaded)
    await page.locator('input[type="password"]').first().waitFor({ state: 'visible', timeout: 5000 });
  });

  // Helper to get password input and toggle button
  const getPasswordInput = (page: any) => page.locator('input[type="password"]').first();
  const getToggleButton = (page: any) => page.locator('button[aria-label*="password" i]').first();

  walletTest.describe('Rendering', () => {
    walletTest('renders password input fields on security page', async ({ page }) => {
      // Look for password inputs (current password, new password, confirm password)
      const passwordInputs = page.locator('input[type="password"]');
      const count = await passwordInputs.count();

      // Should have at least one password input field
      expect(count).toBeGreaterThan(0);
    });

    walletTest('renders with correct input type', async ({ page }) => {
      const passwordInput = getPasswordInput(page);
      await expect(passwordInput).toBeVisible();

      const type = await passwordInput.getAttribute('type');
      expect(type).toBe('password');
    });

    walletTest('has show/hide toggle button', async ({ page }) => {
      const toggleButton = getToggleButton(page);
      await expect(toggleButton).toBeVisible();
    });
  });

  walletTest.describe('Show/Hide Toggle', () => {
    walletTest('clicking toggle shows password', async ({ page }) => {
      const passwordInput = getPasswordInput(page);
      await expect(passwordInput).toBeVisible();

      // Fill password first
      await passwordInput.fill('testpassword123');

      // Find and click toggle button
      const toggleButton = getToggleButton(page);
      await expect(toggleButton).toBeVisible();
      await toggleButton.click();

      // After toggle, input type should change to text
      // Re-query for the input by name since type changed
      const inputAfterToggle = page.locator('input[name="currentPassword"], input[name="newPassword"]').first();
      await expect(inputAfterToggle).toHaveAttribute('type', 'text');
    });

    walletTest('clicking toggle again hides password', async ({ page }) => {
      const passwordInput = getPasswordInput(page);
      await expect(passwordInput).toBeVisible();

      await passwordInput.fill('testpassword123');

      const toggleButton = getToggleButton(page);
      await expect(toggleButton).toBeVisible();

      // Click twice to toggle back
      await toggleButton.click();
      await toggleButton.click();

      // Should be back to password type
      await expect(passwordInput).toHaveAttribute('type', 'password');
    });

    walletTest('toggle button has accessible label', async ({ page }) => {
      const toggleButton = getToggleButton(page);
      await expect(toggleButton).toBeVisible();

      const ariaLabel = await toggleButton.getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
      expect(ariaLabel?.toLowerCase()).toContain('password');
    });

    walletTest('aria-label changes when toggled', async ({ page }) => {
      const toggleButton = getToggleButton(page);
      await expect(toggleButton).toBeVisible();

      // Get initial aria-label
      const initialLabel = await toggleButton.getAttribute('aria-label');

      // Click to show password
      await toggleButton.click();

      // Get new aria-label - should be different (Show -> Hide or vice versa)
      await expect(async () => {
        const newLabel = await toggleButton.getAttribute('aria-label');
        expect(newLabel).not.toBe(initialLabel);
      }).toPass({ timeout: 2000 });
    });
  });

  walletTest.describe('Input Behavior', () => {
    walletTest('accepts password input', async ({ page }) => {
      const passwordInput = getPasswordInput(page);
      await expect(passwordInput).toBeVisible();

      await passwordInput.fill('MySecurePassword123!');
      await expect(passwordInput).toHaveValue('MySecurePassword123!');
    });

    walletTest('password value is masked by default', async ({ page }) => {
      const passwordInput = getPasswordInput(page);
      await expect(passwordInput).toBeVisible();

      await passwordInput.fill('secretpassword');

      // Verify input type is password (which masks the value)
      await expect(passwordInput).toHaveAttribute('type', 'password');
    });

    walletTest('allows clearing password', async ({ page }) => {
      const passwordInput = getPasswordInput(page);
      await expect(passwordInput).toBeVisible();

      await passwordInput.fill('testpassword');
      await passwordInput.clear();

      await expect(passwordInput).toHaveValue('');
    });

    walletTest('accepts special characters', async ({ page }) => {
      const passwordInput = getPasswordInput(page);
      await expect(passwordInput).toBeVisible();

      const specialPassword = 'P@ssw0rd!#$%^&*()_+-=[]{}|;:,.<>?';
      await passwordInput.fill(specialPassword);

      await expect(passwordInput).toHaveValue(specialPassword);
    });

    walletTest('accepts unicode characters', async ({ page }) => {
      const passwordInput = getPasswordInput(page);
      await expect(passwordInput).toBeVisible();

      const unicodePassword = 'パスワード密码пароль';
      await passwordInput.fill(unicodePassword);

      await expect(passwordInput).toHaveValue(unicodePassword);
    });

    walletTest('handles very long password', async ({ page }) => {
      const passwordInput = getPasswordInput(page);
      await expect(passwordInput).toBeVisible();

      const longPassword = 'a'.repeat(100);
      await passwordInput.fill(longPassword);

      await expect(passwordInput).toHaveValue(longPassword);
    });
  });

  walletTest.describe('Accessibility', () => {
    walletTest('has name attribute for form submission', async ({ page }) => {
      const passwordInput = getPasswordInput(page);
      await expect(passwordInput).toBeVisible();

      const name = await passwordInput.getAttribute('name');
      expect(name).toBeTruthy();
    });

    walletTest('has placeholder text', async ({ page }) => {
      const passwordInput = getPasswordInput(page);
      await expect(passwordInput).toBeVisible();

      const placeholder = await passwordInput.getAttribute('placeholder');
      // Placeholder should exist and contain relevant text
      expect(placeholder).toBeTruthy();
    });

    walletTest('toggle button is keyboard accessible', async ({ page }) => {
      const toggleButton = getToggleButton(page);
      await expect(toggleButton).toBeVisible();

      // Get initial input type
      const passwordInput = getPasswordInput(page);
      const initialType = await passwordInput.getAttribute('type');

      // Focus the button and press Enter to toggle
      await toggleButton.focus();
      await page.keyboard.press('Enter');

      // Type should have changed
      await expect(async () => {
        const newType = await page.locator('input[name="currentPassword"], input[name="newPassword"]').first().getAttribute('type');
        expect(newType).not.toBe(initialType);
      }).toPass({ timeout: 2000 });
    });
  });

  walletTest.describe('Form Context', () => {
    walletTest('password input is in structured container', async ({ page }) => {
      const passwordInput = getPasswordInput(page);
      await expect(passwordInput).toBeVisible();

      // Security settings uses div-based layout, not a form element
      // Check if input is in a container (form or div with related inputs)
      const isInContainer = await passwordInput.evaluate((el: HTMLElement) => {
        // Check for form or structured container
        const form = el.closest('form');
        const container = el.closest('.space-y-4, .space-y-6, [role="main"]');
        return form !== null || container !== null;
      });

      expect(isInContainer).toBe(true);
    });
  });
});
