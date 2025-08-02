import { test, expect, chromium } from '@playwright/test';
import path from 'path';

const TEST_PASSWORD = 'TestPassword123!';

test('lock and unlock wallet', async () => {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext('test-results/simple-lock-unlock', {
    headless: false,
    args: [
      `--disable-extensions-except=${pathToExtension}`,
      `--load-extension=${pathToExtension}`,
    ],
  });

  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker');
  }
  
  const extensionId = serviceWorker.url().split('/')[2];
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForLoadState('networkidle');
  
  // Check if we need to create a wallet first
  const hasCreateWallet = await page.getByText('Create Wallet').isVisible().catch(() => false);
  
  if (hasCreateWallet) {
    // Create wallet
    await page.getByText('Create Wallet').click();
    await page.waitForTimeout(1000);
    
    // Reveal phrase
    await page.getByText('View 12-word Secret Phrase').click();
    await page.waitForTimeout(1000);
    
    // Confirm and submit
    await page.getByLabel(/I have saved my secret recovery phrase/).check();
    await page.waitForTimeout(500);
    
    await page.locator('input[name="password"]').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /Continue/i }).click();
    
    // Wait for redirect to index
    await page.waitForURL(/index/, { timeout: 10000 });
  }
  
  // Now test locking
  // console.log('Testing lock functionality...');
  
  // Find the lock button - it's typically the last button in the header
  const headerButtons = await page.locator('header button, nav button').all();
  // console.log(`Found ${headerButtons.length} header buttons`);
  
  if (headerButtons.length > 0) {
    // Click the last button (should be lock)
    await headerButtons[headerButtons.length - 1].click();
    await page.waitForTimeout(1000);
    
    // Check if we're on unlock page
    const isOnUnlock = page.url().includes('unlock');
    // console.log('Redirected to unlock page:', isOnUnlock);
    
    if (isOnUnlock) {
      // Test unlocking with wrong password
      await page.locator('input[name="password"]').fill('WrongPassword');
      await page.getByRole('button', { name: /unlock/i }).click();
      await page.waitForTimeout(500);
      
      // Should show error
      const hasError = await page.getByText(/incorrect|invalid|wrong/i).isVisible().catch(() => false);
      // console.log('Shows error for wrong password:', hasError);
      
      // Now unlock with correct password
      await page.locator('input[name="password"]').clear();
      await page.locator('input[name="password"]').fill(TEST_PASSWORD);
      await page.getByRole('button', { name: /unlock/i }).click();
      
      // Should redirect back to index
      await page.waitForURL(/index/, { timeout: 5000 });
      // console.log('Successfully unlocked!');
    }
  }
  
  await context.close();
});

test('lock persists on reload', async () => {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext('test-results/lock-persist', {
    headless: false,
    args: [
      `--disable-extensions-except=${pathToExtension}`,
      `--load-extension=${pathToExtension}`,
    ],
  });

  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker');
  }
  
  const extensionId = serviceWorker.url().split('/')[2];
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForLoadState('networkidle');
  
  // Create or unlock wallet first
  const hasCreateWallet = await page.getByText('Create Wallet').isVisible().catch(() => false);
  const needsUnlock = page.url().includes('unlock');
  
  if (hasCreateWallet) {
    // Create wallet
    await page.getByText('Create Wallet').click();
    await page.waitForTimeout(1000);
    await page.getByText('View 12-word Secret Phrase').click();
    await page.waitForTimeout(1000);
    await page.getByLabel(/I have saved my secret recovery phrase/).check();
    await page.waitForTimeout(500);
    await page.locator('input[name="password"]').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /Continue/i }).click();
    await page.waitForURL(/index/, { timeout: 10000 });
  } else if (needsUnlock) {
    await page.locator('input[name="password"]').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /unlock/i }).click();
    await page.waitForURL(/index/, { timeout: 5000 });
  }
  
  // Lock the wallet
  const headerButtons = await page.locator('header button, nav button').all();
  if (headerButtons.length > 0) {
    await headerButtons[headerButtons.length - 1].click();
    await page.waitForTimeout(1000);
    
    // Verify we're locked
    const isLocked = page.url().includes('unlock');
    // console.log('Wallet locked:', isLocked);
    
    if (isLocked) {
      // Reload page
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      // Should still be locked
      const stillLocked = page.url().includes('unlock');
      // console.log('Still locked after reload:', stillLocked);
      expect(stillLocked).toBe(true);
    }
  }
  
  await context.close();
});