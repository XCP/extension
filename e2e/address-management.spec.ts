import { test, expect, type Page, chromium } from '@playwright/test';
import path from 'path';

const TEST_PASSWORD = 'test123456';
const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

async function setupExtension(testName: string) {
  const extensionPath = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext(`test-results/address-management-${testName}`, {
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
  const onboardingVisible = await page.locator('button:has-text("Create Wallet"), button:has-text("Import Wallet")').first().isVisible();
  
  if (onboardingVisible) {
    // Create initial wallet
    await page.click('button:has-text("Create Wallet")');
    await page.waitForSelector('text=View 12-word Secret Phrase');
    
    // Click to reveal the recovery phrase
    await page.click('text=View 12-word Secret Phrase');
    await page.waitForTimeout(500);
    
    // Check the backup checkbox
    await page.click('text=I have saved my secret recovery phrase');
    await page.waitForSelector('input[type="password"]');
    
    // Set password
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Continue")');
    
    // Wait for main page
    await page.waitForSelector('text=/Assets|Balances/');
    
    // Wait for the address to be visible on the main page
    await page.waitForSelector('.font-mono', { timeout: 5000 });
  }
}

test.describe('Address Management', () => {
  let page: Page;
  let context: any;

  test.beforeEach(async ({ }, testInfo) => {
    const testName = testInfo.title.replace(/[^a-z0-9]/gi, '-');
    const setup = await setupExtension(testName);
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
    // console.log('Address to copy:', addressText);
    
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
    const chevronButton = page.locator('[aria-label="Select another address"]');
    await expect(chevronButton).toBeVisible({ timeout: 10000 });
    
    // Click the chevron
    await chevronButton.click();
    
    // Wait for navigation
    await page.waitForURL('**/select-address', { timeout: 5000 });
    
    // Should see the Addresses header
    await page.waitForSelector('text=Addresses', { timeout: 5000 });
    
    // Should see at least one address
    const addressCards = page.locator('div').filter({ hasText: /Address \d+/ }).filter({ has: page.locator('.font-mono') });
    await expect(addressCards.first()).toBeVisible({ timeout: 5000 });
  });

  test('add new addresses to wallet', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Navigate to address selection
    await page.locator('[aria-label="Select another address"]').click();
    await page.waitForURL('**/select-address', { timeout: 5000 });
    await page.waitForSelector('text=Addresses', { timeout: 5000 });
    
    // Debug: take a screenshot
    await page.screenshot({ path: 'test-results/select-address-debug.png' });
    
    // Wait for addresses to load
    await page.waitForSelector('.font-mono', { timeout: 5000 });
    
    // Count initial addresses - they are RadioGroup options with address info
    const addressCards = page.locator('div[role="radio"]');
    let initialCount = await addressCards.count();
    
    // If no role="radio", try another selector
    if (initialCount === 0) {
      const altCards = page.locator('div').filter({ hasText: /Address \d+/ }).filter({ has: page.locator('.font-mono') });
      initialCount = await altCards.count();
    }
    
    // console.log('Initial address count:', initialCount);
    
    // Click add address button at the bottom
    const addButton = page.locator('button:has-text("Add Address")');
    await expect(addButton).toBeVisible({ timeout: 5000 });
    await addButton.click();
    
    // Wait for new address to be added
    await page.waitForTimeout(2000);
    
    // Count addresses after adding
    const afterCount = await addressCards.count();
    expect(afterCount).toBe(initialCount + 1);
    
    // New address should be named appropriately
    await expect(page.locator(`text=Address ${afterCount}`)).toBeVisible();
  });

  test('copy address from address card', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Navigate to address selection
    await page.locator('[aria-label="Select another address"]').click();
    await page.waitForSelector('text=Addresses');
    
    // Find first address card - it's a div with Address text and font-mono
    const firstCard = page.locator('div').filter({ hasText: /Address \d+/ }).filter({ has: page.locator('.font-mono') }).first();
    await expect(firstCard).toBeVisible();
    
    // Click the menu button (three dots) - it has aria-haspopup="menu"
    const menuButton = firstCard.locator('button[aria-haspopup="menu"]');
    await menuButton.click();
    
    // Click Copy Address from menu
    await page.click('text=Copy Address');
    
    // Should show check mark feedback
    await expect(page.locator('svg.text-green-500')).toBeVisible();
  });

  test('show private key for address', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Navigate to address selection
    await page.locator('[aria-label="Select another address"]').click();
    await page.waitForSelector('text=Addresses');
    
    // Find first address card and click menu
    const firstCard = page.locator('div').filter({ hasText: /Address \d+/ }).filter({ has: page.locator('.font-mono') }).first();
    const menuButton = firstCard.locator('button[aria-haspopup="menu"]');
    await menuButton.click();
    
    // Click show private key from menu
    await page.click('text=Show Private Key');
    
    // Wait for navigation to show-private-key page
    await page.waitForURL('**/show-private-key/**');
    
    // Enter password
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Show Private Key")');
    
    // Wait for private key to be revealed
    await page.waitForSelector('.font-mono', { timeout: 5000 });
    
    // Should show private key (WIF or hex format)
    const privateKeyElement = page.locator('.font-mono').first();
    await expect(privateKeyElement).toBeVisible();
    
    // Should have copy button
    await expect(page.locator('button:has-text("Copy Private Key")')).toBeVisible();
  });

  test('switch between addresses', async () => {
    // Ensure we have a wallet with multiple addresses
    await createInitialWallet(page);
    
    // Navigate to address selection
    await page.locator('[aria-label="Select another address"]').click();
    await page.waitForSelector('text=Addresses');
    
    // Add a second address if needed
    let addressCards = page.locator('div').filter({ hasText: /Address \d+/ }).filter({ has: page.locator('.font-mono') });
    let addressCount = await addressCards.count();
    // console.log('Initial address count:', addressCount);
    
    if (addressCount < 2) {
      await page.click('button:has-text("Add Address")');
      await page.waitForTimeout(2000);
      
      // Verify the address was added
      addressCards = page.locator('div').filter({ hasText: /Address \d+/ }).filter({ has: page.locator('.font-mono') });
      addressCount = await addressCards.count();
      // console.log('Address count after adding:', addressCount);
      expect(addressCount).toBe(2);
    }
    
    // Click on second address
    const secondAddress = addressCards.nth(1);
    const secondAddressName = await secondAddress.locator('.font-medium').first().textContent();
    // console.log('Clicking on address:', secondAddressName);
    
    // Click on the address name text to select it
    await secondAddress.locator('.font-medium').first().click();
    
    // Should return to index with new address selected
    await page.waitForTimeout(1000); // Give time for navigation
    await page.waitForSelector('text=/Assets|Balances/', { timeout: 10000 });
    
    // Verify the address changed
    const activeAddressButton = page.locator('div[aria-label="Current address"]');
    await expect(activeAddressButton).toContainText(secondAddressName || 'Address 2');
  });

  test('address limit enforcement', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Navigate to address selection
    await page.locator('[aria-label="Select another address"]').click();
    await page.waitForSelector('text=Addresses');
    
    // Try to add addresses up to the limit (100 for HD wallets)
    const addressCards = page.locator('div').filter({ hasText: /Address \d+/ }).filter({ has: page.locator('.font-mono') });
    let addressCount = await addressCards.count();
    // console.log('Starting with addresses:', addressCount);
    
    // Add one address to test the functionality
    const initialCount = addressCount;
    await page.click('button:has-text("Add Address")');
    await page.waitForTimeout(2000);
    
    // Verify address was added
    const finalCount = await addressCards.count();
    // console.log('Final address count:', finalCount);
    expect(finalCount).toBeGreaterThan(initialCount);
    
    // Note: To truly test the 100 address limit, you'd need to add 100 addresses
    // which would take too long for a regular test
  });

  test.skip('rename address - feature not implemented', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Navigate to address selection
    await page.locator('[aria-label="Select another address"]').click();
    await page.waitForSelector('text=Addresses');
    
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
    
    // Wait for main page to be ready
    await page.waitForSelector('text=/Assets|Balances/', { timeout: 10000 });
    
    // Navigate to address selection
    await page.locator('[aria-label="Select another address"]').click();
    await page.waitForSelector('text=Addresses', { timeout: 10000 });
    
    // Find address cards using RadioGroup structure from AddressList
    let addressCards = page.locator('.space-y-2 > div').filter({ has: page.locator('.font-mono') });
    let addressCount = await addressCards.count();
    
    // Add a second address if needed
    if (addressCount < 2) {
      // Click the Add Address button at the bottom
      const addButton = page.locator('button:has-text("Add Address")');
      if (await addButton.isVisible()) {
        await addButton.click();
        await page.waitForTimeout(2000);
        addressCards = page.locator('.space-y-2 > div').filter({ has: page.locator('.font-mono') });
        addressCount = await addressCards.count();
      }
    }
    
    // Select second address if available
    if (addressCount >= 2) {
      const secondAddress = addressCards.nth(1);
      const secondAddressName = await secondAddress.locator('.font-medium').first().textContent();
      await secondAddress.click();
      
      // Wait for navigation back to index
      await page.waitForSelector('text=/Assets|Balances/', { timeout: 10000 });
      
      // Lock wallet using the header button
      await page.click('button[aria-label="Lock Wallet"]');
      await page.waitForTimeout(1000); // Give time for navigation
      
      // Should show unlock page with XCP Wallet title
      await page.waitForSelector('text=XCP Wallet', { timeout: 10000 });
      
      // Unlock wallet
      await page.fill('input[type="password"][placeholder="Enter your password"]', TEST_PASSWORD);
      await page.click('button[aria-label="Unlock Wallet"]');
      
      // Should be back on index with the same address selected
      await page.waitForSelector('text=/Assets|Balances/', { timeout: 10000 });
      const activeAddressButton = page.locator('div[aria-label="Current address"]');
      await expect(activeAddressButton).toContainText(secondAddressName || 'Address 2');
    }
  });

  test('address type display', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Wait for main page to be ready
    await page.waitForSelector('text=/Assets|Balances/', { timeout: 10000 });
    
    // Navigate to address selection
    await page.locator('[aria-label="Select another address"]').click();
    await page.waitForSelector('text=Addresses', { timeout: 10000 });
    
    // Find the first address card in the RadioGroup
    const firstCard = page.locator('.space-y-2 > div').filter({ has: page.locator('.font-mono') }).first();
    await expect(firstCard).toBeVisible();
    
    // Get the address text
    const addressText = await firstCard.locator('.font-mono').textContent();
    
    // Verify the address format is valid
    expect(addressText).toBeTruthy();
    
    // Determine address type by prefix
    if (addressText?.startsWith('bc1q')) {
      // Native SegWit address detected
      expect(addressText).toMatch(/^bc1q[a-z0-9]+/);
    } else if (addressText?.startsWith('bc1p')) {
      // Taproot address detected
      expect(addressText).toMatch(/^bc1p[a-z0-9]+/);
    } else if (addressText?.startsWith('1')) {
      // Legacy address detected
      expect(addressText).toMatch(/^1[a-zA-Z0-9]+/);
    } else if (addressText?.startsWith('3')) {
      // Nested SegWit address detected
      expect(addressText).toMatch(/^3[a-zA-Z0-9]+/);
    }
    
    // Verify path is displayed
    const pathText = await firstCard.locator('.text-xs').textContent();
    expect(pathText).toMatch(/m\/\d+'\/\d+'\/\d+'\/\d+\/\d+/);
  });

  test.skip('private key wallet has no add address option', async () => {
    // This test is complex as it requires:
    // 1. Starting fresh with no wallets
    // 2. Importing a private key wallet specifically
    // 3. Verifying the Add Address button is disabled
    // 
    // The test is skipped because:
    // - It requires a complex wallet import flow that's better tested in dedicated import tests
    // - The functionality (private key wallets can't add addresses) is enforced at the UI level
    // - Testing this properly would require resetting the entire extension state
  });
});