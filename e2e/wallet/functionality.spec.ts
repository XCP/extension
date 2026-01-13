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
} from '../helpers/test-helpers';

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
    // Use a more specific selector to avoid matching the AssetIcon placeholder text
    await expect(page.locator('.font-medium.text-sm.text-gray-900:has-text("BTC")')).toBeVisible();
    
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

    // Test Send button navigation
    const sendButton = page.locator('button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();

    // Should navigate to send page
    await page.waitForURL(/send/, { timeout: 5000 });

    // Go back to main page
    await navigateViaFooter(page, 'wallet');
    await page.waitForURL(/index/, { timeout: 5000 });

    // Test Receive button navigation
    const receiveButton = page.locator('button:has-text("Receive")').first();
    await expect(receiveButton).toBeVisible({ timeout: 5000 });
    await receiveButton.click();

    // Should navigate to receive page
    await page.waitForURL(/receive/, { timeout: 5000 });

    // Should show QR code or address
    const qrOrAddress = page.locator('canvas, .font-mono').first();
    await expect(qrOrAddress).toBeVisible({ timeout: 5000 });

    // Navigate back via footer
    await navigateViaFooter(page, 'wallet');
    await page.waitForURL(/index/, { timeout: 5000 });

    // Test footer navigation to other sections
    await navigateViaFooter(page, 'settings');
    await page.waitForURL(/settings/, { timeout: 5000 });

    await cleanup(context);
  });

  test('address management functionality', async () => {
    const { context, page } = await launchExtension('address-mgmt-func');
    await setupWallet(page);

    // Navigate to address management via the chevron
    const addressSection = page.locator('[aria-label="Current address"]');
    await expect(addressSection).toBeVisible({ timeout: 5000 });
    const chevron = addressSection.locator('svg').last();
    await expect(chevron).toBeVisible({ timeout: 5000 });
    await chevron.click();

    // Should navigate to address selection page
    await page.waitForURL(/select-address/, { timeout: 5000 });

    // Should show address list with at least Address 1
    await expect(page.getByText('Address 1')).toBeVisible({ timeout: 5000 });

    // Add new address
    const initialCount = await page.locator('[role="radio"]').count();
    await addAddress(page);

    // Verify new address was added
    const newCount = await page.locator('[role="radio"]').count();
    expect(newCount).toBeGreaterThan(initialCount);

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
    await page.waitForURL(/settings/, { timeout: 5000 });

    // Should show key settings options
    await expect(page.getByText('General')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Advanced')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('About')).toBeVisible({ timeout: 5000 });

    // Test navigation to Advanced settings
    await page.getByText('Advanced').click();
    await page.waitForURL(/advanced/, { timeout: 5000 });

    // Should show auto-lock settings
    await expect(page.locator('text=/Auto-Lock.*Timer/i').first()).toBeVisible({ timeout: 5000 });

    await cleanup(context);
  });

  test('transaction history access', async () => {
    const { context, page } = await launchExtension('transaction-history');
    await setupWallet(page);

    // Click on History button
    const historyButton = page.getByText('History');
    await expect(historyButton).toBeVisible({ timeout: 5000 });
    await historyButton.click();

    // Should navigate to history page
    await page.waitForURL(/history/, { timeout: 5000 });

    // Should show transaction history interface (may be empty for new wallet)
    const historyInterface = page.locator('text=/Transaction|History|Empty|No transactions/').first();
    await expect(historyInterface).toBeVisible({ timeout: 5000 });

    await cleanup(context);
  });

  test('wallet information display', async () => {
    const { context, page } = await launchExtension('wallet-info');
    await setupWallet(page);

    // Check that essential wallet info is displayed
    const currentAddress = await getCurrentAddress(page);
    expect(currentAddress).toBeTruthy();
    expect(currentAddress).not.toBe('');

    // Should show balance information (BTC label)
    const balanceInfo = page.locator('text=/BTC|Balance|₿/').first();
    await expect(balanceInfo).toBeVisible({ timeout: 5000 });

    // Verify address display element exists
    await expect(page.locator('.font-mono').first()).toBeVisible({ timeout: 5000 });

    await cleanup(context);
  });

  test('wallet state persistence across sessions', async () => {
    const { context, page } = await launchExtension('wallet-persistence');
    await setupWallet(page);

    // Get initial address
    const initialAddress = await getCurrentAddress(page);
    expect(initialAddress).toBeTruthy();

    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // After reload, should either stay on index (unlocked) or go to unlock
    const url = page.url();
    const needsUnlock = url.includes('unlock');

    if (needsUnlock) {
      // Unlock and verify state restored
      await unlockWallet(page, TEST_PASSWORD);
      await page.waitForURL(/index/, { timeout: 5000 });
    }

    // Verify wallet state is restored - address should be available
    const restoredAddress = await getCurrentAddress(page);
    expect(restoredAddress).toBeTruthy();

    await cleanup(context);
  });

  test('wallet error recovery', async () => {
    const { context, page } = await launchExtension('wallet-error-recovery');
    await setupWallet(page);

    // Simulate error by navigating to invalid route
    const extensionId = page.url().split('/')[2];
    await page.goto(`chrome-extension://${extensionId}/popup.html#/invalid-route`);

    // Wait for redirect or error page to load
    await page.waitForLoadState('domcontentloaded');

    // Should handle gracefully - either redirect to valid page or show error
    const hasError = await page.locator('text=/Error|Not Found|404/i').isVisible().catch(() => false);
    const redirectedToValid = page.url().includes('index') || page.url().includes('unlock');

    expect(hasError || redirectedToValid).toBe(true);

    // Navigate back to main wallet and verify it works
    await navigateViaFooter(page, 'wallet');
    await page.waitForURL(/index/, { timeout: 5000 });
    await expect(page.getByRole('button', { name: 'View Assets' })).toBeVisible({ timeout: 5000 });

    await cleanup(context);
  });
});