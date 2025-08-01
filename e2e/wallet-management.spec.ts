import { test, expect, type Page, chromium } from '@playwright/test';
import path from 'path';

// Test wallets data
const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const TEST_PASSWORD = 'test123456';
const TEST_PRIVATE_KEY = '5KYZdUEo39z3FPrtuX2QbbwGnNP5zTd7yyr2SC1j299sBCnWjss'; // Well-known test private key

async function setupExtension() {
  const extensionPath = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext('test-results/wallet-management', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ],
  });

  // Wait for extension to load
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker');
  }

  const extensionId = serviceWorker.url().split('/')[2];
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForLoadState('networkidle');
  
  return { page, context };
}

test.describe('Wallet Management Features', () => {
  let page: Page;
  let context: any;

  test.beforeEach(async () => {
    const setup = await setupExtension();
    page = setup.page;
    context = setup.context;
  });

  test.afterEach(async () => {
    await context?.close();
  });

  test('create initial wallet and access wallet management', async () => {
    // Check if we're on onboarding
    const onboardingVisible = await page.locator('text=/Create New Wallet|Import Wallet/').isVisible();
    
    if (onboardingVisible) {
      // Create initial wallet
      await page.click('text=Create New Wallet');
      await page.waitForSelector('text=Recovery Phrase');
      
      // Check the backup checkbox
      await page.click('text=I have backed up my recovery phrase');
      await page.waitForSelector('input[type="password"]');
      
      // Set password
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button:has-text("Continue")');
      
      // Wait for main page
      await page.waitForSelector('text=/Assets|Balances/');
    }
    
    // Click wallet button in header
    const walletButton = page.locator('button[aria-label="Wallet options"]');
    await expect(walletButton).toBeVisible();
    await walletButton.click();
    
    // Verify wallet menu appears
    await expect(page.locator('text=Manage Wallets')).toBeVisible();
  });

  test('add new wallet to keychain', async () => {
    // Navigate to wallet management
    await page.click('button[aria-label="Wallet options"]');
    await page.click('text=Manage Wallets');
    
    // Click add wallet button
    await page.click('button[aria-label="Add Wallet"]');
    
    // Should see options: Create New Wallet, Import Wallet, Import Private Key
    await expect(page.locator('text=Create New Wallet')).toBeVisible();
    await expect(page.locator('text=Import Wallet')).toBeVisible();
    await expect(page.locator('text=Import Private Key')).toBeVisible();
    
    // Test creating new wallet
    await page.click('text=Create New Wallet');
    await page.waitForSelector('text=Recovery Phrase');
    
    // Save the mnemonic for verification
    const mnemonicWords = await page.locator('.font-mono').allTextContents();
    const mnemonic = mnemonicWords.join(' ');
    console.log('Generated mnemonic:', mnemonic);
    
    // Complete wallet creation
    await page.click('text=I have backed up my recovery phrase');
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Continue")');
    
    // Should return to wallet list
    await page.waitForSelector('text=Wallet 2');
    await expect(page.locator('text=Wallet 2')).toBeVisible();
  });

  test('import wallet with mnemonic', async () => {
    // Navigate to add wallet
    await page.click('button[aria-label="Wallet options"]');
    await page.click('text=Manage Wallets');
    await page.click('button[aria-label="Add Wallet"]');
    
    // Choose import wallet
    await page.click('text=Import Wallet');
    
    // Enter test mnemonic
    await page.fill('textarea[placeholder*="recovery phrase"]', TEST_MNEMONIC);
    
    // Check backup confirmation
    await page.click('text=I have backed up this recovery phrase');
    
    // Enter password
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Continue")');
    
    // Verify wallet was imported
    await page.waitForSelector('text=/Wallet \\d+/');
  });

  test('import private key', async () => {
    // Navigate to add wallet
    await page.click('button[aria-label="Wallet options"]');
    await page.click('text=Manage Wallets');
    await page.click('button[aria-label="Add Wallet"]');
    
    // Choose import private key
    await page.click('text=Import Private Key');
    
    // Enter test private key
    await page.fill('input[placeholder="Enter private key"]', TEST_PRIVATE_KEY);
    
    // Check backup confirmation
    await page.click('text=I have backed up this private key');
    
    // Enter password
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Continue")');
    
    // Verify key was imported
    await page.waitForSelector('text=/Private Key \\d+|Wallet \\d+/');
  });

  test('switch between wallets', async () => {
    // First create multiple wallets if needed
    await page.click('button[aria-label="Wallet options"]');
    await page.click('text=Manage Wallets');
    
    // Get current wallet count
    const walletCards = await page.locator('[role="button"][aria-label*="Select wallet"]').count();
    
    if (walletCards < 2) {
      // Add another wallet
      await page.click('button[aria-label="Add Wallet"]');
      await page.click('text=Create New Wallet');
      await page.waitForSelector('text=Recovery Phrase');
      await page.click('text=I have backed up my recovery phrase');
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button:has-text("Continue")');
    }
    
    // Now test switching
    const firstWallet = page.locator('[role="button"][aria-label*="Select wallet"]').first();
    const firstWalletName = await firstWallet.locator('.font-medium').textContent();
    
    // Click on second wallet
    const secondWallet = page.locator('[role="button"][aria-label*="Select wallet"]').nth(1);
    const secondWalletName = await secondWallet.locator('.font-medium').textContent();
    
    await secondWallet.click();
    
    // Verify we're on the main page with the new wallet
    await page.waitForSelector('button[aria-label="Wallet options"]');
    
    // Check that wallet switched by clicking wallet button again
    await page.click('button[aria-label="Wallet options"]');
    await page.click('text=Manage Wallets');
    
    // The active wallet should have a different style
    const activeWallet = page.locator('.bg-blue-600');
    const activeWalletName = await activeWallet.locator('.font-medium').textContent();
    expect(activeWalletName).toBe(secondWalletName);
  });

  test('show wallet passphrase', async () => {
    // Navigate to wallet management
    await page.click('button[aria-label="Wallet options"]');
    await page.click('text=Manage Wallets');
    
    // Click menu on first wallet
    const firstWalletMenu = page.locator('button[aria-label="Wallet options"]').first();
    await firstWalletMenu.click();
    
    // Click show passphrase
    await page.click('text=Show Passphrase');
    
    // Enter password
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Show")');
    
    // Verify passphrase is shown
    await expect(page.locator('.font-mono').first()).toBeVisible();
    
    // Copy passphrase button should be visible
    await expect(page.locator('button:has-text("Copy")')).toBeVisible();
  });

  test('remove wallet from keychain', async () => {
    // First ensure we have at least 2 wallets
    await page.click('button[aria-label="Wallet options"]');
    await page.click('text=Manage Wallets');
    
    const walletCount = await page.locator('[role="button"][aria-label*="Select wallet"]').count();
    
    if (walletCount < 2) {
      // Add a wallet to remove
      await page.click('button[aria-label="Add Wallet"]');
      await page.click('text=Import Private Key');
      await page.fill('input[placeholder="Enter private key"]', TEST_PRIVATE_KEY);
      await page.click('text=I have backed up this private key');
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button:has-text("Continue")');
      await page.waitForSelector('text=/Private Key|Wallet \\d+/');
    }
    
    // Get wallet count before removal
    const walletsBefore = await page.locator('[role="button"][aria-label*="Select wallet"]').count();
    
    // Click menu on last wallet
    const lastWalletMenu = page.locator('button[aria-label="Wallet options"]').last();
    await lastWalletMenu.click();
    
    // Click remove wallet
    await page.click('text=Remove Wallet');
    
    // Confirm removal
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Remove")');
    
    // Verify wallet was removed
    await page.waitForTimeout(1000); // Wait for removal to complete
    const walletsAfter = await page.locator('[role="button"][aria-label*="Select wallet"]').count();
    expect(walletsAfter).toBe(walletsBefore - 1);
  });

  test('rename wallet', async () => {
    // Navigate to wallet management
    await page.click('button[aria-label="Wallet options"]');
    await page.click('text=Manage Wallets');
    
    // Click menu on first wallet
    const firstWalletMenu = page.locator('button[aria-label="Wallet options"]').first();
    await firstWalletMenu.click();
    
    // Click rename
    await page.click('text=Rename');
    
    // Clear and enter new name
    const nameInput = page.locator('input[type="text"]');
    await nameInput.clear();
    await nameInput.fill('My Test Wallet');
    await page.click('button:has-text("Save")');
    
    // Verify name was changed
    await expect(page.locator('text=My Test Wallet')).toBeVisible();
  });

  test('view addresses for HD wallet', async () => {
    // Navigate to wallet management
    await page.click('button[aria-label="Wallet options"]');
    await page.click('text=Manage Wallets');
    
    // Find HD wallet (not private key)
    const walletCards = page.locator('[role="button"][aria-label*="Select wallet"]');
    let hdWalletFound = false;
    
    for (let i = 0; i < await walletCards.count(); i++) {
      const wallet = walletCards.nth(i);
      const isPrivateKey = await wallet.locator('text=/Private Key/').count() > 0;
      
      if (!isPrivateKey) {
        hdWalletFound = true;
        // Click menu for this wallet
        const menu = wallet.locator('button[aria-label="Wallet options"]');
        await menu.click();
        break;
      }
    }
    
    if (hdWalletFound) {
      // Click view addresses
      await page.click('text=View Addresses');
      
      // Should see address list
      await expect(page.locator('text=Addresses')).toBeVisible();
      await expect(page.locator('[aria-label*="address card"]').first()).toBeVisible();
      
      // Can add new address
      await expect(page.locator('button:has-text("Add Address")')).toBeVisible();
    }
  });
});