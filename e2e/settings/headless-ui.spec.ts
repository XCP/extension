import { test, expect } from '@playwright/test';
import { 
  launchExtension, 
  setupWallet, 
  navigateViaFooter,
  getCurrentAddress,
  cleanup,
  TEST_PASSWORD 
} from '../helpers/test-helpers';

test.describe('Settings with Headless UI Components', () => {
  test('change address type using Headless UI RadioGroup', async () => {
    const { context, page } = await launchExtension('address-type-headless');
    await setupWallet(page);
    
    // Get current address
    const originalAddress = await getCurrentAddress(page);
    expect(originalAddress).toBeTruthy();
    
    // Navigate to settings
    await navigateViaFooter(page, 'settings');
    
    // Click Address Type
    const addressTypeOption = page.getByText('Address Type');
    if (await addressTypeOption.isVisible()) {
      await addressTypeOption.click();
      await page.waitForTimeout(1000);
      
      // Headless UI RadioGroup options are divs with role="radio"
      const radioOptions = await page.locator('[role="radio"]').all();
      
      if (radioOptions.length > 1) {
        // Find the selected option (it should have aria-checked="true")
        let selectedIndex = -1;
        for (let i = 0; i < radioOptions.length; i++) {
          const checkedAttr = await radioOptions[i].getAttribute('aria-checked');
          const isChecked = checkedAttr === 'true';
          if (isChecked) {
            selectedIndex = i;
            break;
          }
        }
        
        // Select a different option
        const nextIndex = selectedIndex === 0 ? 1 : 0;
        await radioOptions[nextIndex].click();
        await page.waitForTimeout(1000);
        
        // Verify selection changed
        const newChecked = await radioOptions[nextIndex].getAttribute('aria-checked');
        expect(newChecked).toBe('true');
        
        // Navigate back to index to see if address changed
        await navigateViaFooter(page, 'wallet');
        await page.waitForTimeout(1000);
        
        const newAddress = await getCurrentAddress(page);
        // Address might change or might stay the same depending on wallet type
        expect(newAddress).toBeTruthy();
      }
    }
    
    await cleanup(context);
  });

  test('auto-lock timer settings with Headless UI', async () => {
    const { context, page } = await launchExtension('auto-lock-headless');
    await setupWallet(page);
    
    // Navigate to settings
    await navigateViaFooter(page, 'settings');
    
    // Look for Security or Advanced settings
    const securityOption = page.getByText('Security');
    const advancedOption = page.getByText('Advanced');
    
    if (await securityOption.isVisible()) {
      await securityOption.click();
    } else if (await advancedOption.isVisible()) {
      await advancedOption.click();
    }
    
    // Look for auto-lock settings (use .first() - matches both label and description)
    const autoLockLabel = page.locator('text=/Auto.*Lock.*Timer/i').first();
    if (await autoLockLabel.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Already on advanced page, auto-lock is visible
      
      // Should show timeout options as radio buttons
      const timeoutOptions = await page.locator('[role="radio"]').all();
      if (timeoutOptions.length > 0) {
        // Test selecting different timeout
        const firstOption = timeoutOptions[0];
        await firstOption.click();
        
        // Verify selection
        const isSelected = await firstOption.getAttribute('aria-checked');
        expect(isSelected).toBe('true');
      }
    }
    
    await cleanup(context);
  });

  test('currency selection using Headless UI components', async () => {
    const { context, page } = await launchExtension('currency-headless');
    await setupWallet(page);
    
    // Navigate to settings
    await navigateViaFooter(page, 'settings');
    
    // Look for General or Currency settings
    const generalOption = page.getByText('General');
    if (await generalOption.isVisible()) {
      await generalOption.click();
      await page.waitForTimeout(1000);
    }
    
    // Look for currency option
    const currencyOption = page.locator('text=/Currency|Fiat/i');
    if (await currencyOption.isVisible()) {
      await currencyOption.click();
      await page.waitForTimeout(1000);
      
      // Should show currency options
      const currencyRadios = await page.locator('[role="radio"]').all();
      if (currencyRadios.length > 1) {
        // Select second currency option
        await currencyRadios[1].click();
        
        // Verify selection
        const isSelected = await currencyRadios[1].getAttribute('aria-checked');
        expect(isSelected).toBe('true');
      }
    }
    
    await cleanup(context);
  });

  test('headless UI dropdown menus in settings', async () => {
    const { context, page } = await launchExtension('dropdown-headless');
    await setupWallet(page);
    
    // Navigate to settings
    await navigateViaFooter(page, 'settings');
    
    // Look for any dropdown menus (Headless UI Listbox)
    const dropdownButtons = await page.locator('[role="button"][aria-haspopup="listbox"]').all();
    
    if (dropdownButtons.length > 0) {
      const firstDropdown = dropdownButtons[0];
      await firstDropdown.click();
      await page.waitForTimeout(500);
      
      // Should show dropdown options
      const options = await page.locator('[role="option"]').all();
      if (options.length > 1) {
        await options[1].click();
        await page.waitForTimeout(500);
        
        // Dropdown should close and selection should be made
        const isVisible = await page.locator('[role="listbox"]').isVisible();
        expect(isVisible).toBe(false);
      }
    }
    
    await cleanup(context);
  });

  test('headless UI switch components for toggles', async () => {
    const { context, page } = await launchExtension('switch-headless');
    await setupWallet(page);
    
    // Navigate to settings
    await navigateViaFooter(page, 'settings');
    
    // Look for toggle switches (Headless UI Switch)
    const switches = await page.locator('[role="switch"]').all();
    
    if (switches.length > 0) {
      const firstSwitch = switches[0];
      const initialState = await firstSwitch.getAttribute('aria-checked');
      
      // Toggle the switch
      await firstSwitch.click();
      await page.waitForTimeout(500);
      
      // State should have changed
      const newState = await firstSwitch.getAttribute('aria-checked');
      expect(newState).not.toBe(initialState);
    }
    
    await cleanup(context);
  });

  test('headless UI modal dialogs in settings', async () => {
    const { context, page } = await launchExtension('modal-headless');
    await setupWallet(page);
    
    // Navigate to settings
    await navigateViaFooter(page, 'settings');
    
    // Look for actions that might trigger modals
    const actionButtons = [
      'Reset Wallet',
      'Clear Data', 
      'Export',
      'Backup',
      'Delete'
    ];
    
    for (const buttonText of actionButtons) {
      const button = page.locator(`button:has-text("${buttonText}")`).first();
      if (await button.isVisible()) {
        await button.click();
        await page.waitForTimeout(500);
        
        // Should show modal dialog
        const modal = page.locator('[role="dialog"], .modal');
        if (await modal.isVisible()) {
          // Should have cancel/close button
          let cancelButton;
          const cancelBtn = modal.locator('button:has-text("Cancel")').first();
          const closeBtn = modal.locator('button:has-text("Close")').first();
          const ariaCloseBtn = modal.locator('[aria-label*="Close"]').first();
          
          if (await cancelBtn.isVisible()) {
            cancelButton = cancelBtn;
          } else if (await closeBtn.isVisible()) {
            cancelButton = closeBtn;
          } else if (await ariaCloseBtn.isVisible()) {
            cancelButton = ariaCloseBtn;
          }
          if (cancelButton && await cancelButton.isVisible()) {
            await cancelButton.click();
            await page.waitForTimeout(500);
            
            // Modal should close
            const stillVisible = await modal.isVisible();
            expect(stillVisible).toBe(false);
          }
          break; // Found and tested a modal
        }
      }
    }
    
    await cleanup(context);
  });

  test('keyboard navigation in headless UI components', async () => {
    const { context, page } = await launchExtension('keyboard-nav-headless');
    await setupWallet(page);

    // Navigate to settings > Advanced where we know there are switches
    await navigateViaFooter(page, 'settings');
    const advancedOption = page.getByText('Advanced');
    await expect(advancedOption).toBeVisible({ timeout: 5000 });
    await advancedOption.click();
    await page.waitForURL(/advanced/, { timeout: 5000 });

    // Wait for page to stabilize
    await page.waitForLoadState('networkidle');

    // Test keyboard navigation on switches (we know Advanced page has them)
    const switchElement = page.locator('[role="switch"]').first();
    await expect(switchElement).toBeVisible({ timeout: 5000 });

    // Get initial state
    const initialState = await switchElement.getAttribute('aria-checked');

    // Focus on the switch
    await switchElement.focus();

    // Press space to toggle
    await page.keyboard.press('Space');

    // Wait for state change
    await page.waitForTimeout(300);

    // Verify state changed (keyboard toggle worked)
    const newState = await switchElement.getAttribute('aria-checked');
    expect(newState).not.toBe(initialState);

    await cleanup(context);
  });

  test('headless UI accessibility attributes', async () => {
    const { context, page } = await launchExtension('a11y-headless');
    await setupWallet(page);

    // Navigate to settings > Advanced (where switches are)
    await navigateViaFooter(page, 'settings');
    const advancedOption = page.getByText('Advanced');
    await expect(advancedOption).toBeVisible({ timeout: 5000 });
    await advancedOption.click();
    await page.waitForURL(/advanced/, { timeout: 5000 });

    // Wait for page to stabilize
    await page.waitForLoadState('networkidle');

    // Check for proper ARIA attributes on switch components
    const switches = await page.locator('[role="switch"]').all();
    expect(switches.length).toBeGreaterThan(0);

    for (const switchEl of switches) {
      // Should have aria-checked attribute
      const hasAriaChecked = await switchEl.getAttribute('aria-checked');
      expect(hasAriaChecked).not.toBeNull();
      expect(['true', 'false']).toContain(hasAriaChecked);
    }

    // Check that visible buttons have proper labels
    const visibleButtons = page.locator('button:visible');
    const buttonCount = await visibleButtons.count();
    expect(buttonCount).toBeGreaterThan(0);

    // Check first few buttons for labels (not all, to avoid stale element issues)
    const buttonsToCheck = Math.min(buttonCount, 5);
    for (let i = 0; i < buttonsToCheck; i++) {
      const button = visibleButtons.nth(i);
      const hasLabel = await button.getAttribute('aria-label') ||
                       await button.textContent() ||
                       await button.getAttribute('aria-labelledby');
      expect(hasLabel).toBeTruthy();
    }

    await cleanup(context);
  });
});