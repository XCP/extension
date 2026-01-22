/**
 * CheckboxInput Component Tests
 *
 * Tests for the checkbox input component.
 * Component: src/components/inputs/checkbox-input.tsx
 *
 * Features tested:
 * - Rendering (checkbox, label)
 * - Check/uncheck behavior
 * - Form integration
 * - Accessibility
 *
 * CheckboxInput is used in:
 * - Create wallet (confirm backup)
 * - Import wallet (understand warning)
 * - Issue asset (divisible, locked options)
 */

import { walletTest, expect } from '../fixtures';

walletTest.describe('CheckboxInput Component', () => {
  // Navigate to issuance page which uses CheckboxInput for divisible/locked options
  walletTest.beforeEach(async ({ page }) => {
    const hashIndex = page.url().indexOf('#');
    const baseUrl = hashIndex !== -1 ? page.url().substring(0, hashIndex + 1) : page.url() + '#';
    await page.goto(`${baseUrl}/compose/issuance/issue`);
    await page.waitForLoadState('networkidle');
    // Wait for checkbox to confirm page is loaded
    await page.locator('[role="checkbox"], input[type="checkbox"]').first().waitFor({ state: 'visible', timeout: 10000 });
  });

  walletTest.describe('Rendering', () => {
    walletTest('renders checkbox element', async ({ page }) => {
      // Look for checkboxes (HeadlessUI Checkbox role or standard checkbox)
      const checkboxes = page.locator('[role="checkbox"], input[type="checkbox"], button[data-headlessui-state]');
      const count = await checkboxes.count();

      // Should have at least one checkbox (divisible, locked, etc.)
      expect(count).toBeGreaterThan(0);
    });

    walletTest('checkbox has associated label', async ({ page }) => {
      const checkbox = page.locator('[role="checkbox"], input[type="checkbox"]').first();
      await expect(checkbox).toBeVisible();

      // Check if there's a label in the same container
      const parentField = checkbox.locator('..').locator('..');
      const label = parentField.locator('label');
      await expect(label).toBeVisible();
    });

    walletTest('checkbox has aria-checked attribute', async ({ page }) => {
      const checkbox = page.locator('[role="checkbox"]').first();
      await expect(checkbox).toBeVisible();

      const isChecked = await checkbox.getAttribute('aria-checked');
      // Should have true or false value
      expect(isChecked === 'false' || isChecked === 'true').toBe(true);
    });
  });

  walletTest.describe('Check/Uncheck Behavior', () => {
    walletTest('clicking checkbox toggles checked state', async ({ page }) => {
      const checkbox = page.locator('[role="checkbox"]').first();
      await expect(checkbox).toBeVisible();

      // Get initial state
      const initialState = await checkbox.getAttribute('aria-checked');

      // Click to toggle
      await checkbox.click();

      // Wait for state to change
      await expect(async () => {
        const newState = await checkbox.getAttribute('aria-checked');
        expect(newState).not.toBe(initialState);
      }).toPass({ timeout: 2000 });
    });

    walletTest('clicking checkbox twice returns to original state', async ({ page }) => {
      const checkbox = page.locator('[role="checkbox"]').first();
      await expect(checkbox).toBeVisible();

      // Get initial state
      const initialState = await checkbox.getAttribute('aria-checked');

      // Click twice
      await checkbox.click();
      await checkbox.click();

      // Should be back to initial state
      await expect(async () => {
        const finalState = await checkbox.getAttribute('aria-checked');
        expect(finalState).toBe(initialState);
      }).toPass({ timeout: 2000 });
    });

    walletTest('clicking label toggles checkbox', async ({ page }) => {
      const checkbox = page.locator('[role="checkbox"]').first();
      await expect(checkbox).toBeVisible();

      const initialState = await checkbox.getAttribute('aria-checked');

      // Find and click the label
      const checkboxId = await checkbox.getAttribute('id');
      expect(checkboxId).toBeTruthy();

      const label = page.locator(`label[for="${checkboxId}"]`);
      await expect(label).toBeVisible();
      await label.click();

      await expect(async () => {
        const newState = await checkbox.getAttribute('aria-checked');
        expect(newState).not.toBe(initialState);
      }).toPass({ timeout: 2000 });
    });
  });

  walletTest.describe('Visual Feedback', () => {
    walletTest('checkbox shows checkmark when checked', async ({ page }) => {
      const checkbox = page.locator('[role="checkbox"]').first();
      await expect(checkbox).toBeVisible();

      // Ensure checkbox is checked
      const isChecked = await checkbox.getAttribute('aria-checked');
      if (isChecked !== 'true') {
        await checkbox.click();
      }

      // Wait for checked state
      await expect(async () => {
        const state = await checkbox.getAttribute('aria-checked');
        expect(state).toBe('true');
      }).toPass({ timeout: 2000 });

      // Look for checkmark svg or data-checked attribute
      const hasCheckedData = await checkbox.getAttribute('data-checked');
      const svg = checkbox.locator('svg');
      const hasSvg = await svg.isVisible();

      // Either has data-checked or visible checkmark
      expect(hasCheckedData === '' || hasSvg).toBe(true);
    });
  });

  walletTest.describe('Form Integration', () => {
    walletTest('checkbox is in form context', async ({ page }) => {
      const checkbox = page.locator('[role="checkbox"]').first();
      await expect(checkbox).toBeVisible();

      // Check if checkbox is in a form
      const isInForm = await checkbox.evaluate((el: HTMLElement) => {
        if (el.closest('form')) return true;
        const parent = el.parentElement;
        if (parent) {
          const hiddenInput = parent.querySelector('input[name]');
          if (hiddenInput && hiddenInput.closest('form')) return true;
        }
        return false;
      });

      // Form integration should exist - this is a requirement for the component
      expect(isInForm).toBe(true);
    });
  });

  walletTest.describe('Accessibility', () => {
    walletTest('checkbox has role="checkbox"', async ({ page }) => {
      const checkbox = page.locator('[role="checkbox"]').first();
      await expect(checkbox).toBeVisible();

      const role = await checkbox.getAttribute('role');
      expect(role).toBe('checkbox');
    });

    walletTest('checkbox is keyboard accessible', async ({ page }) => {
      const checkbox = page.locator('[role="checkbox"]').first();
      await expect(checkbox).toBeVisible();

      const initialState = await checkbox.getAttribute('aria-checked');

      // Focus and press Space to toggle
      await checkbox.focus();
      await page.keyboard.press('Space');

      await expect(async () => {
        const newState = await checkbox.getAttribute('aria-checked');
        expect(newState).not.toBe(initialState);
      }).toPass({ timeout: 2000 });
    });
  });

  walletTest.describe('Disabled State', () => {
    // Note: This test looks for disabled checkboxes which may not exist on the issuance page
    // It's marked as conditional since the page may not have disabled checkboxes
    walletTest('disabled checkbox cannot be clicked', async ({ page }) => {
      // Look for any disabled checkbox
      const disabledCheckbox = page.locator('[role="checkbox"][disabled], [role="checkbox"][aria-disabled="true"]');

      // Skip test if no disabled checkbox exists on this page
      const count = await disabledCheckbox.count();
      walletTest.skip(count === 0, 'No disabled checkboxes on this page');

      const initialState = await disabledCheckbox.first().getAttribute('aria-checked');

      // Try to click (force to bypass disabled)
      await disabledCheckbox.first().click({ force: true });

      // State should not change
      const finalState = await disabledCheckbox.first().getAttribute('aria-checked');
      expect(finalState).toBe(initialState);
    });
  });
});
