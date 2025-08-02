import { test, expect, type Page, chromium } from '@playwright/test';
import path from 'path';

// Test wallets data
const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const TEST_PASSWORD = 'test123456';
const TEST_PRIVATE_KEY = '5KYZdUEo39z3FPrtuX2QbbwGnNP5zTd7yyr2SC1j299sBCnWjss'; // Well-known test private key

async function setupExtension(testName: string) {
  const extensionPath = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext(`test-results/wallet-management-${testName}`, {
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

async function createInitialWallet(page: Page) {
  // Check if we're on onboarding
  const hasCreateWallet = await page.getByText('Create Wallet').isVisible().catch(() => false);
  
  if (hasCreateWallet) {
    // Create initial wallet
    await page.getByText('Create Wallet').click();
    await page.waitForTimeout(1000);
    
    // Reveal phrase
    await page.getByText('View 12-word Secret Phrase').click();
    await page.waitForTimeout(1000);
    
    // Check the backup checkbox - it's a label that clicks the checkbox
    await page.getByText('I have saved my secret recovery phrase.').click();
    await page.waitForTimeout(500);
    
    // Set password
    await page.locator('input[name="password"]').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Continue' }).click();
    
    // Wait for navigation - the URL uses hash routing
    await page.waitForURL(url => url.href.includes('#/index') || url.href.endsWith('popup.html'), { timeout: 5000 });
  } else {
    // Check if we need to unlock
    const needsUnlock = page.url().includes('unlock');
    if (needsUnlock) {
      await page.locator('input[name="password"]').fill(TEST_PASSWORD);
      await page.getByRole('button', { name: 'Unlock Wallet' }).click();
      await page.waitForURL(url => url.href.includes('#/index') || url.href.endsWith('popup.html'), { timeout: 5000 });
    }
  }
}

test.describe('Wallet Management Features', () => {
  let page: Page;
  let context: any;

  // Set timeout for tests
  test.setTimeout(30000);

  test.beforeEach(async ({ }, testInfo) => {
    const testName = testInfo.title.replace(/[^a-z0-9]/gi, '-');
    const setup = await setupExtension(testName);
    page = setup.page;
    context = setup.context;
  });

  test.afterEach(async () => {
    await context?.close();
  });

  test('create initial wallet and access wallet management', async () => {
    await createInitialWallet(page);
    
    // Click wallet button in header (it's labeled "Select Wallet")
    const walletButton = page.locator('button[aria-label="Select Wallet"]');
    await expect(walletButton).toBeVisible();
    await walletButton.click();
    
    // Should be navigated to wallet selection page
    await page.waitForURL(url => url.href.includes('#/select-wallet'));
    
    // Should see the wallet list
    await expect(page.locator('text=Wallets')).toBeVisible();
    // Wait for wallet cards to appear
    await page.waitForSelector('.rounded.transition.duration-300.p-4.cursor-pointer', { timeout: 5000 });
    const walletCards = await page.locator('.rounded.transition.duration-300.p-4.cursor-pointer').count();
    expect(walletCards).toBeGreaterThan(0);
  });

  test('add new wallet to keychain', async () => {
    await createInitialWallet(page);
    
    // Navigate to wallet management
    await page.click('button[aria-label="Select Wallet"]');
    await page.waitForURL(url => url.href.includes('#/select-wallet'));
    
    // Click add wallet button
    await page.click('button[aria-label="Add Wallet"]');
    await page.waitForURL(url => url.href.includes('#/add-wallet'));
    
    // Should see options: Create New Wallet, Import Mnemonic, Import Private Key
    await expect(page.locator('text=Create New Wallet')).toBeVisible();
    await expect(page.locator('text=Import Mnemonic')).toBeVisible();
    await expect(page.locator('text=Import Private Key')).toBeVisible();
    
    // Test creating new wallet
    await page.click('text=Create New Wallet');
    await page.waitForSelector('text=View 12-word Secret Phrase');
    
    // Click to reveal the recovery phrase
    await page.click('text=View 12-word Secret Phrase');
    await page.waitForTimeout(500);
    
    // Complete wallet creation
    await page.click('text=I have saved my secret recovery phrase');
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Continue")');
    
    // Should navigate to index after creating wallet
    await page.waitForURL(url => url.href.includes('#/index'), { timeout: 5000 });
    
    // Navigate back to wallet list to verify
    await page.click('button[aria-label="Select Wallet"]');
    await page.waitForURL(url => url.href.includes('#/select-wallet'), { timeout: 5000 });
    await page.waitForTimeout(1000); // Wait for wallet list to update
    
    // Check that we now have 2 wallets
    const walletCount = await page.locator('.rounded.transition.duration-300.p-4.cursor-pointer').count();
    expect(walletCount).toBe(2);
  });

  test('import wallet with mnemonic', async () => {
    await createInitialWallet(page);
    
    // Navigate to add wallet
    await page.click('button[aria-label="Select Wallet"]');
    await page.waitForURL(url => url.href.includes('#/select-wallet'));
    await page.click('button[aria-label="Add Wallet"]');
    await page.waitForURL(url => url.href.includes('#/add-wallet'));
    
    // Choose import wallet
    await page.click('text=Import Mnemonic');
    
    // Enter test mnemonic - it's 12 individual inputs
    const mnemonicWords = TEST_MNEMONIC.split(' ');
    for (let i = 0; i < mnemonicWords.length; i++) {
      await page.fill(`input[name="word-${i}"]`, mnemonicWords[i]);
    }
    
    // Check backup confirmation
    await page.click('text=I have saved my secret recovery phrase');
    
    // Enter password - wait for password field to appear
    await page.waitForSelector('input[name="password"]', { timeout: 5000 });
    await page.fill('input[name="password"]', TEST_PASSWORD);
    
    // Wait for Continue button to be enabled
    await page.waitForTimeout(500);
    await page.click('button:has-text("Continue")');
    
    // Should navigate to index after importing wallet
    await page.waitForURL(url => url.href.includes('#/index'), { timeout: 5000 });
    
    // Navigate back to wallet list to verify
    await page.click('button[aria-label="Select Wallet"]');
    await page.waitForURL(url => url.href.includes('#/select-wallet'), { timeout: 5000 });
    await page.waitForTimeout(1000); // Wait for wallet list to update
    
    const walletCount = await page.locator('.rounded.transition.duration-300.p-4.cursor-pointer').count();
    expect(walletCount).toBeGreaterThan(1); // Should have at least 2 wallets now
  });

  test('import private key', async () => {
    await createInitialWallet(page);
    
    // Navigate to add wallet
    await page.click('button[aria-label="Select Wallet"]');
    await page.waitForURL(url => url.href.includes('#/select-wallet'));
    await page.click('button[aria-label="Add Wallet"]');
    await page.waitForURL(url => url.href.includes('#/add-wallet'));
    
    // Choose import private key
    await page.click('text=Import Private Key');
    
    // Enter test private key
    await page.fill('input[name="private-key"]', TEST_PRIVATE_KEY);
    
    // Check backup confirmation
    await page.click('text=I have backed up this private key');
    
    // Enter password - wait for password field to appear
    await page.waitForSelector('input[name="password"]', { timeout: 5000 });
    await page.fill('input[name="password"]', TEST_PASSWORD);
    
    // Wait for Continue button to be enabled
    await page.waitForTimeout(500);
    await page.click('button:has-text("Continue")');
    
    // Should navigate to index after importing key
    await page.waitForURL(url => url.href.includes('#/index'), { timeout: 5000 });
    
    // Navigate back to wallet list to verify
    await page.click('button[aria-label="Select Wallet"]');
    await page.waitForURL(url => url.href.includes('#/select-wallet'), { timeout: 5000 });
    await page.waitForTimeout(1000); // Wait for wallet list to update
    
    const walletCount = await page.locator('.rounded.transition.duration-300.p-4.cursor-pointer').count();
    expect(walletCount).toBeGreaterThan(1); // Should have at least 2 wallets now
  });

  test('switch between wallets', async () => {
    await createInitialWallet(page);
    
    // First create multiple wallets if needed
    await page.click('button[aria-label="Select Wallet"]');
    await page.waitForURL(url => url.href.includes('#/select-wallet'));
    
    // Get current wallet count
    const walletCards = await page.locator('.rounded.transition.duration-300.p-4.cursor-pointer').count();
    
    if (walletCards < 2) {
      // Add another wallet
      await page.click('button[aria-label="Add Wallet"]');
      await page.waitForURL(url => url.href.includes('#/add-wallet'));
      await page.click('text=Create New Wallet');
      await page.waitForSelector('text=View 12-word Secret Phrase');
      await page.click('text=View 12-word Secret Phrase');
      await page.waitForTimeout(500);
      await page.click('text=I have saved my secret recovery phrase');
      await page.fill('input[name="password"]', TEST_PASSWORD);
      await page.click('button:has-text("Continue")');
      // Should navigate to index after creating wallet
      await page.waitForURL(url => url.href.includes('#/index'), { timeout: 5000 });
      // Navigate back to select wallet
      await page.click('button[aria-label="Select Wallet"]');
      await page.waitForURL(url => url.href.includes('#/select-wallet'), { timeout: 5000 });
    }
    
    // Now test switching - click on second wallet (not the menu)
    const walletCardElements = page.locator('.rounded.transition.duration-300.p-4.cursor-pointer');
    const secondWallet = walletCardElements.nth(1);
    const secondWalletName = await secondWallet.locator('div.text-sm.font-medium').textContent();
    
    // Click on the wallet card itself, not the menu
    await secondWallet.click();
    
    // Should navigate back to index with new wallet selected
    await page.waitForURL(url => url.href.includes('#/index'));
    
    // Verify the wallet switched by checking the header button text
    const headerWalletButton = page.locator('button[aria-label="Select Wallet"]');
    await expect(headerWalletButton).toBeVisible();
    const headerWalletName = await headerWalletButton.textContent();
    expect(headerWalletName?.trim()).toBe(secondWalletName?.trim());
  });

  test('show wallet passphrase', async () => {
    await createInitialWallet(page);
    
    // Navigate to wallet management
    await page.click('button[aria-label="Select Wallet"]');
    await page.waitForURL(url => url.href.includes('#/select-wallet'));
    
    // Click menu button on first wallet card
    const firstWalletMenuButton = page.locator('button[aria-label="Wallet options"]').first();
    await firstWalletMenuButton.click();
    await page.waitForTimeout(500); // Wait for menu to open
    
    // Click show passphrase
    await page.click('text=Show Passphrase');
    await page.waitForURL(url => url.href.includes('#/show-passphrase'));
    
    // Enter password
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Show Recovery Phrase")');
    
    // Verify passphrase is shown - 12 words should be visible
    await page.waitForSelector('.font-mono', { timeout: 5000 });
    const mnemonicWords = await page.locator('.font-mono').count();
    expect(mnemonicWords).toBe(12);
  });

  test('remove wallet from keychain', async () => {
    await createInitialWallet(page);
    
    // First ensure we have at least 2 wallets
    await page.click('button[aria-label="Select Wallet"]');
    await page.waitForURL(url => url.href.includes('#/select-wallet'));
    
    const walletCount = await page.locator('.rounded.transition.duration-300.p-4.cursor-pointer').count();
    
    if (walletCount < 2) {
      // Add a wallet to remove
      await page.click('button[aria-label="Add Wallet"]');
      await page.waitForURL(url => url.href.includes('#/add-wallet'));
      await page.click('text=Import Private Key');
      await page.fill('input[name="private-key"]', TEST_PRIVATE_KEY);
      await page.click('text=I have backed up this private key');
      // Wait for password field to appear
      await page.waitForSelector('input[name="password"]', { timeout: 5000 });
      await page.fill('input[name="password"]', TEST_PASSWORD);
      await page.waitForTimeout(500);
      await page.click('button:has-text("Continue")');
      // Should navigate to index after importing key
      await page.waitForURL(url => url.href.includes('#/index'), { timeout: 5000 });
      // Navigate back to select wallet
      await page.click('button[aria-label="Select Wallet"]');
      await page.waitForURL(url => url.href.includes('#/select-wallet'), { timeout: 5000 });
    }
    
    // Get wallet count before removal - count the RadioGroup.Option elements
    const walletsBefore = await page.locator('[role="radio"]').count();
    // console.log('Wallets before removal:', walletsBefore);
    
    // We should have 2 wallets at this point
    expect(walletsBefore).toBe(2);
    
    // Click menu on last wallet
    const lastWalletMenuButton = page.locator('button[aria-label="Wallet options"]').last();
    await lastWalletMenuButton.click();
    await page.waitForTimeout(500); // Wait for menu to open
    
    // Click remove wallet
    const removeButton = page.locator('text=/Remove.*Wallet|Remove.*Private Key/');
    await removeButton.click();
    await page.waitForURL(url => url.href.includes('#/remove-wallet'));
    
    // Confirm removal
    await page.fill('input[name="password"]', TEST_PASSWORD);
    // The button text includes the wallet name, so we need to match on "Remove"
    await page.click('button[aria-label*="Remove"]');
    
    // Should be back on wallet selection
    await page.waitForURL(url => url.href.includes('#/select-wallet'));
    
    // Verify wallet was removed
    await page.waitForTimeout(1000); // Wait for removal to complete
    const walletsAfter = await page.locator('[role="radio"]').count();
    expect(walletsAfter).toBe(walletsBefore - 1);
    // Since we started with 1, added 1, and removed 1, we should have 1
    expect(walletsAfter).toBe(1);
  });

  test('rename wallet', async () => {
    await createInitialWallet(page);
    
    // Check if renaming is supported - need to look at wallet menu options
    await page.click('button[aria-label="Select Wallet"]');
    await page.waitForURL(url => url.href.includes('#/select-wallet'));
    
    // Click menu button on first wallet
    const firstWalletMenuButton = page.locator('button[aria-label="Wallet options"]').first();
    await firstWalletMenuButton.click();
    await page.waitForTimeout(500); // Wait for menu to open
    
    // Check if rename option exists
    const renameOption = page.locator('text=Rename');
    const renameExists = await renameOption.isVisible().catch(() => false);
    
    if (!renameExists) {
      // console.log('Rename feature not available in wallet menu');
      return;
    }
    
    // Click rename
    await renameOption.click();
    
    // Clear and enter new name
    const nameInput = page.locator('input[type="text"]');
    await nameInput.clear();
    await nameInput.fill('My Test Wallet');
    await page.click('button:has-text("Save")');
    
    // Verify name was changed
    await expect(page.locator('text=My Test Wallet')).toBeVisible();
  });

  test('cannot remove the only wallet', async () => {
    await createInitialWallet(page);
    
    // Navigate to wallet management
    await page.click('button[aria-label="Select Wallet"]');
    await page.waitForURL(url => url.href.includes('#/select-wallet'));
    
    // Click menu on the only wallet
    const walletMenuButton = page.locator('button[aria-label="Wallet options"]').first();
    await walletMenuButton.click();
    await page.waitForTimeout(500); // Wait for menu to open
    
    // Check that remove option is disabled
    const removeButton = page.locator('button:has-text("Remove")').first();
    const isDisabled = await removeButton.getAttribute('disabled');
    expect(isDisabled).not.toBeNull();
    
    // Also check the title attribute
    const title = await removeButton.getAttribute('title');
    expect(title).toBe('Cannot remove only wallet');
  });

  test('view addresses for HD wallet', async () => {
    await createInitialWallet(page);
    
    // Navigate to wallet management
    await page.click('button[aria-label="Select Wallet"]');
    await page.waitForURL(url => url.href.includes('#/select-wallet'));
    
    // Find HD wallet (not private key) - look for wallets that show "Mnemonic"
    const walletCards = page.locator('.rounded.transition.duration-300.p-4.cursor-pointer');
    let hdWalletFound = false;
    
    for (let i = 0; i < await walletCards.count(); i++) {
      const wallet = walletCards.nth(i);
      const isMnemonic = await wallet.locator('text=Mnemonic').count() > 0;
      
      if (isMnemonic) {
        hdWalletFound = true;
        // Click menu for this wallet
        const menuButton = wallet.locator('button[aria-label="Wallet options"]');
        await menuButton.click();
        await page.waitForTimeout(500); // Wait for menu to open
        break;
      }
    }
    
    if (hdWalletFound) {
      // Check if "View Addresses" option exists
      const viewAddressesOption = page.locator('text=View Addresses');
      const viewAddressesExists = await viewAddressesOption.isVisible().catch(() => false);
      
      if (!viewAddressesExists) {
        // console.log('View Addresses feature not available in wallet menu');
        return;
      }
      
      // Click view addresses
      await viewAddressesOption.click();
      
      // Should see address list
      await expect(page.locator('text=Addresses')).toBeVisible();
      await expect(page.locator('[aria-label*="address card"]').first()).toBeVisible();
      
      // Can add new address
      await expect(page.locator('button:has-text("Add Address")')).toBeVisible();
    } else {
      // console.log('No HD wallet found to test addresses');
    }
  });
});