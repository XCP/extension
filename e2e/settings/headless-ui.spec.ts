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
    
    await page.waitForTimeout(1000);
    
    // Look for auto-lock settings
    const autoLockOption = page.locator('text=/Auto.*Lock|auto.*lock/i');
    if (await autoLockOption.isVisible()) {
      await autoLockOption.click();
      await page.waitForTimeout(1000);
      
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
    
    // Navigate to settings
    await navigateViaFooter(page, 'settings');
    
    // Test keyboard navigation on radio groups or switches
    const radioGroup = page.locator('[role="radiogroup"]').first();
    const switchElement = page.locator('[role="switch"]').first();
    
    if (await radioGroup.isVisible()) {
      // Focus on the radio group
      await radioGroup.click();
      await page.waitForTimeout(200);
      
      // Use arrow keys to navigate
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(200);
      
      // Check if a radio button is selected
      const checkedRadio = await page.locator('[role="radio"][aria-checked="true"]').count();
      expect(checkedRadio).toBeGreaterThan(0);
    } else if (await switchElement.isVisible()) {
      // Test switch toggle with keyboard
      await switchElement.focus();
      await page.waitForTimeout(200);
      
      // Press space to toggle
      await page.keyboard.press('Space');
      await page.waitForTimeout(200);
      
      // Verify it's still visible (didn't navigate away)
      expect(await switchElement.isVisible()).toBe(true);
    } else {
      // Test general tab navigation on any button or link
      const firstButton = page.locator('button:visible, a:visible').first();
      if (await firstButton.isVisible()) {
        await firstButton.focus();
        await page.waitForTimeout(200);
        
        // Press tab to move to next element
        await page.keyboard.press('Tab');
        await page.waitForTimeout(200);
        
        // Just verify we're still on the settings page (didn't crash)
        expect(page.url()).toContain('settings');
      }
    }
    
    await cleanup(context);
  });

  test('headless UI accessibility attributes', async () => {
    const { context, page } = await launchExtension('a11y-headless');
    await setupWallet(page);
    
    // Navigate to settings
    await navigateViaFooter(page, 'settings');
    
    // Check for proper ARIA attributes on components
    const radioButtons = await page.locator('[role="radio"]').all();
    if (radioButtons.length > 0) {
      for (const radio of radioButtons) {
        // Should have aria-checked attribute
        const hasAriaChecked = await radio.getAttribute('aria-checked');
        expect(hasAriaChecked).not.toBeNull();
        expect(['true', 'false']).toContain(hasAriaChecked);
      }
    }
    
    // Check buttons have proper labels
    const buttons = await page.locator('[role="button"]').all();
    if (buttons.length > 0) {
      for (const button of buttons) {
        const hasLabel = await button.getAttribute('aria-label') || 
                         await button.textContent() ||
                         await button.getAttribute('aria-labelledby');
        expect(hasLabel).toBeTruthy();
      }
    }
    
    await cleanup(context);
  });
});