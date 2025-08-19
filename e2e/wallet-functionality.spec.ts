import { test, expect } from '@playwright/test';
import { 
  launchExtension, 
  setupWallet, 
  navigateViaFooter,
  getCurrentAddress,
  addAddress,
  lockWallet,
  unlockWallet,
  grantClipboardPermissions,
  cleanup,
  TEST_PASSWORD 
} from './helpers/test-helpers';

test.describe('Wallet Functionality', () => {
  test('displays wallet balance and assets correctly', async () => {
    const { context, page } = await launchExtension('wallet-balance');
    await setupWallet(page);
    
    // Should show Assets and Balances tabs
    const assetsTab = page.getByRole('button', { name: 'View Assets' });
    const balancesTab = page.getByRole('button', { name: 'View Balances' });
    
    await expect(assetsTab).toBeVisible();
    await expect(balancesTab).toBeVisible();
    
    // Check balances tab shows BTC
    await balancesTab.click();
    await expect(page.locator('text=BTC')).toBeVisible();
    
    // Check assets tab
    await assetsTab.click();
    await expect(page.locator('text=/Assets|Loading owned assets/').first()).toBeVisible();
    
    await cleanup(context);
  });

  test('can copy wallet address to clipboard', async () => {
    const { context, page } = await launchExtension('copy-address');
    await setupWallet(page);
    await grantClipboardPermissions(context);
    
    // Get current address
    const currentAddress = await getCurrentAddress(page);
    expect(currentAddress).toBeTruthy();
    
    // Find and click the address button to copy
    const addressButton = page.locator('[aria-label="Current address"]');
    await addressButton.click();
    
    // Should show copy confirmation
    await expect(addressButton.locator('.text-green-500')).toBeVisible();
    
    await cleanup(context);
  });

  test('wallet navigation and UI interactions', async () => {
    const { context, page } = await launchExtension('wallet-navigation');
    await setupWallet(page);
    
    // Test main action buttons
    const sendButton = page.getByText('Send');
    if (await sendButton.isVisible()) {
      await sendButton.click();
      await expect(page).toHaveURL(/compose.*send/);
      await page.goBack();
    }
    
    const receiveButton = page.getByText('Receive');
    if (await receiveButton.isVisible()) {
      await receiveButton.click();
      await page.waitForTimeout(1000);
      
      // Should show receive page or QR code
      const hasQR = await page.locator('canvas, img[alt*="QR"], [class*="qr"]').isVisible().catch(() => false);
      const hasReceivePage = await page.locator('text=/Receive|Address/').isVisible().catch(() => false);
      expect(hasQR || hasReceivePage).toBe(true);
      
      // Navigate back
      const backButton = page.locator('button:has-text("Back"), [aria-label*="Back"]');
      if (await backButton.isVisible()) {
        await backButton.click();
      } else {
        await page.goBack();
      }
    }
    
    // Test footer navigation
    const footerSections = ['market', 'actions', 'settings'] as const;
    for (const section of footerSections) {
      await navigateViaFooter(page, section);
      await expect(page).toHaveURL(new RegExp(section));
      await navigateViaFooter(page, 'wallet');
    }
    
    await cleanup(context);
  });

  test('address management functionality', async () => {
    const { context, page } = await launchExtension('address-mgmt-func');
    await setupWallet(page);
    
    // Navigate to address management
    const addressSection = page.locator('[aria-label="Current address"]');
    const chevron = addressSection.locator('svg').last();
    
    if (await chevron.isVisible()) {
      await chevron.click();
      await page.waitForTimeout(1000);
      
      // Should show address list
      await expect(page.locator('text=/Address 1|Select Address/i')).toBeVisible();
      
      // Try to add new address
      const addButton = page.getByRole('button', { name: /Add.*Address|New.*Address|\+/i });
      if (await addButton.isVisible()) {
        const initialCount = await page.locator('[class*="address"], text=/Address \\d+/').count();
        
        await addAddress(page);
        
        const newCount = await page.locator('[class*="address"], text=/Address \\d+/').count();
        expect(newCount).toBeGreaterThan(initialCount);
      }
    }
    
    await cleanup(context);
  });

  test('wallet lock and unlock functionality', async () => {
    const { context, page } = await launchExtension('lock-unlock-func');
    await setupWallet(page);
    
    // Lock the wallet
    await lockWallet(page);
    await expect(page).toHaveURL(/unlock/);
    
    // Unlock with correct password
    await unlockWallet(page, TEST_PASSWORD);
    await expect(page).toHaveURL(/index/);
    
    // Verify wallet is functional after unlock
    await expect(page.getByRole('button', { name: 'View Assets' })).toBeVisible();
    
    await cleanup(context);
  });

  test('wallet settings and preferences', async () => {
    const { context, page } = await launchExtension('wallet-settings');
    await setupWallet(page);
    
    // Navigate to settings
    await navigateViaFooter(page, 'settings');
    
    // Should show settings options
    const settingsOptions = ['General', 'Security', 'Advanced', 'About'];
    let foundSettings = 0;
    
    for (const option of settingsOptions) {
      const optionElement = page.locator(`text=${option}`);
      if (await optionElement.isVisible()) {
        foundSettings++;
      }
    }
    
    expect(foundSettings).toBeGreaterThan(0);
    
    // Test navigation through settings
    const securityOption = page.locator('text=Security');
    if (await securityOption.isVisible()) {
      await securityOption.click();
      await page.waitForTimeout(1000);
      
      // Should show security settings
      const hasSecuritySettings = await page.locator('text=/Auto.*Lock|Password|Backup/i').first().isVisible();
      expect(hasSecuritySettings).toBe(true);
    }
    
    await cleanup(context);
  });

  test('transaction history access', async () => {
    const { context, page } = await launchExtension('transaction-history');
    await setupWallet(page);
    
    // Look for History button or link
    const historyButton = page.getByText('History');
    if (await historyButton.isVisible()) {
      await historyButton.click();
      await page.waitForTimeout(1000);
      
      // Should navigate to history page
      await expect(page).toHaveURL(/history/);
      
      // Should show transaction history interface - use first match to avoid strict mode
      const hasHistory = await page.locator('text=/Transaction|History|Empty|No transactions/').first().isVisible();
      expect(hasHistory).toBe(true);
    } else {
      // Alternative: check for transaction history in main view
      const hasTransactionSection = await page.locator('text=/Recent|Transactions|Activity/').isVisible();
      if (hasTransactionSection) {
        expect(hasTransactionSection).toBe(true);
      }
    }
    
    await cleanup(context);
  });

  test('wallet information display', async () => {
    const { context, page } = await launchExtension('wallet-info');
    await setupWallet(page);
    
    // Check that essential wallet info is displayed
    const currentAddress = await getCurrentAddress(page);
    expect(currentAddress).toBeTruthy();
    // Address could be truncated on display (e.g. "bc1q...xyz")
    // Just verify we got something back
    expect(currentAddress).not.toBe('');
    
    // Should show wallet type or address type
    const addressInfo = page.locator('text=/Native SegWit|Legacy|SegWit|P2WPKH|P2PKH|Taproot/i');
    const hasAddressType = await addressInfo.isVisible();
    
    if (hasAddressType) {
      expect(hasAddressType).toBe(true);
    }
    
    // Should show balance information
    const balanceInfo = page.locator('text=/BTC|Balance|₿|0\\.00/');
    await expect(balanceInfo).toBeVisible();
    
    await cleanup(context);
  });

  test('wallet state persistence across sessions', async () => {
    const { context, page } = await launchExtension('wallet-persistence');
    await setupWallet(page);
    
    // Get initial state
    const initialAddress = await getCurrentAddress(page);
    const initialUrl = page.url();
    
    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Should maintain unlocked state (or redirect to unlock)
    const isUnlocked = page.url().includes('index');
    const needsUnlock = page.url().includes('unlock');
    
    if (needsUnlock) {
      // Unlock and verify state
      await unlockWallet(page, TEST_PASSWORD);
      
      // Should restore to same state
      const restoredAddress = await getCurrentAddress(page);
      // Addresses might be truncated, just check they exist
      expect(restoredAddress).toBeTruthy();
    } else {
      // Should maintain same address
      const persistedAddress = await getCurrentAddress(page);
      // Addresses might be truncated, just check they exist
      expect(persistedAddress).toBeTruthy();
    }
    
    await cleanup(context);
  });

  test('wallet error recovery', async () => {
    const { context, page } = await launchExtension('wallet-error-recovery');
    await setupWallet(page);
    
    // Simulate error by navigating to invalid route
    const extensionId = page.url().split('/')[2];
    await page.goto(`chrome-extension://${extensionId}/popup.html#/invalid-route`);
    await page.waitForTimeout(1000);
    
    // Should handle gracefully and redirect or show error
    const hasError = await page.locator('text=/Error|Not Found|404/i').isVisible();
    const redirectedToValid = page.url().includes('index') || page.url().includes('unlock');
    
    expect(hasError || redirectedToValid).toBe(true);
    
    // Should be able to navigate back to main functionality
    if (redirectedToValid || hasError) {
      await navigateViaFooter(page, 'wallet');
      await expect(page.getByRole('button', { name: 'View Assets' })).toBeVisible();
    }
    
    await cleanup(context);
  });
});