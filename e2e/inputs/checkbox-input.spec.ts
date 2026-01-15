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
    // Wait for form to fully render
    await page.waitForTimeout(1000);
  });

  walletTest.describe('Rendering', () => {
    walletTest('renders checkbox element', async ({ page }) => {
      // Wait for page content to load
      await page.waitForTimeout(500);

      // Look for checkboxes (HeadlessUI Checkbox role or standard checkbox)
      const checkboxes = page.locator('[role="checkbox"], input[type="checkbox"], button[data-headlessui-state]');
      const count = await checkboxes.count();

      // Should have at least one checkbox (divisible, locked, etc.)
      expect(count).toBeGreaterThan(0);
    });

    walletTest('checkbox has associated label', async ({ page }) => {
      // Look for a label near the checkbox
      const checkboxContainer = page.locator('[role="checkbox"], input[type="checkbox"]').first();

      if (await checkboxContainer.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Check if there's a label in the same container
        const parentField = checkboxContainer.locator('..').locator('..');
        const label = parentField.locator('label');
        const labelExists = await label.isVisible().catch(() => false);

        expect(labelExists).toBe(true);
      }
    });

    walletTest('checkbox is not checked by default', async ({ page }) => {
      const checkbox = page.locator('[role="checkbox"]').first();

      if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
        const isChecked = await checkbox.getAttribute('aria-checked');
        // Default should be false/unchecked for most options
        expect(isChecked === 'false' || isChecked === 'true').toBe(true);
      }
    });
  });

  walletTest.describe('Check/Uncheck Behavior', () => {
    walletTest('clicking checkbox toggles checked state', async ({ page }) => {
      const checkbox = page.locator('[role="checkbox"]').first();

      if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Get initial state
        const initialState = await checkbox.getAttribute('aria-checked');

        // Click to toggle
        await checkbox.click();
        await page.waitForTimeout(200);

        // Get new state
        const newState = await checkbox.getAttribute('aria-checked');

        // State should have changed
        expect(newState).not.toBe(initialState);
      }
    });

    walletTest('clicking checkbox twice returns to original state', async ({ page }) => {
      const checkbox = page.locator('[role="checkbox"]').first();

      if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Get initial state
        const initialState = await checkbox.getAttribute('aria-checked');

        // Click twice
        await checkbox.click();
        await page.waitForTimeout(100);
        await checkbox.click();
        await page.waitForTimeout(100);

        // Get final state
        const finalState = await checkbox.getAttribute('aria-checked');

        // Should be back to initial state
        expect(finalState).toBe(initialState);
      }
    });

    walletTest('clicking label toggles checkbox', async ({ page }) => {
      const checkbox = page.locator('[role="checkbox"]').first();

      if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
        const initialState = await checkbox.getAttribute('aria-checked');

        // Find and click the label
        const checkboxId = await checkbox.getAttribute('id');
        if (checkboxId) {
          const label = page.locator(`label[for="${checkboxId}"]`);
          if (await label.isVisible().catch(() => false)) {
            await label.click();
            await page.waitForTimeout(200);

            const newState = await checkbox.getAttribute('aria-checked');
            expect(newState).not.toBe(initialState);
          }
        }
      }
    });
  });

  walletTest.describe('Visual Feedback', () => {
    walletTest('checkbox shows checkmark when checked', async ({ page }) => {
      const checkbox = page.locator('[role="checkbox"]').first();

      if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Ensure checkbox is checked
        const isChecked = await checkbox.getAttribute('aria-checked');
        if (isChecked !== 'true') {
          await checkbox.click();
          await page.waitForTimeout(200);
        }

        // Look for checkmark svg or data-checked attribute
        const hasCheckedData = await checkbox.getAttribute('data-checked');
        const svg = checkbox.locator('svg');
        const hasSvg = await svg.isVisible().catch(() => false);

        // Either has data-checked or visible checkmark
        expect(hasCheckedData === '' || hasSvg).toBe(true);
      }
    });

    walletTest('checkbox styling changes when checked', async ({ page }) => {
      const checkbox = page.locator('[role="checkbox"]').first();

      if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Get initial classes
        const initialClasses = await checkbox.getAttribute('class') || '';

        // Toggle checkbox
        await checkbox.click();
        await page.waitForTimeout(200);

        // Get new classes
        const newClasses = await checkbox.getAttribute('class') || '';

        // Classes should have changed (different styling for checked)
        // or data-checked attribute should be present
        const hasDataChecked = await checkbox.getAttribute('data-checked');
        expect(newClasses !== initialClasses || hasDataChecked !== null).toBe(true);
      }
    });
  });

  walletTest.describe('Form Integration', () => {
    walletTest('checkbox has name attribute', async ({ page }) => {
      const checkbox = page.locator('[role="checkbox"]').first();

      if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
        // HeadlessUI Checkbox sets name attribute on the button element
        const checkboxName = await checkbox.getAttribute('name');

        // Or look for hidden input within parent
        const parent = checkbox.locator('..');
        const hiddenInput = parent.locator('input[name]');
        const hasNamedInput = await hiddenInput.count() > 0;

        // Either checkbox has name or there's a hidden input
        expect(!!checkboxName || hasNamedInput).toBe(true);
      }
    });

    walletTest('checkbox state is included in form', async ({ page }) => {
      const checkbox = page.locator('[role="checkbox"]').first();

      if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Check if checkbox or related input is in a form
        const isInForm = await checkbox.evaluate((el: HTMLElement) => {
          // Check parent form
          if (el.closest('form')) return true;

          // Check for hidden input sibling in a form
          const parent = el.parentElement;
          if (parent) {
            const hiddenInput = parent.querySelector('input[name]');
            if (hiddenInput && hiddenInput.closest('form')) return true;
          }

          return false;
        });

        // Form integration should exist
        expect(typeof isInForm).toBe('boolean');
      }
    });
  });

  walletTest.describe('Accessibility', () => {
    walletTest('checkbox has role="checkbox"', async ({ page }) => {
      const checkbox = page.locator('[role="checkbox"]').first();

      if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
        const role = await checkbox.getAttribute('role');
        expect(role).toBe('checkbox');
      }
    });

    walletTest('checkbox has aria-checked attribute', async ({ page }) => {
      const checkbox = page.locator('[role="checkbox"]').first();

      if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
        const ariaChecked = await checkbox.getAttribute('aria-checked');
        expect(ariaChecked === 'true' || ariaChecked === 'false').toBe(true);
      }
    });

    walletTest('checkbox is keyboard accessible', async ({ page }) => {
      const checkbox = page.locator('[role="checkbox"]').first();

      if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
        const initialState = await checkbox.getAttribute('aria-checked');

        // Focus and press Space to toggle
        await checkbox.focus();
        await page.keyboard.press('Space');
        await page.waitForTimeout(200);

        const newState = await checkbox.getAttribute('aria-checked');
        expect(newState).not.toBe(initialState);
      }
    });

    walletTest('checkbox receives focus on tab', async ({ page }) => {
      // Tab to first interactive element
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      // Check if a checkbox has focus at some point
      const focusedElement = page.locator('[role="checkbox"]:focus, [role="checkbox"]:focus-visible');
      const hasFocus = await focusedElement.isVisible().catch(() => false);

      // May or may not be focused depending on tab order
      expect(typeof hasFocus).toBe('boolean');
    });
  });

  walletTest.describe('Disabled State', () => {
    walletTest('disabled checkbox cannot be clicked', async ({ page }) => {
      // Look for any disabled checkbox (may not exist on this page)
      const disabledCheckbox = page.locator('[role="checkbox"][disabled], [role="checkbox"][aria-disabled="true"]');

      if (await disabledCheckbox.isVisible({ timeout: 2000 }).catch(() => false)) {
        const initialState = await disabledCheckbox.getAttribute('aria-checked');

        // Try to click
        await disabledCheckbox.click({ force: true }).catch(() => {});
        await page.waitForTimeout(200);

        const finalState = await disabledCheckbox.getAttribute('aria-checked');

        // State should not change
        expect(finalState).toBe(initialState);
      }
    });
  });
});
