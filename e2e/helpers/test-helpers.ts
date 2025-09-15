import { chromium, BrowserContext, Page } from '@playwright/test';
import path from 'path';

// Constants
export const TEST_PASSWORD = 'TestPassword123!';
export const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
export const TEST_PRIVATE_KEY = 'L1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd';


// Test data
export const TEST_ADDRESSES = {
  GENESIS: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', // Genesis block address
  TAPROOT: 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0',
  SEGWIT: 'bc1qtest123',
  LEGACY: '1TestAddress123456789',
};

export interface ExtensionContext {
  context: BrowserContext;
  page: Page;
  extensionId: string;
}

/**
 * Launch the extension with proper setup
 * @param testName - Unique test name for the user data directory
 * @returns Extension context with browser, page, and extension ID
 */
export async function launchExtension(testName: string): Promise<ExtensionContext> {
  // Use dev build for idle timer tests to access development-only features
  const isIdleTimerTest = testName.includes('idle');
  const pathToExtension = path.resolve(isIdleTimerTest ? '.output/chrome-mv3-dev' : '.output/chrome-mv3');
  
  // Determine if we're running in CI environment
  const isCI = process.env.CI === 'true';
  
  // CI-specific configuration
  const ciTimeoutMultiplier = isCI ? 2 : 1;  // Double timeouts in CI
  const ciRetryMultiplier = isCI ? 1.5 : 1;  // More retries in CI
  
  
  // Launch browser with extension with retry logic
  let context;
  let attempts = 0;
  const maxAttempts = Math.ceil(3 * ciRetryMultiplier);
  
  while (attempts < maxAttempts) {
    try {
      
      context = await chromium.launchPersistentContext(`test-results/${testName}`, {
        headless: false,  // Always use headed mode (with xvfb in CI)
        args: [
          '--no-sandbox',  // Required for CI environments
          '--disable-setuid-sandbox',  // Required for CI environments
          '--disable-dev-shm-usage',  // Required for CI environments
          '--disable-gpu',  // Better compatibility
          '--disable-web-security',  // Allow extension to work properly
          '--disable-features=IsolateOrigins,site-per-process',  // Better extension compatibility
          `--disable-extensions-except=${pathToExtension}`,
          `--load-extension=${pathToExtension}`,
        ],
        // Increase timeout for CI
        timeout: 30000 * ciTimeoutMultiplier,
      });
      break; // Success, exit loop
    } catch (error) {
      attempts++;
      console.error(`[Test Helper] Launch attempt ${attempts} failed:`, (error as any).message);
      if (attempts === maxAttempts) {
        throw error;
      }
      // Wait longer before retry in CI
      const retryDelay = isCI ? 3000 : 2000;
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  if (!context) {
    throw new Error('Failed to launch browser context after retries');
  }

  // Wait for extension to load with multiple strategies
  
  let extensionId: string | null = null;
  let serviceWorker = null;
  let retries = 0;
  const maxRetries = Math.ceil(15 * ciRetryMultiplier);  // More retries in CI
  const retryDelay = isCI ? 5000 : 3000;  // Longer delays in CI
  const eventTimeout = isCI ? 20000 : 10000;  // Longer timeout in CI
  
  // Initial wait to let the extension start
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Strategy 1: Wait for service worker
  while (!serviceWorker && retries < maxRetries) {
    retries++;
    // Check if service worker already exists
    const workers = context.serviceWorkers();
    
    if (workers.length > 0) {
      serviceWorker = workers[0];
      const swUrl = serviceWorker.url();
      // Try to extract extension ID from service worker URL
      const match = swUrl.match(/chrome-extension:\/\/([^\/]+)/);
      if (match) {
        extensionId = match[1];
      }
      break;
    }
    
    // Try waiting for service worker event
    try {
      serviceWorker = await context.waitForEvent('serviceworker', { timeout: eventTimeout });
      const swUrl = serviceWorker.url();
      // Try to extract extension ID from service worker URL
      const match = swUrl.match(/chrome-extension:\/\/([^\/]+)/);
      if (match) {
        extensionId = match[1];
      }
      break;
    } catch (e) {
    }
    
    // Check pages for extension URLs (fallback)
    const pages = context.pages();
    for (const p of pages) {
      const url = p.url();
      if (url.includes('chrome-extension://')) {
        const match = url.match(/chrome-extension:\/\/([^\/]+)/);
        if (match) {
          extensionId = match[1];
          break;
        }
      }
    }
    
    if (extensionId) break;
    
    // Check background pages (another fallback)
    const backgroundPages = context.backgroundPages();
    if (backgroundPages.length > 0) {
      const bgUrl = backgroundPages[0].url();
      const match = bgUrl.match(/chrome-extension:\/\/([^\/]+)/);
      if (match) {
        extensionId = match[1];
        break;
      }
    }
    
    // Wait before next retry
    if (retries < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  // Extract extension ID if we found service worker
  if (serviceWorker && !extensionId) {
    const swUrl = serviceWorker.url();
    extensionId = swUrl.split('/')[2];
  }
  
  // Final fallback: Try to navigate to chrome://extensions and get ID
  if (!extensionId && isCI) {
    const tempPage = await context.newPage();
    
    // Give extension more time to initialize
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check all contexts again
    const workers = context.serviceWorkers();
    if (workers.length > 0) {
      const swUrl = workers[0].url();
      extensionId = swUrl.split('/')[2];
    }
    
    await tempPage.close();
  }
  
  if (!extensionId) {
    console.error(`[Test Helper] Failed to get extension ID after all attempts`);
    console.error(`[Test Helper] Service workers: ${context.serviceWorkers().length}`);
    console.error(`[Test Helper] Pages: ${context.pages().map(p => p.url()).join(', ')}`);
    console.error(`[Test Helper] Background pages: ${context.backgroundPages().map(p => p.url()).join(', ')}`);
    throw new Error('Could not determine extension ID after all retries and fallback strategies');
  }
  
  // Create new page and navigate to extension
  const page = await context.newPage();
  const popupUrl = `chrome-extension://${extensionId}/popup.html`;
  
  // Try navigation with retry for CI reliability
  let navAttempts = 0;
  const maxNavAttempts = isCI ? 3 : 1;
  
  while (navAttempts < maxNavAttempts) {
    try {
      await page.goto(popupUrl, { timeout: 30000 * ciTimeoutMultiplier });
      await page.waitForLoadState('networkidle', { timeout: 30000 * ciTimeoutMultiplier });
      break;
    } catch (error) {
      navAttempts++;
      console.error(`[Test Helper] Navigation attempt ${navAttempts} failed:`, (error as any).message);
      if (navAttempts === maxNavAttempts) {
        throw new Error(`Failed to navigate to extension after ${maxNavAttempts} attempts: ${(error as any).message}`);
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  return { context, page, extensionId };
}

/**
 * Create a new wallet with default settings
 * @param page - The page object
 * @param password - Password for the wallet (defaults to TEST_PASSWORD)
 */
export async function createWallet(page: Page, password: string = TEST_PASSWORD): Promise<void> {
  // Click Create Wallet button - wait for it to be visible first
  await page.waitForSelector('text=Create Wallet', { timeout: 5000 });
  await page.getByText('Create Wallet').click();
  await page.waitForTimeout(1000);
  
  // Reveal phrase - click the area that contains "View 12-word Secret Phrase"
  await page.waitForSelector('text=View 12-word Secret Phrase', { timeout: 5000 });
  await page.getByText('View 12-word Secret Phrase').click();
  await page.waitForTimeout(1000);
  
  // Confirm and submit
  await page.getByLabel(/I have saved my secret recovery phrase/).check();
  await page.waitForTimeout(500);
  
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: /Continue/i }).click();
  
  // Wait for redirect to index
  await page.waitForURL(/index/, { timeout: 10000 });
}

/**
 * Import a wallet with a mnemonic
 * @param page - The page object
 * @param mnemonic - The mnemonic phrase
 * @param password - Password for the wallet
 */
export async function importWallet(
  page: Page, 
  mnemonic: string = TEST_MNEMONIC, 
  password: string = TEST_PASSWORD
): Promise<void> {
  // Click Import Wallet
  await page.getByText('Import Wallet').click();
  await page.waitForTimeout(1000);
  
  // Enter mnemonic words individually
  const words = mnemonic.split(' ');
  for (let i = 0; i < words.length && i < 12; i++) {
    const input = page.locator(`input[name="word-${i}"]`);
    await input.fill(words[i]);
  }
  
  // Check the confirmation checkbox
  const checkbox = page.getByLabel(/I have saved my secret recovery phrase/);
  await checkbox.check();
  await page.waitForTimeout(500);
  
  // Enter password
  await page.locator('input[name="password"]').fill(password);
  
  // Submit
  await page.getByRole('button', { name: /Continue/i }).click();
  
  // Wait for redirect to index
  await page.waitForURL(/index/, { timeout: 10000 });
}

/**
 * Import a wallet with a private key
 * @param page - The page object
 * @param privateKey - The private key
 * @param password - Password for the wallet
 */
export async function importPrivateKey(
  page: Page,
  privateKey: string = TEST_PRIVATE_KEY,
  password: string = TEST_PASSWORD
): Promise<void> {
  // Click Import Wallet
  await page.getByText('Import Wallet').click();
  await page.waitForTimeout(1000);
  
  // Switch to private key tab
  await page.getByText('Private Key').click();
  
  // Enter private key
  await page.locator('input[placeholder*="private key"]').fill(privateKey);
  
  // Enter password
  await page.locator('input[name="password"]').fill(password);
  
  // Submit
  await page.getByRole('button', { name: /Import/i }).click();
  
  // Wait for redirect to index
  await page.waitForURL(/index/, { timeout: 10000 });
}

/**
 * Unlock an existing wallet
 * @param page - The page object
 * @param password - Password for the wallet
 */
export async function unlockWallet(page: Page, password: string = TEST_PASSWORD): Promise<void> {
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: /unlock/i }).click();
  await page.waitForURL(/index/, { timeout: 5000 });
}

/**
 * Lock the wallet
 * @param page - The page object
 */
export async function lockWallet(page: Page): Promise<void> {
  // Find the lock button - it's typically the last button in the header
  const headerButtons = await page.locator('header button, nav button').all();
  if (headerButtons.length > 0) {
    // Click the last button (should be lock)
    await headerButtons[headerButtons.length - 1].click();
    await page.waitForTimeout(1000);
    
    // Verify we're on unlock page
    await page.waitForURL(/unlock/, { timeout: 5000 });
  }
}

/**
 * Setup wallet - creates, imports, or unlocks as needed
 * @param page - The page object
 * @param password - Password for the wallet
 */
export async function setupWallet(page: Page, password: string = TEST_PASSWORD): Promise<void> {
  // Check if we need to create a wallet
  const hasCreateWallet = await page.getByText('Create Wallet').isVisible().catch(() => false);
  const needsUnlock = page.url().includes('unlock');
  
  if (hasCreateWallet) {
    await createWallet(page, password);
  } else if (needsUnlock) {
    await unlockWallet(page, password);
  }
}

/**
 * Navigate to a specific page via footer navigation
 * @param page - The page object
 * @param target - The target page ('wallet', 'market', 'actions', 'settings')
 */
export async function navigateViaFooter(page: Page, target: 'wallet' | 'market' | 'actions' | 'settings'): Promise<void> {
  // First check if we're on a valid page
  const currentUrl = page.url();
  if (currentUrl.includes('404') || (await page.locator('text="Not Found"').isVisible({ timeout: 500 }).catch(() => false))) {
    // Navigate to index first if on 404
    const baseUrl = currentUrl.split('#')[0];
    await page.goto(`${baseUrl}#/index`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
  }
  
  // Try to find footer - multiple possible selectors
  const footerSelectors = [
    'div.grid.grid-cols-4',
    'div.p-2.bg-white.border-t',
    'div:has(> div.grid.grid-cols-4)'
  ];
  
  let footerFound = false;
  for (const selector of footerSelectors) {
    const footer = page.locator(selector).first();
    if (await footer.isVisible({ timeout: 1000 }).catch(() => false)) {
      footerFound = true;
      const buttonIndex = {
        'wallet': 0,
        'market': 1,
        'actions': 2,
        'settings': 3
      };
      
      const index = buttonIndex[target];
      const footerButton = footer.locator('button').nth(index);
      
      if (await footerButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await footerButton.click();
        await page.waitForTimeout(1000);
        
        // Wait for navigation
        const urlPattern = target === 'wallet' ? /index/ : new RegExp(target);
        await page.waitForURL(`**/${target === 'wallet' ? 'index' : target}`, { timeout: 5000 }).catch(() => {});
        return;
      }
    }
  }
  
  // If footer not found, navigate directly
  if (!footerFound) {
    const baseUrl = currentUrl.split('#')[0];
    const targetPath = target === 'wallet' ? 'index' : target;
    await page.goto(`${baseUrl}#/${targetPath}`);
    await page.waitForLoadState('networkidle');
  }
}

/**
 * Add a new address to the current wallet
 * @param page - The page object
 * @param label - Optional label for the address
 */
export async function addAddress(page: Page, label?: string): Promise<void> {
  // Navigate to addresses
  await page.click('text=Manage Addresses');
  await page.waitForURL(/addresses/, { timeout: 5000 });
  
  // Click add address
  await page.click('button:has-text("Add Address")');
  
  // Fill label if provided
  if (label) {
    await page.locator('input[placeholder*="Label"]').fill(label);
  }
  
  // Confirm
  await page.click('button:has-text("Add")');
  await page.waitForTimeout(1000);
}

/**
 * Switch to a different wallet
 * @param page - The page object
 * @param walletName - The name of the wallet to switch to
 */
export async function switchWallet(page: Page, walletName: string): Promise<void> {
  // Click wallet selector in header
  const walletButton = page.locator('header button').first();
  await walletButton.click();
  
  // Wait for wallet list
  await page.waitForURL(/select-wallet/, { timeout: 5000 });
  
  // Click on the wallet
  await page.click(`text=${walletName}`);
  
  // Wait for redirect to index
  await page.waitForURL(/index/, { timeout: 5000 });
}

/**
 * Send a transaction
 * @param page - The page object
 * @param recipient - The recipient address
 * @param amount - The amount to send
 * @param asset - The asset to send (default: 'BTC')
 */
export async function sendTransaction(
  page: Page,
  recipient: string,
  amount: string,
  asset: string = 'BTC'
): Promise<void> {
  // Click Send button
  await page.click('button:has-text("Send")');
  await page.waitForURL(/compose\/send/, { timeout: 5000 });
  
  // Select asset if not BTC
  if (asset !== 'BTC') {
    await page.locator('input[placeholder*="Search"]').fill(asset);
    await page.click(`text=${asset}`);
  }
  
  // Fill recipient
  await page.locator('input[placeholder*="recipient"]').fill(recipient);
  
  // Fill amount
  await page.locator('input[placeholder*="amount"]').fill(amount);
  
  // Click Send
  await page.click('button:has-text("Send")');
  
  // Handle confirmation if needed
  const confirmButton = page.locator('button:has-text("Confirm")');
  if (await confirmButton.isVisible({ timeout: 2000 })) {
    await confirmButton.click();
  }
}

/**
 * Wait for a specific balance to appear
 * @param page - The page object
 * @param asset - The asset to check
 * @param expectedBalance - The expected balance (optional)
 */
export async function waitForBalance(
  page: Page,
  asset: string,
  expectedBalance?: string
): Promise<void> {
  // Wait for balance list to load
  await page.waitForSelector(`text=${asset}`, { timeout: 10000 });
  
  if (expectedBalance) {
    await page.waitForSelector(`text=${expectedBalance}`, { timeout: 10000 });
  }
}

/**
 * Take a screenshot with a descriptive name
 * @param page - The page object
 * @param name - The name for the screenshot
 */
export async function takeScreenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({ 
    path: `test-results/screenshots/${name}-${Date.now()}.png`,
    fullPage: true 
  });
}

/**
 * Clean up and close the extension context
 * @param context - The browser context to close
 */
export async function cleanup(context: BrowserContext): Promise<void> {
  try {
    // Give any pending operations a moment to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Close all pages first to ensure clean shutdown
    const pages = context.pages();
    for (const page of pages) {
      try {
        await page.close();
      } catch (e) {
        // Page might already be closed
      }
    }
    
    // Now close the context
    await context.close();
  } catch (error) {
    console.error(`[Test Helper] Error during cleanup:`, (error as any).message);
    // Force close if gentle close fails
    try {
      await context.close();
    } catch (e) {
      console.error(`[Test Helper] Force close also failed:`, (e as any).message);
    }
  }
}

/**
 * Get the current address displayed on the page
 * @param page - The page object
 * @returns The current address
 */
export async function getCurrentAddress(page: Page): Promise<string> {
  const addressElement = page.locator('.font-mono').first();
  const address = await addressElement.textContent();
  return address || '';
}

/**
 * Check if an error message is displayed
 * @param page - The page object
 * @param errorText - Optional specific error text to check for
 */
export async function hasError(page: Page, errorText?: string): Promise<boolean> {
  if (errorText) {
    return page.locator(`text=${errorText}`).isVisible({ timeout: 2000 }).catch(() => false);
  }
  return page.locator('.text-red-600, .bg-red-50').isVisible({ timeout: 2000 }).catch(() => false);
}

/**
 * Fill and submit a form
 * @param page - The page object
 * @param formData - Object with form field selectors and values
 */
export async function fillForm(page: Page, formData: Record<string, string>): Promise<void> {
  for (const [selector, value] of Object.entries(formData)) {
    await page.locator(selector).fill(value);
  }
}

/**
 * Wait for a specific element to disappear
 * @param page - The page object
 * @param selector - The selector for the element
 */
export async function waitForElementToDisappear(page: Page, selector: string): Promise<void> {
  await page.waitForSelector(selector, { state: 'hidden', timeout: 10000 });
}

/**
 * Grant permissions for clipboard operations
 * @param context - The browser context
 */
export async function grantClipboardPermissions(context: BrowserContext): Promise<void> {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
}

/**
 * Wait for a specific element with timeout
 * @param page - The page object
 * @param selector - The selector for the element
 * @param timeout - Timeout in milliseconds (default 5000)
 */
export async function waitForElement(page: Page, selector: string, timeout: number = 5000): Promise<void> {
  await page.waitForSelector(selector, { state: 'visible', timeout });
}

/**
 * Fill send transaction form
 * @param page - The page object
 * @param recipient - The recipient address
 * @param amount - The amount to send
 */
export async function fillSendForm(page: Page, recipient: string, amount: string): Promise<void> {
  // Fill recipient
  const recipientInput = page.locator('input[placeholder*="recipient"], input[placeholder*="address"], input[name="destination"]');
  await recipientInput.fill(recipient);
  
  // Fill amount
  const amountInput = page.locator('input[placeholder*="amount"], input[name="amount"], input[type="number"]');
  await amountInput.fill(amount);
}

/**
 * Search for assets or balances
 * @param page - The page object
 * @param searchTerm - The search term
 */
export async function searchAssets(page: Page, searchTerm: string): Promise<void> {
  const searchInput = page.locator('input[placeholder*="Search"], input[placeholder*="search"], input[type="search"]').first();
  await searchInput.fill(searchTerm);
  await page.waitForTimeout(500); // Wait for search results
}

/**
 * Switch between tabs (Assets/Balances)
 * @param page - The page object
 * @param tabName - The tab name ('Assets' or 'Balances')
 */
export async function switchTab(page: Page, tabName: 'Assets' | 'Balances'): Promise<void> {
  // Try multiple selectors for tabs
  const tabSelectors = [
    `button[aria-label="View ${tabName}"]`,
    `button:has-text("${tabName}")`,
    `[role="tab"]:has-text("${tabName}")`,
    `text="${tabName}"`
  ];
  
  for (const selector of tabSelectors) {
    const tab = page.locator(selector).first();
    if (await tab.isVisible({ timeout: 1000 }).catch(() => false)) {
      await tab.click();
      await page.waitForTimeout(500);
      return;
    }
  }
}

/**
 * Verify balance for a specific asset
 * @param page - The page object
 * @param asset - The asset name
 * @param expectedAmount - The expected amount
 */
export async function verifyBalance(page: Page, asset: string, expectedAmount: string): Promise<boolean> {
  try {
    // Wait for the balance to be visible
    await page.waitForSelector(`text="${asset}"`, { timeout: 5000 });
    
    // Check if expected amount is visible near the asset
    const balanceVisible = await page.locator(`text="${expectedAmount}"`).isVisible({ timeout: 2000 });
    return balanceVisible;
  } catch {
    return false;
  }
}

/**
 * Get extension ID from service worker or background page
 * @param context - The browser context
 */
export async function getExtensionId(context: BrowserContext): Promise<string> {
  // First try service workers (most reliable for MV3)
  let serviceWorkers = context.serviceWorkers();
  if (serviceWorkers.length === 0) {
    // Wait for service worker to be registered
    const serviceWorker = await context.waitForEvent('serviceworker', { timeout: 10000 }).catch(() => null);
    if (serviceWorker) {
      serviceWorkers = context.serviceWorkers();
    }
  }
  
  if (serviceWorkers.length > 0) {
    const url = serviceWorkers[0].url();
    const match = url.match(/chrome-extension:\/\/([^\/]+)/);
    if (match) return match[1];
  }
  
  // Fallback: get from background pages
  const extensions = await context.backgroundPages();
  if (extensions.length > 0) {
    const url = extensions[0].url();
    const match = url.match(/chrome-extension:\/\/([^\/]+)/);
    if (match) return match[1];
  }
  
  throw new Error('Could not find extension ID');
}

/**
 * Navigate to compose page for a specific action
 * @param page - The page object
 * @param action - The action type (send, sweep, dispenser, etc.)
 */
export async function navigateToCompose(page: Page, action: string): Promise<void> {
  await page.goto(page.url().replace(/\/[^\/]*$/, `/compose/${action}`));
  await page.waitForLoadState('networkidle');
}

/**
 * Check if wallet is locked
 * @param page - The page object
 */
export async function isWalletLocked(page: Page): Promise<boolean> {
  return page.url().includes('unlock');
}

/**
 * Get all visible addresses in the address list
 * @param page - The page object
 */
export async function getAddressList(page: Page): Promise<string[]> {
  const addresses = await page.locator('.font-mono').allTextContents();
  return addresses.filter(addr => addr.length > 0);
}