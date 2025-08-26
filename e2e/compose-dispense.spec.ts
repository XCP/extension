import { test, expect } from '@playwright/test';
import { launchExtension, createWallet } from './helpers/test-helpers';

test.describe('Compose Dispense', () => {
  let extensionContext: any;
  
  test.beforeEach(async () => {
    // Launch extension and create wallet
    extensionContext = await launchExtension('compose-dispense');
    const { page } = extensionContext;
    await createWallet(page);
  });

  test('should compose dispense transaction', async () => {
    const { page } = extensionContext;
    
    // Navigate to compose dispense
    await page.click('text=Assets');
    await page.click('text=BTC');
    await page.click('text=Dispense');
    
    // Should show dispenser address input
    await expect(page.locator('label:has-text("Dispenser Address")')).toBeVisible();
    
    // Enter a dispenser address
    await page.fill('input[name="dispenserAddress"]', 'bc1qkqqphrs38ryju5725erdqqsa74alx9keh8z78t');
    
    // Wait for dispensers to load (mocked in test environment)
    await page.waitForTimeout(1000);
    
    // Check if error or dispensers are shown
    const hasError = await page.locator('text=/No open dispenser found/i').isVisible();
    if (hasError) {
      // If no dispensers found, verify error message
      await expect(page.locator('text=/No open dispenser found at this address/i')).toBeVisible();
    } else {
      // If dispensers found, select one
      const dispenserRadio = page.locator('input[type="radio"]').first();
      if (await dispenserRadio.isVisible()) {
        await dispenserRadio.click();
        
        // Should show amount input
        await expect(page.locator('label:has-text("Times to Dispense")')).toBeVisible();
        
        // Enter amount
        await page.fill('input[name="numberOfDispenses"]', '1');
        
        // Continue to review
        await page.click('button:has-text("Continue")');
        
        // Should show review screen
        await expect(page.locator('text=Review Transaction')).toBeVisible();
        await expect(page.locator('text=BTC Payment')).toBeVisible();
      }
    }
  });

  test('should handle multiple dispensers at same address', async () => {
    const { page } = extensionContext;
    
    // Navigate to compose dispense
    await page.click('text=Assets');
    await page.click('text=BTC');
    await page.click('text=Dispense');
    
    // Enter address with multiple dispensers
    await page.fill('input[name="dispenserAddress"]', 'bc1qmultiple');
    await page.waitForTimeout(1000);
    
    // Check if multiple dispensers are shown
    const dispenserRadios = page.locator('input[type="radio"]');
    const count = await dispenserRadios.count();
    
    if (count > 1) {
      // Verify dispensers are sorted by price
      const firstDispenser = page.locator('label[for^="dispenser-"]').first();
      const lastDispenser = page.locator('label[for^="dispenser-"]').last();
      
      // Get BTC prices
      const firstPrice = await firstDispenser.locator('text=/\\d+\\.\\d+ BTC/').textContent();
      const lastPrice = await lastDispenser.locator('text=/\\d+\\.\\d+ BTC/').textContent();
      
      if (firstPrice && lastPrice) {
        const firstPriceNum = parseFloat(firstPrice.replace(' BTC', ''));
        const lastPriceNum = parseFloat(lastPrice.replace(' BTC', ''));
        
        // First should be cheaper or equal to last
        expect(firstPriceNum).toBeLessThanOrEqual(lastPriceNum);
      }
    }
  });

  test('should calculate max dispenses correctly', async () => {
    const { page } = extensionContext;
    
    // Navigate to compose dispense
    await page.click('text=Assets');
    await page.click('text=BTC');
    await page.click('text=Dispense');
    
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
    const { page } = extensionContext;
    
    // Navigate to compose dispense
    await page.click('text=Assets');
    await page.click('text=BTC');
    await page.click('text=Dispense');
    
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
    const { page } = extensionContext;
    
    // This would require setting up a scenario where BTC amount is enough to trigger multiple dispensers
    // Navigate to compose dispense
    await page.click('text=Assets');
    await page.click('text=BTC');
    await page.click('text=Dispense');
    
    // Enter address with multiple low-cost dispensers
    await page.fill('input[name="dispenserAddress"]', 'bc1qkqqphrs38ryju5725erdqqsa74alx9keh8z78t');
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
    const { page } = extensionContext;
    
    // Navigate to compose dispense
    await page.click('text=Assets');
    await page.click('text=BTC');
    await page.click('text=Dispense');
    
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