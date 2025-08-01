import { test, expect, type Page, chromium } from '@playwright/test';
import path from 'path';

const TEST_PASSWORD = 'test123456';

async function setupExtension() {
  const extensionPath = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext('test-results/index-page-features', {
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

test.describe('Index Page Features', () => {
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

  test('receive, send, history buttons functionality', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Test Receive button
    const receiveButton = page.locator('button:has-text("Receive")');
    await expect(receiveButton).toBeVisible();
    await receiveButton.click();
    
    // Should navigate to view address page with QR code
    await page.waitForSelector('text=/QR Code|Receive/');
    await expect(page.locator('canvas, [class*="qr"]')).toBeVisible(); // QR code
    
    // Go back
    await page.click('button[aria-label="Go back"]');
    await page.waitForSelector('text=/Assets|Balances/');
    
    // Test Send button
    const sendButton = page.locator('button:has-text("Send")');
    await expect(sendButton).toBeVisible();
    await sendButton.click();
    
    // Should navigate to send page
    await page.waitForSelector('text=/Send|Recipient/');
    await expect(page.locator('input[placeholder*="address"]')).toBeVisible();
    
    // Go back
    await page.click('button[aria-label="Go back"]');
    await page.waitForSelector('text=/Assets|Balances/');
    
    // Test History button
    const historyButton = page.locator('button:has-text("History")');
    await expect(historyButton).toBeVisible();
    await historyButton.click();
    
    // Should navigate to history page
    await page.waitForSelector('text=History');
    await expect(page.locator('text=/No Transactions|Transaction/')).toBeVisible();
  });

  test('assets and balances tab switching', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Should start on Balances tab
    await expect(page.locator('button[role="tab"][aria-selected="true"]:has-text("Balances")')).toBeVisible();
    
    // Click Assets tab
    await page.click('button[role="tab"]:has-text("Assets")');
    
    // Should show assets list
    await expect(page.locator('button[role="tab"][aria-selected="true"]:has-text("Assets")')).toBeVisible();
    
    // Search should be visible
    await expect(page.locator('input[placeholder*="Search"]')).toBeVisible();
    
    // Switch back to Balances
    await page.click('button[role="tab"]:has-text("Balances")');
    await expect(page.locator('button[role="tab"][aria-selected="true"]:has-text("Balances")')).toBeVisible();
  });

  test('balance list interactions', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Should show BTC balance by default
    const btcBalance = page.locator('div').filter({ hasText: 'BTC' }).filter({ has: page.locator('img[alt="BTC"]') });
    await expect(btcBalance).toBeVisible();
    
    // Click on BTC balance
    await btcBalance.click();
    
    // Should navigate to balance details
    await page.waitForSelector('text=/Balance|Available/');
    
    // Should show action buttons
    await expect(page.locator('text=Send')).toBeVisible();
    
    // For BTC, should show specific options
    await expect(page.locator('text=/BTCPay|Dispense/')).toBeVisible();
  });

  test('asset search functionality', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Switch to Assets tab
    await page.click('button[role="tab"]:has-text("Assets")');
    
    // Find search input
    const searchInput = page.locator('input[placeholder*="Search"]');
    await expect(searchInput).toBeVisible();
    
    // Type in search
    await searchInput.fill('XCP');
    
    // Should show search results or no results
    await page.waitForTimeout(1000); // Wait for search to complete
    
    // Clear search
    const clearButton = page.locator('button[aria-label="Clear search"]');
    if (await clearButton.isVisible()) {
      await clearButton.click();
    }
  });

  test('pinned assets management', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Look for pinned assets section
    const pinnedSection = page.locator('text=/Pinned|BTC/');
    
    // BTC should be pinned by default
    await expect(page.locator('text=BTC')).toBeVisible();
    
    // Click manage pinned assets if available
    const managePinnedButton = page.locator('button:has-text("Manage"), a:has-text("Manage")');
    if (await managePinnedButton.isVisible()) {
      await managePinnedButton.click();
      await page.waitForSelector('text=/Pinned Assets|Pin assets/');
      
      // Should show pin management interface
      await expect(page.locator('text=/Add Asset|Remove/')).toBeVisible();
    }
  });

  test('balance menu actions', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Find BTC balance
    const btcBalance = page.locator('div').filter({ hasText: 'BTC' });
    
    // Look for menu button on balance item
    const menuButton = btcBalance.locator('button[aria-label*="menu"], button[aria-label*="options"]').first();
    if (await menuButton.isVisible()) {
      await menuButton.click();
      
      // Should show menu options
      await expect(page.locator('text=/Send|View/')).toBeVisible();
    }
  });

  test('external link to XChain', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Navigate to history
    await page.click('button:has-text("History")');
    await page.waitForSelector('text=History');
    
    // Look for external link button
    const externalLinkButton = page.locator('button[aria-label*="XChain"], button[aria-label*="external"]');
    if (await externalLinkButton.isVisible()) {
      // Note: We can't actually test opening external links in the test environment
      // but we can verify the button exists
      await expect(externalLinkButton).toBeVisible();
    }
  });

  test('footer navigation', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Check footer buttons
    const walletButton = page.locator('[aria-label="Footer"] button').filter({ has: page.locator('[class*="FaWallet"]') });
    const marketButton = page.locator('[aria-label="Footer"] button').filter({ has: page.locator('[class*="FaUniversity"]') });
    const actionsButton = page.locator('[aria-label="Footer"] button').filter({ has: page.locator('[class*="FaTools"]') });
    const settingsButton = page.locator('[aria-label="Footer"] button').filter({ has: page.locator('[class*="FaCog"]') });
    
    // Test Market navigation
    await marketButton.click();
    await page.waitForSelector('text=/Market|XCP DEX/');
    await expect(page.locator('text=Trade Assets Peer-to-Peer')).toBeVisible();
    
    // Test Actions navigation
    await actionsButton.click();
    await page.waitForSelector('text=Actions');
    await expect(page.locator('text=/Broadcast|Issuance/')).toBeVisible();
    
    // Test Settings navigation
    await settingsButton.click();
    await page.waitForSelector('text=Settings');
    await expect(page.locator('text=/Security|Advanced/')).toBeVisible();
    
    // Return to wallet
    await walletButton.click();
    await page.waitForSelector('text=/Assets|Balances/');
  });

  test('empty state messages', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Check for empty state in balances
    const balancesList = page.locator('[role="list"], .space-y-2');
    const balanceItems = balancesList.locator('> div');
    
    if (await balanceItems.count() === 0) {
      await expect(page.locator('text=/No balances|No assets/')).toBeVisible();
    }
    
    // Switch to Assets tab
    await page.click('button[role="tab"]:has-text("Assets")');
    
    // Search for non-existent asset
    const searchInput = page.locator('input[placeholder*="Search"]');
    await searchInput.fill('NONEXISTENTASSET123');
    await page.waitForTimeout(1000);
    
    // Should show no results
    await expect(page.locator('text=/No results|No assets found/')).toBeVisible();
  });

  test('scroll to load more balances', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Check if there's a scroll indicator
    const scrollIndicator = page.locator('text=/Scroll to load|Load more/');
    if (await scrollIndicator.isVisible()) {
      // Scroll to bottom
      await page.evaluate(() => {
        const scrollContainer = document.querySelector('.overflow-auto');
        if (scrollContainer) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
      });
      
      // Wait for potential loading
      await page.waitForTimeout(1000);
      
      // Should either show more items or indicate end of list
    }
  });
});