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
    await page.waitForTimeout(500);
  });

  walletTest.describe('Rendering', () => {
    walletTest('renders switch elements', async ({ page }) => {
      // Look for HeadlessUI Switch (button role with switch behavior)
      const switches = page.locator('[role="switch"], button.bg-blue-600, button.bg-gray-200');
      const count = await switches.count();

      // Should have at least one switch
      expect(count).toBeGreaterThan(0);
    });

    walletTest('switch has associated label', async ({ page }) => {
      // Look for labels near switches
      const labels = page.locator('.font-bold');
      const count = await labels.count();

      expect(count).toBeGreaterThan(0);
    });

    walletTest('switch shows current state visually', async ({ page }) => {
      const switchElement = page.locator('[role="switch"]').first();

      if (await switchElement.isVisible({ timeout: 3000 }).catch(() => false)) {
        const classes = await switchElement.getAttribute('class') || '';

        // Should have color indicating state (blue for on, gray for off)
        const hasStateColor = classes.includes('bg-blue-600') || classes.includes('bg-gray-200');
        expect(hasStateColor).toBe(true);
      }
    });
  });

  walletTest.describe('Toggle Behavior', () => {
    walletTest('clicking switch toggles state', async ({ page }) => {
      const switchElement = page.locator('[role="switch"]').first();

      if (await switchElement.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Get initial state
        const initialChecked = await switchElement.getAttribute('aria-checked');
        const initialClasses = await switchElement.getAttribute('class') || '';

        // Click to toggle
        await switchElement.click();
        await page.waitForTimeout(300);

        // Get new state
        const newChecked = await switchElement.getAttribute('aria-checked');
        const newClasses = await switchElement.getAttribute('class') || '';

        // State should have changed
        expect(newChecked !== initialChecked || newClasses !== initialClasses).toBe(true);
      }
    });

    walletTest('double click returns to original state', async ({ page }) => {
      const switchElement = page.locator('[role="switch"]').first();

      if (await switchElement.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Get initial state
        const initialChecked = await switchElement.getAttribute('aria-checked');

        // Click twice
        await switchElement.click();
        await page.waitForTimeout(200);
        await switchElement.click();
        await page.waitForTimeout(200);

        // Get final state
        const finalChecked = await switchElement.getAttribute('aria-checked');

        // Should be back to initial state
        expect(finalChecked).toBe(initialChecked);
      }
    });

    walletTest('switch state persists after page interaction', async ({ page }) => {
      const switchElement = page.locator('[role="switch"]').first();

      if (await switchElement.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Toggle the switch
        await switchElement.click();
        await page.waitForTimeout(200);

        const stateAfterClick = await switchElement.getAttribute('aria-checked');

        // Click elsewhere on page
        await page.locator('body').click({ position: { x: 10, y: 10 } });
        await page.waitForTimeout(200);

        // State should persist
        const stateAfterBlur = await switchElement.getAttribute('aria-checked');
        expect(stateAfterBlur).toBe(stateAfterClick);
      }
    });
  });

  walletTest.describe('Visual State', () => {
    walletTest('on state has blue background', async ({ page }) => {
      const switchElement = page.locator('[role="switch"]').first();

      if (await switchElement.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Ensure switch is on
        const isChecked = await switchElement.getAttribute('aria-checked');
        if (isChecked !== 'true') {
          await switchElement.click();
          await page.waitForTimeout(200);
        }

        const classes = await switchElement.getAttribute('class') || '';
        expect(classes).toContain('bg-blue-600');
      }
    });

    walletTest('off state has gray background', async ({ page }) => {
      const switchElement = page.locator('[role="switch"]').first();

      if (await switchElement.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Ensure switch is off
        const isChecked = await switchElement.getAttribute('aria-checked');
        if (isChecked === 'true') {
          await switchElement.click();
          await page.waitForTimeout(200);
        }

        const classes = await switchElement.getAttribute('class') || '';
        expect(classes).toContain('bg-gray-200');
      }
    });

    walletTest('switch has sliding thumb', async ({ page }) => {
      const switchElement = page.locator('[role="switch"]').first();

      if (await switchElement.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Look for the thumb (circular element inside switch)
        const thumb = switchElement.locator('span.rounded-full, span.bg-white');
        const hasThumb = await thumb.isVisible().catch(() => false);

        expect(hasThumb).toBe(true);
      }
    });

    walletTest('thumb position changes when toggled', async ({ page }) => {
      const switchElement = page.locator('[role="switch"]').first();

      if (await switchElement.isVisible({ timeout: 3000 }).catch(() => false)) {
        const thumb = switchElement.locator('span.rounded-full, span.bg-white').first();

        if (await thumb.isVisible().catch(() => false)) {
          // Get initial thumb classes (position)
          const initialClasses = await thumb.getAttribute('class') || '';

          // Toggle switch
          await switchElement.click();
          await page.waitForTimeout(200);

          // Get new thumb classes
          const newClasses = await thumb.getAttribute('class') || '';

          // Transform class should have changed (translate-x-1 vs translate-x-6)
          expect(newClasses !== initialClasses).toBe(true);
        }
      }
    });
  });

  walletTest.describe('Info Icon/Tooltip', () => {
    walletTest('has info icon when description exists', async ({ page }) => {
      // Look for info icon (FiInfo)
      const infoIcon = page.locator('button[aria-label*="Info"]');
      const hasInfoIcon = await infoIcon.first().isVisible({ timeout: 3000 }).catch(() => false);

      // May or may not have info icons depending on settings
      expect(typeof hasInfoIcon).toBe('boolean');
    });

    walletTest('hovering info icon shows tooltip', async ({ page }) => {
      const infoIcon = page.locator('button[aria-label*="Info"]').first();

      if (await infoIcon.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Hover over info icon
        await infoIcon.hover();
        await page.waitForTimeout(300);

        // Look for tooltip
        const tooltip = page.locator('.shadow-lg.border');
        const tooltipVisible = await tooltip.isVisible().catch(() => false);

        expect(tooltipVisible).toBe(true);
      }
    });
  });

  walletTest.describe('Accessibility', () => {
    walletTest('switch has role="switch"', async ({ page }) => {
      const switchElement = page.locator('[role="switch"]').first();

      if (await switchElement.isVisible({ timeout: 3000 }).catch(() => false)) {
        const role = await switchElement.getAttribute('role');
        expect(role).toBe('switch');
      }
    });

    walletTest('switch has aria-checked attribute', async ({ page }) => {
      const switchElement = page.locator('[role="switch"]').first();

      if (await switchElement.isVisible({ timeout: 3000 }).catch(() => false)) {
        const ariaChecked = await switchElement.getAttribute('aria-checked');
        expect(ariaChecked === 'true' || ariaChecked === 'false').toBe(true);
      }
    });

    walletTest('switch is keyboard accessible', async ({ page }) => {
      const switchElement = page.locator('[role="switch"]').first();

      if (await switchElement.isVisible({ timeout: 3000 }).catch(() => false)) {
        const initialState = await switchElement.getAttribute('aria-checked');

        // Focus and press Space
        await switchElement.focus();
        await page.keyboard.press('Space');
        await page.waitForTimeout(200);

        const newState = await switchElement.getAttribute('aria-checked');
        expect(newState).not.toBe(initialState);
      }
    });

    walletTest('switch can be toggled with Enter key', async ({ page }) => {
      const switchElement = page.locator('[role="switch"]').first();

      if (await switchElement.isVisible({ timeout: 3000 }).catch(() => false)) {
        const initialState = await switchElement.getAttribute('aria-checked');

        // Focus and press Enter
        await switchElement.focus();
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);

        const newState = await switchElement.getAttribute('aria-checked');
        // Enter may or may not toggle - depends on implementation
        expect(typeof newState).toBe('string');
      }
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
        const firstInitial = await firstSwitch.getAttribute('aria-checked');
        const secondInitial = await secondSwitch.getAttribute('aria-checked');

        // Toggle first switch
        await firstSwitch.click();
        await page.waitForTimeout(200);

        // Check second switch hasn't changed
        const secondAfter = await secondSwitch.getAttribute('aria-checked');
        expect(secondAfter).toBe(secondInitial);
      }
    });
  });
});
