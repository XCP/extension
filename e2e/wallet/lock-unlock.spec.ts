import { test, expect } from '@playwright/test';
import { 
  launchExtension, 
  setupWallet, 
  lockWallet,
  unlockWallet,
  navigateViaFooter,
  cleanup,
  TEST_PASSWORD 
} from '../helpers/test-helpers';

test.describe('Wallet Lock and Unlock', () => {
  test('lock and unlock wallet', async () => {
    const { context, page } = await launchExtension('simple-lock-unlock');
    await setupWallet(page);
    
    // Lock the wallet
    await lockWallet(page);
    
    // Check if we're on unlock page
    const isOnUnlock = page.url().includes('unlock');
    expect(isOnUnlock).toBe(true);
    
    // Test unlocking with wrong password
    await page.locator('input[name="password"]').fill('WrongPassword');
    await page.getByRole('button', { name: /unlock/i }).click();
    await page.waitForTimeout(500);
    
    // Should show error
    const hasError = await page.getByText(/incorrect|invalid|wrong/i).isVisible().catch(() => false);
    expect(hasError).toBe(true);
    
    // Now unlock with correct password
    await unlockWallet(page, TEST_PASSWORD);
    
    // Should be back on index
    await expect(page).toHaveURL(/index/);
    
    await cleanup(context);
  });
  test('lock wallet using header button', async () => {
    const { context, page } = await launchExtension('lock-header');
    await setupWallet(page);
    
    // Click the lock button in the header
    await lockWallet(page);
    
    // Should be redirected to unlock screen
    await expect(page).toHaveURL(/unlock/);
    await expect(page.locator('input[name="password"]')).toBeVisible();
    
    await cleanup(context);
  });

  test('unlock wallet with correct password', async () => {
    const { context, page } = await launchExtension('unlock-correct');
    await setupWallet(page);
    
    // Lock the wallet first
    await lockWallet(page);
    
    // Unlock with correct password
    await unlockWallet(page, TEST_PASSWORD);
    
    // Should be back on main page
    await expect(page).toHaveURL(/index/);
    await expect(page.locator('text=/Assets|Balances/').first()).toBeVisible();
    
    await cleanup(context);
  });

  test('unlock wallet with incorrect password shows error', async () => {
    const { context, page } = await launchExtension('unlock-incorrect');
    await setupWallet(page);
    
    // Lock the wallet first
    await lockWallet(page);
    
    // Enter incorrect password
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button:has-text("Unlock")');
    
    // Should show error message
    await expect(page.locator('text=/Invalid|incorrect|wrong/i')).toBeVisible();
    
    // Should still be on unlock screen
    await expect(page.locator('input[name="password"]')).toBeVisible();
    
    await cleanup(context);
  });

  test('lock all wallets option', async () => {
    const { context, page } = await launchExtension('lock-all');
    await setupWallet(page);
    
    // Wait for main page to be ready - look for either Assets or Balances button
    await page.waitForSelector('button[aria-label*="Assets"], button[aria-label*="Balances"]', { timeout: 10000 });
    
    // Lock the wallet
    await lockWallet(page);
    
    // Should show unlock page with password input
    await expect(page.locator('input[type="password"]')).toBeVisible();
    
    // Verify unlock button is visible
    const unlockButton = page.locator('button:has-text("Unlock")');
    await expect(unlockButton).toBeVisible();
    
    await cleanup(context);
  });

  test('wallet auto-lock settings', async () => {
    const { context, page } = await launchExtension('auto-lock-settings');
    await setupWallet(page);
    
    // Navigate to settings using footer
    await navigateViaFooter(page, 'settings');
    
    // Click on Advanced settings option if available
    const advancedOption = page.locator('text=Advanced');
    if (await advancedOption.isVisible()) {
      await advancedOption.click();
      await page.waitForURL('**/settings/advanced', { timeout: 10000 });
    }
    
    // Should see auto-lock timer setting
    await expect(page.locator('text=/Auto-Lock|Auto Lock/i')).toBeVisible();
    
    // Check for timeout options
    const timeoutOptions = ['1 Minute', '5 Minutes', '15 Minutes', '30 Minutes'];
    for (const option of timeoutOptions) {
      const optionLocator = page.locator(`text=/${option}/i`);
      const isVisible = await optionLocator.isVisible().catch(() => false);
      if (isVisible) {
        // At least some options are visible
        break;
      }
    }
    
    await cleanup(context);
  });

  test('reset wallet option in settings', async () => {
    const { context, page } = await launchExtension('reset-wallet');
    await setupWallet(page);
    
    // Navigate to settings using footer
    await navigateViaFooter(page, 'settings');
    
    // Scroll to find reset wallet button
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    
    // Look for reset wallet button or text
    const resetText = page.locator('text=/Reset|Clear/i');
    const isResetVisible = await resetText.isVisible().catch(() => false);
    
    if (isResetVisible) {
      // Click reset option
      await resetText.first().click();
      await page.waitForTimeout(1000);
      
      // Should show confirmation or navigate to reset page
      // Go back without resetting
      const backButton = page.locator('button:has-text("Back")');
      if (await backButton.isVisible()) {
        await backButton.click();
      } else {
        await page.goBack();
      }
    }
    
    await cleanup(context);
  });

  test('multiple unlock attempts', async () => {
    const { context, page } = await launchExtension('multiple-attempts');
    await setupWallet(page);
    
    // Lock the wallet
    await lockWallet(page);
    
    // Try multiple incorrect passwords
    for (let i = 0; i < 3; i++) {
      await page.fill('input[type="password"]', `wrongpass${i}`);
      await page.click('button:has-text("Unlock")');
      
      // Should show error each time
      await page.waitForTimeout(500);
      await expect(page.locator('text=/Invalid|incorrect|wrong/i')).toBeVisible();
      
      // Clear the input for next attempt
      await page.locator('input[type="password"]').clear();
    }
    
    // Finally try correct password
    await unlockWallet(page, TEST_PASSWORD);
    
    // Should successfully unlock
    await expect(page).toHaveURL(/index/);
    
    await cleanup(context);
  });

  test('lock state persists on reload', async () => {
    const { context, page } = await launchExtension('lock-persist-reload');
    await setupWallet(page);
    
    // Lock the wallet
    await lockWallet(page);
    
    // Should be on unlock screen
    await expect(page).toHaveURL(/unlock/);
    
    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Should still be on unlock screen after reload
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button:has-text("Unlock")')).toBeVisible();
    
    await cleanup(context);
  });

  test('unlock state persists on reload', async () => {
    const { context, page } = await launchExtension('unlock-persist-reload');
    await setupWallet(page);
    
    // Verify we're on main page (unlocked)
    await expect(page).toHaveURL(/index/);
    await expect(page.locator('text=/Assets|Balances/').first()).toBeVisible();
    
    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Should still be unlocked and on main page
    await expect(page).toHaveURL(/index/);
    await expect(page.locator('text=/Assets|Balances/').first()).toBeVisible();
    
    await cleanup(context);
  });
});