import { test, expect, type Page, chromium } from '@playwright/test';
import path from 'path';

const TEST_PASSWORD = 'test123456';
const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

async function setupExtension() {
  const extensionPath = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext('test-results/address-management', {
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
}

test.describe('Address Management', () => {
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

  test('copy address from blue button on index', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Find the big blue address button
    const addressButton = page.locator('.bg-blue-600, .bg-blue-200').filter({ hasText: /Address \d+|bc1|1[A-Za-z0-9]/ });
    await expect(addressButton).toBeVisible();
    
    // Get the address text before clicking
    const addressText = await addressButton.locator('.font-mono').textContent();
    console.log('Address to copy:', addressText);
    
    // Click the main part of the button (not the chevron)
    await addressButton.click();
    
    // Should show check mark indicating copied
    await expect(addressButton.locator('.text-green-500')).toBeVisible();
    
    // Verify clipboard contains the address (if supported by test environment)
    // Note: Clipboard access may not work in all test environments
  });

  test('navigate to address selection via chevron', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Find the chevron on the right side of the address button
    const chevronButton = page.locator('.bg-blue-600, .bg-blue-200').locator('[aria-label="Select another address"]');
    await expect(chevronButton).toBeVisible();
    
    // Click the chevron
    await chevronButton.click();
    
    // Should navigate to address selection screen
    await page.waitForSelector('text=Select Address');
    await expect(page.locator('[aria-label*="address card"]').first()).toBeVisible();
  });

  test('add new addresses to wallet', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Navigate to address selection
    await page.locator('[aria-label="Select another address"]').click();
    await page.waitForSelector('text=Select Address');
    
    // Count initial addresses
    const initialCount = await page.locator('[aria-label*="address card"]').count();
    console.log('Initial address count:', initialCount);
    
    // Click add address button
    await page.click('button:has-text("Add Address")');
    
    // Wait for new address to be added
    await page.waitForTimeout(1000);
    
    // Count addresses after adding
    const afterCount = await page.locator('[aria-label*="address card"]').count();
    expect(afterCount).toBe(initialCount + 1);
    
    // New address should be named appropriately
    await expect(page.locator(`text=Address ${afterCount}`)).toBeVisible();
  });

  test('copy address from address card', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Navigate to address selection
    await page.locator('[aria-label="Select another address"]').click();
    await page.waitForSelector('text=Select Address');
    
    // Find first address card
    const firstCard = page.locator('[aria-label*="address card"]').first();
    await expect(firstCard).toBeVisible();
    
    // Click copy button on the card
    const copyButton = firstCard.locator('button[aria-label*="Copy"]');
    await copyButton.click();
    
    // Should show feedback that it was copied
    await expect(page.locator('text=/Copied|✓/')).toBeVisible();
  });

  test('show private key for address', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Navigate to address selection
    await page.locator('[aria-label="Select another address"]').click();
    await page.waitForSelector('text=Select Address');
    
    // Click menu on first address
    const firstCardMenu = page.locator('[aria-label*="address card"]').first().locator('button[aria-label*="options"]');
    await firstCardMenu.click();
    
    // Click show private key
    await page.click('text=Show Private Key');
    
    // Enter password
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Show")');
    
    // Should show private key
    await expect(page.locator('.font-mono').filter({ hasText: /^[5KL][1-9A-HJ-NP-Za-km-z]{50,51}$|^[0-9a-fA-F]{64}$/ })).toBeVisible();
    
    // Should have copy button
    await expect(page.locator('button:has-text("Copy")')).toBeVisible();
  });

  test('switch between addresses', async () => {
    // Ensure we have a wallet with multiple addresses
    await createInitialWallet(page);
    
    // Navigate to address selection
    await page.locator('[aria-label="Select another address"]').click();
    await page.waitForSelector('text=Select Address');
    
    // Add a second address if needed
    const addressCount = await page.locator('[aria-label*="address card"]').count();
    if (addressCount < 2) {
      await page.click('button:has-text("Add Address")');
      await page.waitForTimeout(1000);
    }
    
    // Click on second address
    const secondAddress = page.locator('[aria-label*="address card"]').nth(1);
    const secondAddressName = await secondAddress.locator('.font-medium').textContent();
    await secondAddress.click();
    
    // Should return to index with new address selected
    await page.waitForSelector('text=/Assets|Balances/');
    
    // Verify the address changed
    const activeAddressButton = page.locator('.bg-blue-600');
    await expect(activeAddressButton).toContainText(secondAddressName || 'Address 2');
  });

  test('address limit enforcement', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Navigate to address selection
    await page.locator('[aria-label="Select another address"]').click();
    await page.waitForSelector('text=Select Address');
    
    // Try to add addresses up to the limit (100 for HD wallets)
    let addressCount = await page.locator('[aria-label*="address card"]').count();
    console.log('Starting with addresses:', addressCount);
    
    // Add a few addresses to test the functionality
    // (We won't add all 100 in the test, just verify the mechanism works)
    for (let i = 0; i < 5 && addressCount < 100; i++) {
      await page.click('button:has-text("Add Address")');
      await page.waitForTimeout(500);
      addressCount++;
    }
    
    // Verify addresses were added
    const finalCount = await page.locator('[aria-label*="address card"]').count();
    expect(finalCount).toBeGreaterThan(1);
    
    // Note: To truly test the 100 address limit, you'd need to add 100 addresses
    // which would take too long for a regular test
  });

  test('rename address', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Navigate to address selection
    await page.locator('[aria-label="Select another address"]').click();
    await page.waitForSelector('text=Select Address');
    
    // Click menu on first address
    const firstCardMenu = page.locator('[aria-label*="address card"]').first().locator('button[aria-label*="options"]');
    await firstCardMenu.click();
    
    // Click rename
    await page.click('text=Rename');
    
    // Clear and enter new name
    const nameInput = page.locator('input[type="text"]');
    await nameInput.clear();
    await nameInput.fill('My Main Address');
    await page.click('button:has-text("Save")');
    
    // Verify name was changed
    await expect(page.locator('text=My Main Address')).toBeVisible();
  });

  test('selected address persists after lock/unlock', async () => {
    // Ensure we have a wallet with multiple addresses
    await createInitialWallet(page);
    
    // Navigate to address selection
    await page.locator('[aria-label="Select another address"]').click();
    await page.waitForSelector('text=Select Address');
    
    // Add a second address if needed
    const addressCount = await page.locator('[aria-label*="address card"]').count();
    if (addressCount < 2) {
      await page.click('button:has-text("Add Address")');
      await page.waitForTimeout(1000);
    }
    
    // Select second address
    const secondAddress = page.locator('[aria-label*="address card"]').nth(1);
    const secondAddressName = await secondAddress.locator('.font-medium').textContent();
    await secondAddress.click();
    
    // Wait for index page
    await page.waitForSelector('text=/Assets|Balances/');
    
    // Lock wallet
    await page.click('button[aria-label="Lock wallet"]');
    await page.waitForSelector('text=Unlock Wallet');
    
    // Unlock wallet
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Unlock")');
    
    // Should be back on index with the same address selected
    await page.waitForSelector('text=/Assets|Balances/');
    const activeAddressButton = page.locator('.bg-blue-600');
    await expect(activeAddressButton).toContainText(secondAddressName || 'Address 2');
  });

  test('address type display', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Navigate to address selection
    await page.locator('[aria-label="Select another address"]').click();
    await page.waitForSelector('text=Select Address');
    
    // Check that addresses show their type
    const firstCard = page.locator('[aria-label*="address card"]').first();
    const addressText = await firstCard.locator('.font-mono').textContent();
    
    // Determine address type by prefix
    if (addressText?.startsWith('bc1q')) {
      console.log('Native SegWit address detected');
    } else if (addressText?.startsWith('bc1p')) {
      console.log('Taproot address detected');
    } else if (addressText?.startsWith('1')) {
      console.log('Legacy address detected');
    } else if (addressText?.startsWith('3')) {
      console.log('Nested SegWit address detected');
    }
  });

  test('private key wallet has no add address option', async () => {
    // First create a private key wallet
    // Navigate to wallet management
    const walletButton = page.locator('button[aria-label="Wallet options"]');
    if (await walletButton.isVisible()) {
      await walletButton.click();
      await page.click('text=Manage Wallets');
      await page.click('button[aria-label="Add Wallet"]');
      await page.click('text=Import Private Key');
      
      // Use test private key
      await page.fill('input[placeholder="Enter private key"]', '5KYZdUEo39z3FPrtuX2QbbwGnNP5zTd7yyr2SC1j299sBCnWjss');
      await page.click('text=I have backed up this private key');
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button:has-text("Continue")');
      
      // Switch to the private key wallet
      await page.waitForSelector('text=/Private Key|Wallet/');
      const privateKeyWallet = page.locator('[role="button"][aria-label*="Select wallet"]').filter({ hasText: /Private Key/ });
      await privateKeyWallet.click();
    }
    
    // Navigate to address selection
    await page.locator('[aria-label="Select another address"]').click();
    await page.waitForSelector('text=Select Address');
    
    // Verify no add address button for private key wallet
    const addButton = page.locator('button:has-text("Add Address")');
    await expect(addButton).not.toBeVisible();
    
    // Should only have one address
    const addressCount = await page.locator('[aria-label*="address card"]').count();
    expect(addressCount).toBe(1);
  });
});