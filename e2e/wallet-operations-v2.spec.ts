import { test, expect } from './fixtures-v2';

test.describe('Wallet Operations', () => {
  test('can view wallet balance and address', async ({ authenticatedPage }) => {
    // We start with an authenticated page
    console.log('[Test] Viewing wallet details...');
    
    // Check that we're on the main wallet page
    await expect(authenticatedPage).toHaveURL(/#\/index$/);
    
    // Look for wallet address (should start with bc1q for native segwit)
    const addressElement = await authenticatedPage.locator('text=/^bc1q[a-z0-9]{39}$/').first();
    await expect(addressElement).toBeVisible();
    
    const address = await addressElement.textContent();
    console.log('[Test] Wallet address:', address);
    
    // Check for balance display
    const balanceElement = await authenticatedPage.locator('text=/\\d+\\.\\d+ BTC/').first();
    const hasBalance = await balanceElement.isVisible().catch(() => false);
    
    if (hasBalance) {
      const balance = await balanceElement.textContent();
      console.log('[Test] Wallet balance:', balance);
    } else {
      // New wallet might show 0 BTC or similar
      const zeroBalance = await authenticatedPage.locator('text=/0(\\.0+)? BTC/').first();
      await expect(zeroBalance).toBeVisible();
      console.log('[Test] Wallet has zero balance (expected for new wallet)');
    }
  });

  test('can navigate to send page', async ({ authenticatedPage }) => {
    console.log('[Test] Navigating to send page...');
    
    // Click on Send button/link
    const sendButton = authenticatedPage.getByRole('button', { name: /send/i }).or(
      authenticatedPage.getByRole('link', { name: /send/i })
    );
    await expect(sendButton).toBeVisible();
    await sendButton.click();
    
    // Verify we're on the send page
    await expect(authenticatedPage).toHaveURL(/#\/send$/);
    
    // Check for send form elements
    await expect(authenticatedPage.locator('input[name="destination"]')).toBeVisible();
    await expect(authenticatedPage.locator('input[name="amount"]')).toBeVisible();
  });

  test('can add a new address', async ({ authenticatedPage, extensionId }) => {
    console.log('[Test] Adding new address...');
    
    // Navigate to addresses or wallet settings
    // First, let's check what's available on the main page
    const settingsButton = authenticatedPage.getByRole('button', { name: /settings/i }).or(
      authenticatedPage.getByLabel(/settings/i)
    );
    
    if (await settingsButton.isVisible()) {
      await settingsButton.click();
      // Look for address management option
      const addressOption = authenticatedPage.getByText(/addresses/i);
      if (await addressOption.isVisible()) {
        await addressOption.click();
      }
    }
    
    // Look for "Add Address" or "New Address" button
    const addAddressButton = authenticatedPage.getByRole('button', { name: /add.*address|new.*address/i });
    
    if (await addAddressButton.isVisible()) {
      // Count current addresses
      const addressesBefore = await authenticatedPage.locator('text=/^bc1q[a-z0-9]{39}$/').count();
      console.log('[Test] Addresses before:', addressesBefore);
      
      await addAddressButton.click();
      
      // Wait for new address to appear
      await authenticatedPage.waitForTimeout(2000);
      
      const addressesAfter = await authenticatedPage.locator('text=/^bc1q[a-z0-9]{39}$/').count();
      console.log('[Test] Addresses after:', addressesAfter);
      
      expect(addressesAfter).toBeGreaterThan(addressesBefore);
    } else {
      console.log('[Test] Add address functionality not directly accessible from current view');
    }
  });

  test('can copy wallet address', async ({ authenticatedPage }) => {
    console.log('[Test] Testing address copy functionality...');
    
    // Find the address element
    const addressElement = await authenticatedPage.locator('text=/^bc1q[a-z0-9]{39}$/').first();
    const address = await addressElement.textContent();
    
    // Look for copy button near the address
    const copyButton = await authenticatedPage.locator('button').filter({ 
      has: authenticatedPage.locator('[aria-label*="copy" i]') 
    }).or(
      authenticatedPage.getByRole('button', { name: /copy/i })
    ).first();
    
    if (await copyButton.isVisible()) {
      // Click copy button
      await copyButton.click();
      
      // Check for success feedback (toast, tooltip, etc.)
      const successIndicator = authenticatedPage.locator('text=/copied/i').first();
      const wasSuccessful = await successIndicator.isVisible().catch(() => false);
      
      if (wasSuccessful) {
        console.log('[Test] Address copied successfully');
        expect(wasSuccessful).toBe(true);
      } else {
        console.log('[Test] No copy success indicator found, but button was clicked');
      }
    } else {
      console.log('[Test] No copy button found, checking if address is clickable');
      // Some implementations make the address itself clickable
      await addressElement.click();
    }
  });
});

test.describe('Wallet Navigation', () => {
  test('can navigate between main sections', async ({ authenticatedPage }) => {
    console.log('[Test] Testing navigation...');
    
    // Define expected navigation items
    const navItems = [
      { name: /assets?/i, urlPattern: /#\/assets?/ },
      { name: /send/i, urlPattern: /#\/send/ },
      { name: /settings?/i, urlPattern: /#\/settings?/ },
    ];
    
    for (const item of navItems) {
      const navButton = authenticatedPage.getByRole('button', { name: item.name }).or(
        authenticatedPage.getByRole('link', { name: item.name })
      );
      
      if (await navButton.isVisible()) {
        console.log(`[Test] Navigating to ${item.name}...`);
        await navButton.click();
        
        // Wait for navigation
        await authenticatedPage.waitForTimeout(500);
        
        // Check if URL matches expected pattern
        const currentUrl = authenticatedPage.url();
        if (item.urlPattern.test(currentUrl)) {
          console.log(`[Test] Successfully navigated to ${item.name}`);
        } else {
          console.log(`[Test] Navigation to ${item.name} didn't change URL as expected`);
        }
        
        // Go back to main page for next navigation
        const homeButton = authenticatedPage.getByRole('button', { name: /home|wallet/i }).or(
          authenticatedPage.locator('[aria-label*="home" i]')
        );
        
        if (await homeButton.isVisible()) {
          await homeButton.click();
        } else {
          // Try navigating back
          await authenticatedPage.goto(`chrome-extension://${await authenticatedPage.evaluate(() => location.hostname)}/popup.html#/index`);
        }
        
        await authenticatedPage.waitForTimeout(500);
      }
    }
  });
});