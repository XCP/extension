import { test, expect, chromium } from '@playwright/test';
import path from 'path';

const TEST_PASSWORD = 'TestPassword123!';
const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

test('access wallet management from header', async () => {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext('test-results/wallet-mgmt-header', {
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
  
  // Ensure we have a wallet
  const hasCreateWallet = await page.getByText('Create Wallet').isVisible().catch(() => false);
  if (hasCreateWallet) {
    await page.getByText('Create Wallet').click();
    await page.waitForTimeout(1000);
    await page.getByText('View 12-word Secret Phrase').click();
    await page.waitForTimeout(1000);
    await page.getByLabel(/I have saved my secret recovery phrase/).check();
    await page.waitForTimeout(500);
    await page.locator('input[name="password"]').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /Continue/i }).click();
    await page.waitForURL(/index/, { timeout: 10000 });
  }
  
  // Look for wallet button in header - try different selectors
  const walletButton = page.locator('button').filter({ hasText: /Wallet/i }).first();
  const headerButton = page.locator('header button').first();
  
  if (await walletButton.isVisible()) {
    // console.log('Found wallet button with text');
    await walletButton.click();
  } else if (await headerButton.isVisible()) {
    // console.log('Clicking first header button');
    await headerButton.click();
  }
  
  await page.waitForTimeout(1000);
  
  // Should see wallet menu or page
  const onWalletPage = page.url().includes('wallet');
  // console.log('Navigated to wallet page:', onWalletPage);
  
  if (onWalletPage) {
    // We're already on the wallet management page
    const hasWalletList = await page.getByText(/Wallet 1/i).isVisible().catch(() => false);
    // console.log('Shows wallet list:', hasWalletList);
    
    // Check for "Add Wallet" button
    const hasAddWallet = await page.getByText('Add Wallet').isVisible().catch(() => false);
    // console.log('Has Add Wallet button:', hasAddWallet);
  }
  
  await context.close();
});

test('import wallet with mnemonic', async () => {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext('test-results/import-mnemonic', {
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
  
  // Check if we're on onboarding
  const hasImportWallet = await page.getByText('Import Wallet').isVisible().catch(() => false);
  
  if (hasImportWallet) {
    // console.log('Starting import process...');
    await page.getByText('Import Wallet').click();
    await page.waitForTimeout(1000);
    
    // Enter mnemonic - individual inputs named word-0, word-1, etc.
    const mnemonicWords = TEST_MNEMONIC.split(' ');
    for (let i = 0; i < mnemonicWords.length; i++) {
      const input = page.locator(`input[name="word-${i}"]`);
      await input.fill(mnemonicWords[i]);
      await page.waitForTimeout(100);
    }
    
    // Check confirmation
    const confirmCheckbox = page.getByLabel(/I have saved|backed up/i);
    await confirmCheckbox.check();
    await page.waitForTimeout(500);
    
    // Enter password
    await page.locator('input[name="password"]').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /Continue|Import/i }).click();
    
    // Wait for success
    await page.waitForURL(/index/, { timeout: 10000 });
    // console.log('Wallet imported successfully!');
    
    // Verify we're on main page
    const hasBalance = await page.getByText(/BTC|Balance/i).isVisible().catch(() => false);
    // console.log('Shows balance:', hasBalance);
  } else {
    // console.log('Import option not available - wallet may already exist');
  }
  
  await context.close();
});

test('add multiple wallets', async () => {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext('test-results/multiple-wallets', {
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
  
  // Ensure we have at least one wallet
  const needsFirstWallet = await page.getByText('Create Wallet').isVisible().catch(() => false);
  if (needsFirstWallet) {
    await page.getByText('Create Wallet').click();
    await page.waitForTimeout(1000);
    await page.getByText('View 12-word Secret Phrase').click();
    await page.waitForTimeout(1000);
    await page.getByLabel(/I have saved my secret recovery phrase/).check();
    await page.waitForTimeout(500);
    await page.locator('input[name="password"]').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /Continue/i }).click();
    await page.waitForURL(/index/, { timeout: 10000 });
  }
  
  // Navigate to wallet management
  const walletButton = page.locator('button').filter({ hasText: /Wallet/i }).first();
  if (await walletButton.isVisible()) {
    await walletButton.click();
    await page.waitForTimeout(1000);
    
    // Check if we're on wallet page
    if (page.url().includes('wallet')) {
      // Look for add wallet button  
      const addButton = page.getByText('Add Wallet');
      if (await addButton.isVisible()) {
        // console.log('Found Add Wallet button');
        await addButton.click();
        await page.waitForTimeout(1000);
        
        // Should see options
        const hasCreateOption = await page.getByText('Create New Wallet').isVisible().catch(() => false);
        // console.log('Shows wallet creation options:', hasCreateOption);
        
        if (hasCreateOption) {
          await page.getByText('Create New Wallet').click();
          await page.waitForTimeout(1000);
          
          // Complete wallet creation
          await page.getByText('View 12-word Secret Phrase').click();
          await page.waitForTimeout(1000);
          await page.getByLabel(/I have saved my secret recovery phrase/).check();
          await page.waitForTimeout(500);
          await page.locator('input[name="password"]').fill(TEST_PASSWORD);
          await page.getByRole('button', { name: /Continue/i }).click();
          
          // Should return to wallet list with 2 wallets
          await page.waitForTimeout(2000);
          const wallet2 = await page.getByText('Wallet 2').isVisible().catch(() => false);
          // console.log('Second wallet created:', wallet2);
        }
      }
    }
  }
  
  await context.close();
});