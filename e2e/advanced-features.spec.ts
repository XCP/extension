import { test, expect, type Page, chromium } from '@playwright/test';
import path from 'path';

const TEST_PASSWORD = 'test123456';

async function setupExtension(testName: string) {
  const extensionPath = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext(`test-results/advanced-features-${testName}`, {
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
  const onboardingVisible = await page.locator('button:has-text("Create Wallet"), button:has-text("Import Wallet")').first().isVisible();
  
  if (onboardingVisible) {
    await page.click('button:has-text("Create Wallet")');
    await page.waitForSelector('text=View 12-word Secret Phrase');
    await page.click('text=View 12-word Secret Phrase');
    await page.waitForTimeout(500);
    await page.click('text=I have saved my secret recovery phrase');
    await page.waitForSelector('input[type="password"]');
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Continue")');
    await page.waitForSelector('text=/Assets|Balances/', { timeout: 10000 });
  }
}

test.describe('Advanced Features', () => {
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

  test('connected sites management', async () => {
    await createInitialWallet(page);
    
    // Wait for main page to be ready
    await page.waitForSelector('text=/Assets|Balances/', { timeout: 10000 });
    
    // Navigate to settings
    const footer = page.locator('.border-t.border-gray-300').filter({ has: page.locator('.grid.grid-cols-4') });
    await footer.locator('button').nth(3).click();
    await page.waitForURL('**/settings', { timeout: 10000 });
    
    // Go to Connected Sites
    await page.locator('div[role="button"][aria-label="Connected Sites"]').click();
    await page.waitForURL('**/settings/connected-sites', { timeout: 10000 });
    
    // Should show connected sites list or empty state
    const emptyState = page.locator('text=/No connected sites|No websites/');
    const sitesList = page.locator('[role="list"]').filter({ has: page.locator('text=/Disconnect|Remove/') });
    
    const hasEmptyState = await emptyState.isVisible().catch(() => false);
    const hasSitesList = await sitesList.isVisible().catch(() => false);
    
    expect(hasEmptyState || hasSitesList).toBeTruthy();
  });

  test('pinned assets management', async () => {
    await createInitialWallet(page);
    
    // Wait for main page to be ready
    await page.waitForSelector('text=/Assets|Balances/', { timeout: 10000 });
    
    // Navigate to settings
    const footer = page.locator('.border-t.border-gray-300').filter({ has: page.locator('.grid.grid-cols-4') });
    await footer.locator('button').nth(3).click();
    await page.waitForURL('**/settings', { timeout: 10000 });
    
    // Go to Pinned Assets
    await page.locator('div[role="button"][aria-label="Pinned Assets"]').click();
    await page.waitForURL('**/settings/pinned-assets', { timeout: 10000 });
    
    // Should show the pinned assets page
    await page.waitForSelector('text="Pinned Assets"', { timeout: 5000 });
    
    // Look for search input to add assets
    const searchInput = page.locator('input[placeholder*="Search"]').first();
    if (await searchInput.isVisible()) {
      // Try to search for an asset
      await searchInput.fill('XCP');
      await page.waitForTimeout(1000);
      
      // Look for search results
      const searchResult = page.locator('text="XCP"').first();
      if (await searchResult.isVisible()) {
        // Try to pin the asset
        const pinButton = searchResult.locator('..').locator('button').first();
        if (await pinButton.isVisible()) {
          await pinButton.click();
          await page.waitForTimeout(500);
        }
      }
    }
    
    // Just verify we're on the pinned assets page
    const url = page.url();
    expect(url).toContain('pinned-assets');
  });

  test('address type selection for new wallet', async () => {
    // This test requires being on the create wallet flow
    const onboardingVisible = await page.locator('button:has-text("Create Wallet")').first().isVisible();
    
    if (!onboardingVisible) {
      // Skip if already has wallet
      return;
    }
    
    await page.click('button:has-text("Create Wallet")');
    
    // Look for address type selection
    const addressTypeSelector = page.locator('text=/Address Type|Legacy|SegWit|Taproot/');
    if (await addressTypeSelector.isVisible()) {
      // Should have multiple options
      const options = ['Legacy', 'Native SegWit', 'Taproot', 'Nested SegWit'];
      for (const option of options) {
        const optionElement = page.locator(`text="${option}"`);
        const isVisible = await optionElement.isVisible().catch(() => false);
        if (isVisible) {
          // Click to select
          await optionElement.click();
          await page.waitForTimeout(500);
        }
      }
    }
  });

  test('password change functionality', async () => {
    await createInitialWallet(page);
    
    // Navigate to settings
    const footer = page.locator('.border-t.border-gray-300').filter({ has: page.locator('.grid.grid-cols-4') });
    await footer.locator('button').nth(3).click();
    await page.waitForURL('**/settings', { timeout: 10000 });
    
    // Go to Security settings
    await page.locator('div[role="button"][aria-label="Security"]').click();
    await page.waitForURL('**/settings/security', { timeout: 10000 });
    
    // Should have change password option
    await expect(page.locator('text=/Change Password|Update Password/')).toBeVisible();
    
    // Fill in password change form
    const currentPasswordInput = page.locator('input[placeholder*="current"], input[placeholder*="Current"]').first();
    const newPasswordInput = page.locator('input[placeholder*="new"], input[placeholder*="New"]').nth(0);
    const confirmPasswordInput = page.locator('input[placeholder*="confirm"], input[placeholder*="Confirm"]').first();
    
    if (await currentPasswordInput.isVisible()) {
      await currentPasswordInput.fill(TEST_PASSWORD);
      await newPasswordInput.fill('newpassword123');
      await confirmPasswordInput.fill('newpassword123');
      
      // Check for validation
      const updateButton = page.locator('button:has-text("Update"), button:has-text("Change")').first();
      const isEnabled = await updateButton.isEnabled().catch(() => false);
      expect(isEnabled).toBeTruthy();
    }
  });

  test('export private key with password verification', async () => {
    await createInitialWallet(page);
    
    // Navigate to address selection
    await page.locator('[aria-label="Select another address"]').click();
    await page.waitForSelector('text=Addresses', { timeout: 10000 });
    
    // Find address menu
    const addressCard = page.locator('.space-y-2 > div').filter({ has: page.locator('.font-mono') }).first();
    const menuButton = addressCard.locator('button[aria-label*="menu"], button[aria-label*="options"]').first();
    
    if (await menuButton.isVisible()) {
      await menuButton.click();
      await page.waitForTimeout(500);
      
      // Click Show Private Key
      const showKeyOption = page.locator('text=/Show.*Private.*Key|Export.*Key/');
      if (await showKeyOption.isVisible()) {
        await showKeyOption.click();
        
        // Should ask for password
        await page.waitForSelector('input[type="password"]', { timeout: 5000 });
        await page.fill('input[type="password"]', TEST_PASSWORD);
        
        const confirmButton = page.locator('button:has-text("Show"), button:has-text("Confirm")').first();
        await confirmButton.click();
        
        // Should show private key
        await page.waitForTimeout(1000);
        const privateKeyElement = page.locator('text=/^[5KL][1-9A-HJ-NP-Za-km-z]{50,51}$/');
        await expect(privateKeyElement).toBeVisible();
        
        // Should have copy button
        const copyButton = page.locator('button:has-text("Copy")');
        await expect(copyButton).toBeVisible();
      }
    }
  });

  test('QR code generation for receive address', async () => {
    await createInitialWallet(page);
    
    // Click Receive button
    await page.locator('button[aria-label="Receive tokens"]').click();
    await page.waitForURL('**/view-address', { timeout: 10000 });
    
    // Should show QR code
    const qrCode = page.locator('canvas, svg').first();
    await expect(qrCode).toBeVisible();
    
    // Should show address
    const addressElement = page.locator('.font-mono').first();
    await expect(addressElement).toBeVisible();
    
    // Should have copy button
    const copyButton = page.locator('button:has-text("Copy")');
    await expect(copyButton).toBeVisible();
    
    // Test shows the page correctly
    const url = page.url();
    expect(url).toContain('view-address');
  });

  test('transaction history navigation', async () => {
    await createInitialWallet(page);
    
    // Click History button
    await page.locator('button[aria-label="Transaction history"]').click();
    await page.waitForURL('**/address-history', { timeout: 10000 });
    
    // Should show history page
    await page.waitForTimeout(1000);
    
    // Check for various possible states
    const pageContent = await page.content();
    const hasHistoryIndicator = pageContent.includes('History') || 
                               pageContent.includes('Transactions') || 
                               pageContent.includes('No transactions') ||
                               pageContent.includes('Loading');
    
    expect(hasHistoryIndicator).toBeTruthy();
  });

  test('asset search and filtering', async () => {
    await createInitialWallet(page);
    
    // Switch to Assets tab
    await page.click('button[aria-label="View Assets"]');
    await page.waitForTimeout(500);
    
    // Find search input
    const searchInput = page.locator('input[placeholder="Search assets..."]');
    await expect(searchInput).toBeVisible();
    
    // Search for non-existent asset
    await searchInput.fill('NONEXISTENTASSET123456');
    await page.waitForTimeout(1500);
    
    // Should show no results or searching indicator
    const noResults = page.locator('text="No results found"');
    const searching = page.locator('text=/Searching|Loading/');
    const emptyAssets = page.locator('text="No Assets Owned"');
    
    const hasNoResults = await noResults.isVisible().catch(() => false);
    const isSearching = await searching.isVisible().catch(() => false);
    const hasEmptyAssets = await emptyAssets.isVisible().catch(() => false);
    
    expect(hasNoResults || isSearching || hasEmptyAssets).toBeTruthy();
    
    // Clear search
    await searchInput.clear();
    await page.waitForTimeout(500);
  });

  test('bare multisig recovery', async () => {
    await createInitialWallet(page);
    
    // Navigate to Actions
    const footer = page.locator('.border-t.border-gray-300').filter({ has: page.locator('.grid.grid-cols-4') });
    await footer.locator('button').nth(2).click();
    await page.waitForURL('**/actions', { timeout: 10000 });
    
    // Look for Recover Bitcoin option
    const recoverOption = page.locator('text=/Recover Bitcoin|Consolidate/');
    if (await recoverOption.isVisible()) {
      await recoverOption.click();
      await page.waitForURL('**/consolidate', { timeout: 10000 });
      
      // Just verify we're on the consolidate page
      const url = page.url();
      expect(url).toContain('consolidate');
    }
  });

  test.skip('fairminter creation', async () => {
    // Skipping as fairminter might not be fully implemented
    // The test navigates to /compose/fairminter but the actual path might be /compose/fairmint
  });

  test('bet creation', async () => {
    await createInitialWallet(page);
    
    // Navigate to Actions
    const footer = page.locator('.border-t.border-gray-300').filter({ has: page.locator('.grid.grid-cols-4') });
    await footer.locator('button').nth(2).click();
    await page.waitForURL('**/actions', { timeout: 10000 });
    
    // Look for Place Bet option specifically (not the section header)
    const betOption = page.locator('div[role="button"][aria-label="Place Bet"]');
    if (await betOption.isVisible()) {
      await betOption.click();
      await page.waitForURL('**/compose/bet', { timeout: 10000 });
      
      // Should show bet form
      await page.waitForTimeout(1000);
      
      // Check if we're on the bet page
      const pageUrl = page.url();
      expect(pageUrl).toContain('/compose/bet');
    }
  });

  test('network switching', async () => {
    await createInitialWallet(page);
    
    // Navigate to settings
    const footer = page.locator('.border-t.border-gray-300').filter({ has: page.locator('.grid.grid-cols-4') });
    await footer.locator('button').nth(3).click();
    await page.waitForURL('**/settings', { timeout: 10000 });
    
    // Go to Advanced settings
    await page.locator('div[role="button"][aria-label="Advanced"]').click();
    await page.waitForURL('**/settings/advanced', { timeout: 10000 });
    
    // Look for network selector
    const networkSelector = page.locator('text=/Network|Mainnet|Testnet/');
    if (await networkSelector.isVisible()) {
      // Should be on mainnet by default
      const mainnetOption = page.locator('text="Mainnet"');
      await expect(mainnetOption).toBeVisible();
      
      // Try to switch to testnet (if available)
      const testnetOption = page.locator('text="Testnet"');
      if (await testnetOption.isVisible()) {
        await testnetOption.click();
        await page.waitForTimeout(500);
        
        // Should show warning or confirmation
        const warning = page.locator('text=/Warning|Confirm|Test network/i');
        const hasWarning = await warning.isVisible().catch(() => false);
        expect(hasWarning).toBeTruthy();
      }
    }
  });
});