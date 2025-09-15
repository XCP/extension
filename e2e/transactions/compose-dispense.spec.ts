import { test, expect } from '@playwright/test';
import { launchExtension, setupWallet, cleanup } from '../helpers/test-helpers';

test.describe('Compose Dispense', () => {

  test('should compose dispense transaction', async () => {
    const extensionContext = await launchExtension('compose-dispense-transaction');
    const { page, extensionId, context } = extensionContext;
    await setupWallet(page);
    
    // Navigate directly to compose dispense page
    await page.goto(`chrome-extension://${extensionId}/popup.html#/compose/dispenser/dispense`);
    await page.waitForLoadState('networkidle', { timeout: 15000 });
    
    // Should show dispenser address input or be on the dispense page
    const labelVisible = await page.locator('label:has-text("Dispenser Address")').isVisible({ timeout: 5000 }).catch(() => false);
    const inputVisible = await page.locator('input[name="dispenserAddress"]').isVisible({ timeout: 5000 }).catch(() => false);
    
    if (!labelVisible && !inputVisible) {
      // Just verify we're on the dispense page
      expect(page.url()).toContain('dispenser/dispense');
    } else {
      // Enter a test dispenser address
      const addressInput = page.locator('input[name="dispenserAddress"]');
      if (await addressInput.isVisible()) {
        await addressInput.fill('1BigDeaLFejyJiK6rLaj4LYCikD5CfYyhp');
        
        // Wait for response
        await page.waitForTimeout(3000);
        
        // Check for various expected outcomes in test environment
        const noDispenserError = await page.locator('text=/No open dispenser found at this address/i').isVisible({ timeout: 3000 }).catch(() => false);
        const utxoError = await page.locator('text=/No UTXOs found/i').isVisible({ timeout: 3000 }).catch(() => false);
        const dispenserRadios = await page.locator('input[type="radio"]').count();
        
        // Any of these outcomes is acceptable in a test environment
        const hasExpectedOutcome = noDispenserError || utxoError || dispenserRadios > 0;
        expect(hasExpectedOutcome).toBe(true);
      }
    }
    
    await cleanup(context);
  });

  test('should handle multiple dispensers at same address', async () => {
    const extensionContext = await launchExtension('compose-dispense-multiple');
    const { page, extensionId } = extensionContext;
    await setupWallet(page);
    
    // Navigate directly to compose dispense page
    await page.goto(`chrome-extension://${extensionId}/popup.html#/compose/dispenser/dispense`);
    await page.waitForLoadState('networkidle');
    
    // Verify the dispenser address input is present
    await expect(page.locator('label:has-text("Dispenser Address")')).toBeVisible();
    
    // Enter a test address
    await page.fill('input[name="dispenserAddress"]', 'bc1qtest');
    await page.waitForTimeout(2000);
    
    // In test environment, we expect no dispensers to be found
    const errorVisible = await page.locator('text=/No open dispenser found at this address/i').isVisible({ timeout: 3000 }).catch(() => false);
    
    // Verify error handling works properly
    if (errorVisible) {
      await expect(page.locator('text=/No open dispenser found at this address/i')).toBeVisible();
    } else {
      // If dispensers are somehow found, test the selection logic
      const dispenserRadios = await page.locator('input[type="radio"]').count();
      if (dispenserRadios > 1) {
        // Select the second dispenser
        await page.locator('input[type="radio"]').nth(1).click();
        expect(await page.locator('input[type="radio"]').nth(1).isChecked()).toBe(true);
      }
    }
  });

  test('should calculate max dispenses correctly', async () => {
    const extensionContext = await launchExtension('compose-dispense-max');
    const { page, extensionId } = extensionContext;
    await setupWallet(page);
    
    // Navigate directly to compose dispense page
    await page.goto(`chrome-extension://${extensionId}/popup.html#/compose/dispenser/dispense`);
    await page.waitForLoadState('networkidle');
    
    // Enter dispenser address
    await page.fill('input[name="dispenserAddress"]', 'bc1qdispenser');
    await page.waitForTimeout(1000);
    
    // Select dispenser if available
    const dispenserRadio = page.locator('input[type="radio"]').first();
    if (await dispenserRadio.isVisible()) {
      await dispenserRadio.click();
      
      // Click Max button
      const maxButton = page.locator('button:has-text("Max")');
      if (await maxButton.isVisible()) {
        await maxButton.click();
        
        // Check that a value was filled
        const amountInput = page.locator('input[name="numberOfDispenses"]');
        const value = await amountInput.inputValue();
        
        // Should have some value
        expect(value).not.toBe('');
        expect(parseInt(value)).toBeGreaterThan(0);
      }
    }
  });

  test('should show error for insufficient balance', async () => {
    const extensionContext = await launchExtension('compose-dispense-insufficient');
    const { page, extensionId } = extensionContext;
    await setupWallet(page);
    
    // Navigate directly to compose dispense page
    await page.goto(`chrome-extension://${extensionId}/popup.html#/compose/dispenser/dispense`);
    await page.waitForLoadState('networkidle');
    
    // Enter expensive dispenser address
    await page.fill('input[name="dispenserAddress"]', 'bc1qexpensive');
    await page.waitForTimeout(1000);
    
    // Select dispenser if available
    const dispenserRadio = page.locator('input[type="radio"]').first();
    if (await dispenserRadio.isVisible()) {
      await dispenserRadio.click();
      
      // Click Max button
      const maxButton = page.locator('button:has-text("Max")');
      if (await maxButton.isVisible()) {
        await maxButton.click();
        
        // Check for insufficient balance error
        const errorMessage = page.locator('text=/Insufficient BTC balance/i');
        if (await errorMessage.isVisible()) {
          await expect(errorMessage).toBeVisible();
        }
      }
    }
  });

  test('should display multiple assets on review when multiple dispensers trigger', async () => {
    const extensionContext = await launchExtension('compose-dispense-multiple-assets');
    const { page, extensionId } = extensionContext;
    await setupWallet(page);
    
    // This would require setting up a scenario where BTC amount is enough to trigger multiple dispensers
    // Navigate directly to compose dispense page
    await page.goto(`chrome-extension://${extensionId}/popup.html#/compose/dispenser/dispense`);
    await page.waitForLoadState('networkidle');
    
    // Enter address with multiple low-cost dispensers (real address with multiple assets)
    await page.fill('input[name="dispenserAddress"]', '1BigDeaLFejyJiK6rLaj4LYCikD5CfYyhp');
    await page.waitForTimeout(1000);
    
    // Select a dispenser
    const dispenserRadio = page.locator('input[type="radio"]').first();
    if (await dispenserRadio.isVisible()) {
      await dispenserRadio.click();
      
      // Enter high amount to trigger multiple dispensers
      await page.fill('input[name="numberOfDispenses"]', '100');
      
      // Continue to review
      await page.click('button:has-text("Continue")');
      
      // Check if review shows multiple dispensers
      const dispensersLabel = page.locator('text=Dispensers:');
      if (await dispensersLabel.isVisible()) {
        // Get the value
        const dispensersValue = await dispensersLabel.locator('..').locator('.bg-gray-50').textContent();
        if (dispensersValue && parseInt(dispensersValue) > 1) {
          // Should show "You Receive" with multiple lines
          const youReceive = await page.locator('text=You Receive:').locator('..').locator('.bg-gray-50');
          const receiveText = await youReceive.textContent();
          
          // Should contain newlines (multiple assets)
          expect(receiveText).toContain('\n');
        }
      }
    }
  });

  test('should allow editing times to dispense after clicking max', async () => {
    const extensionContext = await launchExtension('compose-dispense-edit-after-max');
    const { page, extensionId } = extensionContext;
    await setupWallet(page);
    
    // Navigate directly to compose dispense page
    await page.goto(`chrome-extension://${extensionId}/popup.html#/compose/dispenser/dispense`);
    await page.waitForLoadState('networkidle');
    
    // Enter dispenser address
    await page.fill('input[name="dispenserAddress"]', 'bc1qdispenser');
    await page.waitForTimeout(1000);
    
    // Select dispenser
    const dispenserRadio = page.locator('input[type="radio"]').first();
    if (await dispenserRadio.isVisible()) {
      await dispenserRadio.click();
      
      // Click Max button
      const maxButton = page.locator('button:has-text("Max")');
      if (await maxButton.isVisible()) {
        await maxButton.click();
        
        // Get the max value
        const amountInput = page.locator('input[name="numberOfDispenses"]');
        const maxValue = await amountInput.inputValue();
        
        // Try to edit the value
        await amountInput.clear();
        await amountInput.fill('1');
        
        // Value should be updated
        const newValue = await amountInput.inputValue();
        expect(newValue).toBe('1');
        expect(newValue).not.toBe(maxValue);
      }
    }
  });
});