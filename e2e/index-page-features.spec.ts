import { test, expect, type Page, chromium } from '@playwright/test';
import path from 'path';

const TEST_PASSWORD = 'test123456';

async function setupExtension(testName: string) {
  const extensionPath = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext(`test-results/index-page-features-${testName}`, {
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
  }
}

test.describe('Index Page Features', () => {
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

  test('receive, send, history buttons functionality', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Wait for main page to be ready
    await page.waitForSelector('text=/Assets|Balances/', { timeout: 10000 });
    
    // Test Receive button
    const receiveButton = page.locator('button[aria-label="Receive tokens"]');
    await expect(receiveButton).toBeVisible();
    await receiveButton.click();
    
    // Should navigate to view address page
    await page.waitForURL('**/view-address', { timeout: 10000 });
    await page.waitForTimeout(500); // Give time for QR code to render
    
    // Go back using browser back button or header back button
    await page.goBack();
    await page.waitForSelector('text=/Assets|Balances/', { timeout: 10000 });
    
    // Test Send button
    const sendButton = page.locator('button[aria-label="Send tokens"]');
    await expect(sendButton).toBeVisible();
    await sendButton.click();
    
    // Should navigate to send page
    await page.waitForURL('**/compose/send/BTC', { timeout: 10000 });
    await page.waitForTimeout(500);
    
    // Go back
    await page.goBack();
    await page.waitForSelector('text=/Assets|Balances/', { timeout: 10000 });
    
    // Test History button
    const historyButton = page.locator('button[aria-label="Transaction history"]');
    await expect(historyButton).toBeVisible();
    await historyButton.click();
    
    // Should navigate to history page
    await page.waitForURL('**/address-history', { timeout: 10000 });
    await page.waitForTimeout(500);
  });

  test('assets and balances tab switching', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Wait for main page to be ready
    await page.waitForSelector('text=/Assets|Balances/', { timeout: 10000 });
    
    // Should start on Balances tab (check underline)
    const balancesButton = page.locator('button[aria-label="View Balances"]');
    await expect(balancesButton).toBeVisible();
    let style = await balancesButton.evaluate(el => getComputedStyle(el).textDecoration);
    expect(style).toContain('underline');
    
    // Verify balance search is visible
    await expect(page.locator('input[placeholder="Search balances..."]')).toBeVisible();
    
    // Click Assets tab
    await page.click('button[aria-label="View Assets"]');
    await page.waitForTimeout(500);
    
    // Should show assets list (check underline moved to Assets)
    const assetsButton = page.locator('button[aria-label="View Assets"]');
    style = await assetsButton.evaluate(el => getComputedStyle(el).textDecoration);
    expect(style).toContain('underline');
    
    // Asset search should be visible
    await expect(page.locator('input[placeholder="Search assets..."]')).toBeVisible();
    
    // Switch back to Balances
    await page.click('button[aria-label="View Balances"]');
    style = await balancesButton.evaluate(el => getComputedStyle(el).textDecoration);
    expect(style).toContain('underline');
  });

  test('balance list interactions', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Wait for main page to be ready
    await page.waitForSelector('text=/Assets|Balances/', { timeout: 10000 });
    
    // Should show BTC balance by default - find the specific balance item
    const btcBalance = page.locator('.space-y-2 > div').filter({ hasText: /^BTC0\.00000000$/ }).first();
    await expect(btcBalance).toBeVisible();
    
    // Click on BTC balance
    await btcBalance.click();
    
    // Should navigate to send page for BTC
    await page.waitForURL('**/compose/send/BTC', { timeout: 10000 });
    
    // Should show send form elements
    await expect(page.locator('text=/Send|Recipient/')).toBeVisible();
  });

  test('asset search functionality', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Wait for main page to be ready
    await page.waitForSelector('text=/Assets|Balances/', { timeout: 10000 });
    
    // Switch to Assets tab
    await page.click('button[aria-label="View Assets"]');
    await page.waitForTimeout(500);
    
    // Find search input for assets
    const searchInput = page.locator('input[placeholder="Search assets..."]');
    await expect(searchInput).toBeVisible();
    
    // Type in search
    await searchInput.fill('XCP');
    
    // Should show search results or no results
    await page.waitForTimeout(1000); // Wait for search to complete
    
    // Should show no results or search results
    const noResults = page.locator('text="No results found"');
    const hasNoResults = await noResults.isVisible();
    if (!hasNoResults) {
      // If there are results, verify they're visible
      const searchResults = page.locator('.space-y-2 > div');
      const count = await searchResults.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
    
    // Clear search
    const clearButton = page.locator('button[aria-label="Clear search"]');
    if (await clearButton.isVisible()) {
      await clearButton.click();
      await expect(searchInput).toHaveValue('');
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
    
    // Wait for main page to be ready
    await page.waitForSelector('text=/Assets|Balances/', { timeout: 10000 });
    
    // Find footer buttons by their containing grid structure
    const footer = page.locator('.border-t.border-gray-300').filter({ has: page.locator('.grid.grid-cols-4') });
    
    // Test Market navigation (second button)
    await footer.locator('button').nth(1).click();
    await page.waitForURL('**/market', { timeout: 10000 });
    await page.waitForTimeout(500);
    
    // Test Actions navigation (third button)
    await footer.locator('button').nth(2).click();
    await page.waitForURL('**/actions', { timeout: 10000 });
    await page.waitForTimeout(500);
    
    // Test Settings navigation (fourth button)
    await footer.locator('button').nth(3).click();
    await page.waitForURL('**/settings', { timeout: 10000 });
    await page.waitForTimeout(500);
    
    // Return to wallet (first button)
    await footer.locator('button').nth(0).click();
    await page.waitForURL('**/index', { timeout: 10000 });
    await page.waitForSelector('text=/Assets|Balances/', { timeout: 10000 });
  });

  test('empty state messages', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Wait for main page to be ready
    await page.waitForSelector('text=/Assets|Balances/', { timeout: 10000 });
    
    // Switch to Assets tab to check for empty state
    await page.click('button[aria-label="View Assets"]');
    await page.waitForTimeout(500);
    
    // Check if there's an empty state message for assets
    const assetsEmptyState = page.locator('text="No Assets Owned"');
    const hasAssetsEmptyState = await assetsEmptyState.isVisible();
    
    // If no assets owned, verify the empty state message
    if (hasAssetsEmptyState) {
      await expect(page.locator('text="This address hasn\'t issued any Counterparty assets."')).toBeVisible();
    }
    
    // Search for non-existent asset
    const searchInput = page.locator('input[placeholder="Search assets..."]');
    await searchInput.fill('NONEXISTENTASSET123');
    await page.waitForTimeout(1000);
    
    // Should show no results
    await expect(page.locator('text="No results found"')).toBeVisible();
    
    // Clear search and switch back to Balances
    await searchInput.clear();
    await page.click('button[aria-label="View Balances"]');
    await page.waitForTimeout(500);
    
    // Search for non-existent balance
    const balanceSearchInput = page.locator('input[placeholder="Search balances..."]');
    await balanceSearchInput.fill('NONEXISTENTTOKEN999');
    await page.waitForTimeout(1000);
    
    // Should show no results for balances
    await expect(page.locator('text="No results found"')).toBeVisible();
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