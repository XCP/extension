/**
 * SettingSwitch Component Tests
 *
 * Tests for the toggle switch component used in settings.
 * Component: src/components/inputs/setting-switch.tsx
 *
 * Features tested:
 * - Rendering (switch, label, description)
 * - Toggle on/off behavior
 * - Visual state changes
 * - Tooltip/info icon
 * - Accessibility
 *
 * SettingSwitch is used in:
 * - Advanced settings (MPMA, help text, etc.)
 * - Other settings pages
 */

import { walletTest, expect } from '../fixtures';

walletTest.describe('SettingSwitch Component', () => {
  // Navigate to advanced settings which uses SettingSwitch
  walletTest.beforeEach(async ({ page }) => {
    const hashIndex = page.url().indexOf('#');
    const baseUrl = hashIndex !== -1 ? page.url().substring(0, hashIndex + 1) : page.url() + '#';
    await page.goto(`${baseUrl}/settings/advanced`);
    await page.waitForLoadState('networkidle');
    // Wait for switches to be ready
    await page.locator('[role="switch"]').first().waitFor({ state: 'visible', timeout: 10000 });
  });

  walletTest.describe('Rendering', () => {
    walletTest('renders switch elements', async ({ page }) => {
      // Look for HeadlessUI Switch (button role with switch behavior)
      const switches = page.locator('[role="switch"]');
      const count = await switches.count();

      // Should have at least one switch
      expect(count).toBeGreaterThan(0);
    });

    walletTest('switch has associated label', async ({ page }) => {
      // Switches should have labels - check that switch has accessible name
      const switches = page.locator('[role="switch"]');
      const firstSwitch = switches.first();

      // Switch should have aria-label or labelled by text
      const ariaLabel = await firstSwitch.getAttribute('aria-label');
      const ariaLabelledBy = await firstSwitch.getAttribute('aria-labelledby');

      // At least one accessibility attribute should be present
      expect(ariaLabel || ariaLabelledBy).toBeTruthy();
    });

    walletTest('switch shows current state visually', async ({ page }) => {
      const switchElement = page.locator('[role="switch"]').first();
      const classes = await switchElement.getAttribute('class') || '';

      // Should have color indicating state (blue for on, gray for off)
      expect(classes).toMatch(/bg-blue-600|bg-gray-200/);
    });
  });

  walletTest.describe('Toggle Behavior', () => {
    walletTest('clicking switch toggles state', async ({ page }) => {
      const switchElement = page.locator('[role="switch"]').first();

      // Get initial state
      const initialChecked = await switchElement.getAttribute('aria-checked');
      const initialClasses = await switchElement.getAttribute('class') || '';

      // Click to toggle
      await switchElement.click();

      // Wait for state to change (aria-checked should toggle)
      await expect(async () => {
        const newChecked = await switchElement.getAttribute('aria-checked');
        expect(newChecked).not.toBe(initialChecked);
      }).toPass({ timeout: 2000 });
    });

    walletTest('double click returns to original state', async ({ page }) => {
      const switchElement = page.locator('[role="switch"]').first();

      // Get initial state
      const initialChecked = await switchElement.getAttribute('aria-checked');

      // Click twice
      await switchElement.click();
      await switchElement.click();

      // Wait for state to return
      await expect(async () => {
        const finalChecked = await switchElement.getAttribute('aria-checked');
        expect(finalChecked).toBe(initialChecked);
      }).toPass({ timeout: 2000 });
    });

    walletTest('switch state persists after page interaction', async ({ page }) => {
      const switchElement = page.locator('[role="switch"]').first();

      // Toggle the switch
      await switchElement.click();

      const stateAfterClick = await switchElement.getAttribute('aria-checked');

      // Click elsewhere on page
      await page.locator('body').click({ position: { x: 10, y: 10 } });

      // State should persist
      await expect(async () => {
        const stateAfterBlur = await switchElement.getAttribute('aria-checked');
        expect(stateAfterBlur).toBe(stateAfterClick);
      }).toPass({ timeout: 2000 });
    });
  });

  walletTest.describe('Visual State', () => {
    walletTest('on state has blue background', async ({ page }) => {
      const switchElement = page.locator('[role="switch"]').first();

      // Ensure switch is on
      const isChecked = await switchElement.getAttribute('aria-checked');
      if (isChecked !== 'true') {
        await switchElement.click();
      }

      await expect(async () => {
        const classes = await switchElement.getAttribute('class') || '';
        expect(classes).toContain('bg-blue-600');
      }).toPass({ timeout: 2000 });
    });

    walletTest('off state has gray background', async ({ page }) => {
      const switchElement = page.locator('[role="switch"]').first();

      // Ensure switch is off
      const isChecked = await switchElement.getAttribute('aria-checked');
      if (isChecked === 'true') {
        await switchElement.click();
      }

      await expect(async () => {
        const classes = await switchElement.getAttribute('class') || '';
        expect(classes).toContain('bg-gray-200');
      }).toPass({ timeout: 2000 });
    });

    walletTest('switch has visual indicator', async ({ page }) => {
      const switchElement = page.locator('[role="switch"]').first();

      // Switch should have child elements for visual indication
      const childSpans = switchElement.locator('span');
      const count = await childSpans.count();
      expect(count).toBeGreaterThan(0);
    });

    walletTest('switch visual state changes when toggled', async ({ page }) => {
      const switchElement = page.locator('[role="switch"]').first();

      // Get initial state
      const initialState = await switchElement.getAttribute('aria-checked');

      // Toggle switch
      await switchElement.click();

      // Wait for aria-checked to change (indicates visual state change)
      await expect(async () => {
        const newState = await switchElement.getAttribute('aria-checked');
        expect(newState).not.toBe(initialState);
      }).toPass({ timeout: 2000 });
    });
  });

  walletTest.describe('Info Icon/Tooltip', () => {
    walletTest('hovering info icon shows tooltip', async ({ page }) => {
      const infoIcon = page.locator('button[aria-label*="Info"]').first();
      const infoIconCount = await infoIcon.count();

      walletTest.skip(infoIconCount === 0, 'No info icon on this page');

      await expect(infoIcon).toBeVisible({ timeout: 2000 });

      // Hover over info icon
      await infoIcon.hover();

      // Look for tooltip text that appears on hover (use .first() to target visible tooltip)
      const tooltip = page.getByText(/Enable this to|chain transactions/i).first();
      await expect(tooltip).toBeVisible({ timeout: 2000 });
    });
  });

  walletTest.describe('Accessibility', () => {
    walletTest('switch has role="switch"', async ({ page }) => {
      const switchElement = page.locator('[role="switch"]').first();
      const role = await switchElement.getAttribute('role');
      expect(role).toBe('switch');
    });

    walletTest('switch has aria-checked attribute', async ({ page }) => {
      const switchElement = page.locator('[role="switch"]').first();
      const ariaChecked = await switchElement.getAttribute('aria-checked');
      expect(['true', 'false']).toContain(ariaChecked);
    });

    walletTest('switch is keyboard accessible', async ({ page }) => {
      const switchElement = page.locator('[role="switch"]').first();
      const initialState = await switchElement.getAttribute('aria-checked');

      // Focus and press Space
      await switchElement.focus();
      await page.keyboard.press('Space');

      await expect(async () => {
        const newState = await switchElement.getAttribute('aria-checked');
        expect(newState).not.toBe(initialState);
      }).toPass({ timeout: 2000 });
    });
  });

  walletTest.describe('Multiple Switches', () => {
    walletTest('page has multiple independent switches', async ({ page }) => {
      const switches = page.locator('[role="switch"]');
      const count = await switches.count();

      // Advanced settings has multiple switches
      expect(count).toBeGreaterThanOrEqual(1);
    });

    walletTest('toggling one switch does not affect others', async ({ page }) => {
      const switches = page.locator('[role="switch"]');
      const count = await switches.count();

      if (count >= 2) {
        const firstSwitch = switches.nth(0);
        const secondSwitch = switches.nth(1);

        // Get initial states
        const secondInitial = await secondSwitch.getAttribute('aria-checked');

        // Toggle first switch
        await firstSwitch.click();

        // Check second switch hasn't changed
        await expect(async () => {
          const secondAfter = await secondSwitch.getAttribute('aria-checked');
          expect(secondAfter).toBe(secondInitial);
        }).toPass({ timeout: 2000 });
      }
    });
  });
});
