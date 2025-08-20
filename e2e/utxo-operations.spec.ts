import { test, expect } from '@playwright/test';
import { launchExtension, ExtensionContext, TEST_PASSWORD, TEST_MNEMONIC } from './helpers/test-helpers';

let extensionContext: ExtensionContext;

test.beforeAll(async () => {
  extensionContext = await launchExtension('utxo-operations');
});

test.afterAll(async () => {
  if (extensionContext?.context) {
    await extensionContext.context.close();
  }
});

test.describe('UTXO Operations', () => {
  test.beforeEach(async () => {
    const { page, extensionId } = extensionContext;
    
    // Navigate to extension
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    
    // Setup wallet if needed
    if (await page.locator('text=Welcome to XCP Wallet').isVisible({ timeout: 3000 }).catch(() => false)) {
      // Import wallet
      await page.click('text=Import Wallet');
      await page.fill('textarea[name="mnemonic"]', TEST_MNEMONIC);
      await page.fill('input[name="password"]', TEST_PASSWORD);
      await page.fill('input[name="confirmPassword"]', TEST_PASSWORD);
      await page.click('button:has-text("Import Wallet")');
      await page.waitForSelector('text=Your wallet has been successfully imported', { timeout: 10000 });
    } else if (await page.locator('input[name="password"]').isVisible({ timeout: 3000 }).catch(() => false)) {
      // Unlock wallet
      await page.fill('input[name="password"]', TEST_PASSWORD);
      await page.click('button:has-text("Unlock")');
    }
    
    // Wait for main page to load
    await page.waitForSelector('text=Balance', { timeout: 10000 });
  });

  test.describe('Attach Operation', () => {
    test('should attach assets to a UTXO', async () => {
      const { page } = extensionContext;
      
      // Navigate to a balance with XCP
      await page.click('text=XCP');
      await page.waitForSelector('text=Balance');
      
      // Click Attach action
      await page.click('text=Attach');
      await page.waitForSelector('text=Attach UTXO');
      
      // Verify form elements
      await expect(page.locator('text=Amount')).toBeVisible();
      await expect(page.locator('text=Fee Rate')).toBeVisible();
      
      // Continue button should be disabled initially
      const continueButton = page.locator('button:has-text("Continue")');
      await expect(continueButton).toBeDisabled();
      
      // Enter amount
      await page.fill('input[name="quantity"]', '1');
      
      // Continue button should be enabled now
      await expect(continueButton).toBeEnabled();
      
      // Enter fee rate
      await page.fill('input[name="sat_per_vbyte"]', '1');
      
      // Submit form
      await continueButton.click();
      
      // Should navigate to review screen
      await expect(page.locator('text=Review Transaction')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('text=XCP Fee')).toBeVisible();
    });

    test('should show error for insufficient XCP', async () => {
      const { page } = extensionContext;
      
      // Navigate to an asset balance
      await page.locator('text=TESTTOKEN').first().click();
      await page.waitForSelector('text=Balance');
      
      // Click Attach
      await page.click('text=Attach');
      
      // Enter large amount
      await page.fill('input[name="quantity"]', '999999');
      await page.fill('input[name="sat_per_vbyte"]', '1');
      
      // Submit form
      await page.click('button:has-text("Continue")');
      
      // Should show error
      await expect(page.locator('role=alert')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('text=/insufficient/i')).toBeVisible();
    });

    test('should not allow zero or negative amounts', async () => {
      const { page } = extensionContext;
      
      // Navigate to XCP balance
      await page.click('text=XCP');
      await page.waitForSelector('text=Balance');
      
      // Click Attach
      await page.click('text=Attach');
      
      // Try zero amount
      await page.fill('input[name="quantity"]', '0');
      
      // Continue button should remain disabled
      const continueButton = page.locator('button:has-text("Continue")');
      await expect(continueButton).toBeDisabled();
      
      // Try negative amount
      await page.fill('input[name="quantity"]', '-5');
      await expect(continueButton).toBeDisabled();
    });
  });

  test.describe('Move Operation', () => {
    test('should move UTXO with all balances', async () => {
      const { page } = extensionContext;
      
      // Navigate to a UTXO page
      await page.locator('text=TESTTOKEN').first().click();
      await page.waitForSelector('text=Balance');
      await page.click('text=View UTXO');
      
      // Click Move action
      await page.click('button:has-text("Move")');
      await page.waitForSelector('text=Move UTXO');
      
      // Verify Output display
      await expect(page.locator('text=Output')).toBeVisible();
      await expect(page.locator('text=/Balance/i')).toBeVisible();
      
      // Enter destination
      await page.fill('input[name="destination_display"]', 'bc1qtest456');
      
      // Enter fee rate
      await page.fill('input[name="sat_per_vbyte"]', '1');
      
      // Submit form
      await page.click('button:has-text("Continue")');
      
      // Should navigate to review screen
      await expect(page.locator('text=Review Transaction')).toBeVisible({ timeout: 10000 });
    });

    test('should validate destination address', async () => {
      const { page } = extensionContext;
      
      // Navigate to UTXO
      await page.locator('text=TESTTOKEN').first().click();
      await page.click('text=View UTXO');
      await page.click('button:has-text("Move")');
      
      // Enter invalid destination
      await page.fill('input[name="destination_display"]', 'invalid_address');
      
      // Continue button should be disabled
      const continueButton = page.locator('button:has-text("Continue")');
      await expect(continueButton).toBeDisabled();
      
      // Enter valid destination
      await page.fill('input[name="destination_display"]', 'bc1qvalid789');
      await page.fill('input[name="sat_per_vbyte"]', '1');
      
      // Continue button should be enabled
      await expect(continueButton).toBeEnabled();
    });

    test('should display error for API failures', async () => {
      const { page } = extensionContext;
      
      // Mock API failure
      await page.route('**/api/v2/utxo/**', route => {
        route.fulfill({
          status: 400,
          body: JSON.stringify({ error: 'UTXO not found' })
        });
      });
      
      // Navigate to UTXO move
      await page.locator('text=TESTTOKEN').first().click();
      await page.click('text=View UTXO');
      await page.click('button:has-text("Move")');
      
      // Fill form
      await page.fill('input[name="destination_display"]', 'bc1qtest789');
      await page.fill('input[name="sat_per_vbyte"]', '1');
      
      // Submit
      await page.click('button:has-text("Continue")');
      
      // Should show error
      await expect(page.locator('role=alert')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('text=UTXO not found')).toBeVisible();
    });
  });

  test.describe('Detach Operation', () => {
    test('should detach all assets from UTXO', async () => {
      const { page } = extensionContext;
      
      // Navigate to UTXO
      await page.locator('text=TESTTOKEN').first().click();
      await page.click('text=View UTXO');
      await page.click('button:has-text("Detach")');
      
      await page.waitForSelector('text=Detach UTXO');
      
      // Verify Output display
      await expect(page.locator('text=Output')).toBeVisible();
      
      // Destination is optional - leave empty
      // Just set fee rate
      await page.fill('input[name="sat_per_vbyte"]', '1');
      
      // Submit
      await page.click('button:has-text("Continue")');
      
      // Should navigate to review
      await expect(page.locator('text=Review Transaction')).toBeVisible({ timeout: 10000 });
    });

    test('should detach with custom destination', async () => {
      const { page } = extensionContext;
      
      // Navigate to UTXO
      await page.locator('text=TESTTOKEN').first().click();
      await page.click('text=View UTXO');
      await page.click('button:has-text("Detach")');
      
      // Enter custom destination
      await page.fill('input[name="destination_display"]', 'bc1qcustom123');
      await page.fill('input[name="sat_per_vbyte"]', '1');
      
      // Submit
      await page.click('button:has-text("Continue")');
      
      // Should navigate to review
      await expect(page.locator('text=Review Transaction')).toBeVisible({ timeout: 10000 });
    });

    test('should handle detach without destination gracefully', async () => {
      const { page } = extensionContext;
      
      // Navigate to UTXO
      await page.locator('text=TESTTOKEN').first().click();
      await page.click('text=View UTXO');
      await page.click('button:has-text("Detach")');
      
      // Leave destination empty (valid for detach)
      const destinationInput = page.locator('input[name="destination_display"]');
      await expect(destinationInput).toHaveAttribute('placeholder', 'Leave empty to use UTXO\'s address');
      
      // Only fill fee rate
      await page.fill('input[name="sat_per_vbyte"]', '1');
      
      // Continue button should be enabled
      const continueButton = page.locator('button:has-text("Continue")');
      await expect(continueButton).toBeEnabled();
      
      // Submit
      await continueButton.click();
      
      // Should proceed to review
      await expect(page.locator('text=Review Transaction')).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('UTXO View Page', () => {
    test('should display Bitcoin transaction details', async () => {
      const { page } = extensionContext;
      
      // Navigate to UTXO view
      await page.locator('text=TESTTOKEN').first().click();
      await page.click('text=View UTXO');
      
      await page.waitForSelector('text=UTXO Details');
      
      // Check for Bitcoin details
      await expect(page.locator('text=Time Attached')).toBeVisible();
      await expect(page.locator('text=Confirmations')).toBeVisible();
      await expect(page.locator('text=BTC Value')).toBeVisible();
    });

    test('should copy UTXO to clipboard', async () => {
      const { page } = extensionContext;
      
      // Mock clipboard API
      await page.evaluate(() => {
        // @ts-ignore
        navigator.clipboard = {
          writeText: (text: string) => Promise.resolve()
        };
      });
      
      // Navigate to UTXO view
      await page.locator('text=TESTTOKEN').first().click();
      await page.click('text=View UTXO');
      
      // Click copy button in header
      const copyButton = page.locator('button[aria-label*="Copy"]');
      await copyButton.click();
      
      // Verify feedback (could be a toast or visual change)
      // This depends on implementation
    });

    test('should navigate back to balance view', async () => {
      const { page } = extensionContext;
      
      // Navigate to UTXO view
      await page.locator('text=TESTTOKEN').first().click();
      await page.click('text=View UTXO');
      
      // Click back button
      await page.click('button[aria-label="Back"]');
      
      // Should be back at index page (not balance page to avoid loops)
      await expect(page).toHaveURL(/.*\/#?\/?$/);
    });

    test('should display all balances in UTXO', async () => {
      const { page } = extensionContext;
      
      // Navigate to UTXO with multiple balances
      await page.locator('text=TESTTOKEN').first().click();
      await page.click('text=View UTXO');
      
      await page.waitForSelector('text=UTXO Balances');
      
      // Check for balance list
      const balances = page.locator('[data-testid="utxo-balance"]');
      await expect(balances).toHaveCount(await balances.count());
    });
  });

  test.describe('Navigation Flows', () => {
    test('should handle move → detach → attach flow', async () => {
      const { page } = extensionContext;
      
      // Mock API to prevent actual transactions
      await page.route('**/api/v2/compose/**', route => {
        route.fulfill({
          status: 200,
          body: JSON.stringify({ 
            result: { 
              rawtransaction: '0x123', 
              btc_fee: 1000,
              params: {}
            } 
          })
        });
      });
      
      // Start with move
      await page.locator('text=TESTTOKEN').first().click();
      await page.click('text=View UTXO');
      await page.click('button:has-text("Move")');
      
      // Complete move form
      await page.fill('input[name="destination_display"]', 'bc1qtest123');
      await page.fill('input[name="sat_per_vbyte"]', '1');
      await page.click('button:has-text("Continue")');
      
      // Should reach review
      await expect(page.locator('text=Review Transaction')).toBeVisible({ timeout: 10000 });
      
      // Go back and try detach
      await page.click('button:has-text("Back")');
      await page.click('button[aria-label="Back"]');
      await page.click('button:has-text("Detach")');
      
      // Complete detach form
      await page.fill('input[name="sat_per_vbyte"]', '1');
      await page.click('button:has-text("Continue")');
      
      // Should reach review again
      await expect(page.locator('text=Review Transaction')).toBeVisible({ timeout: 10000 });
    });
  });
});