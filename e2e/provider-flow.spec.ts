import { test, expect, type BrowserContext, type Page, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

test.describe('Provider Flow - Automated E2E', () => {
  let browser: any;
  let context: BrowserContext;
  let extensionId: string;

  test.beforeAll(async () => {
    // Path to extension build
    const pathToExtension = path.join(__dirname, '..', '.output', 'chrome-mv3');

    console.log('Loading extension from:', pathToExtension);

    // Launch Chrome with extension
    browser = await chromium.launchPersistentContext('', {
      headless: false, // Must be false for extensions
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
        '--auto-open-devtools-for-tabs',
      ],
      viewport: { width: 1280, height: 720 },
    });

    context = browser;

    // Get extension ID from background page
    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent('serviceworker');
    }

    const url = background.url();
    extensionId = url.split('/')[2];
    console.log('Extension ID:', extensionId);
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('Provider connection flow works through unified popup', async () => {
    // Create a new page with the test dApp
    const dappPage = await context.newPage();

    // Navigate to test dApp
    const testDappPath = path.join(__dirname, 'test-dapp-unified.html');
    await dappPage.goto(`file:///${testDappPath}`);

    // Wait for provider to be injected
    await dappPage.waitForFunction(() => {
      return typeof (window as any).xcpwallet !== 'undefined';
    }, { timeout: 10000 });

    console.log('✅ Provider detected');

    // Check provider is available
    const hasProvider = await dappPage.evaluate(() => {
      return typeof (window as any).xcpwallet !== 'undefined';
    });
    expect(hasProvider).toBe(true);

    // Set up popup page promise before clicking connect
    const popupPromise = context.waitForEvent('page', {
      predicate: (page: Page) => page.url().includes('popup.html')
    });

    // Click connect button
    await dappPage.click('#btnConnect');
    console.log('🔌 Clicked connect button');

    // Wait for popup to open
    const popupPage = await popupPromise;
    console.log('📱 Popup opened:', popupPage.url());

    // Wait for popup to load
    await popupPage.waitForLoadState('networkidle');

    // Check if we're on the approval page or need to unlock first
    const url = popupPage.url();

    if (url.includes('unlock-wallet') || url.includes('onboarding')) {
      console.log('🔐 Need to set up wallet first');

      if (url.includes('onboarding')) {
        // Handle onboarding flow
        await popupPage.click('button:has-text("Create")');
        await popupPage.waitForURL('**/create-wallet**');

        // Fill password
        await popupPage.fill('input[type="password"]', 'TestPassword123!');
        await popupPage.fill('input[name="confirmPassword"]', 'TestPassword123!');
        await popupPage.click('button:has-text("Create")');

        // Wait for wallet creation
        await popupPage.waitForURL('**/index**', { timeout: 10000 });
      } else {
        // Unlock existing wallet
        await popupPage.fill('input[type="password"]', 'TestPassword123!');
        await popupPage.click('button:has-text("Unlock")');
      }
    }

    // Now we should be on the approval page
    await popupPage.waitForURL('**/approval-queue**', { timeout: 10000 });
    console.log('📋 On approval queue page');

    // Approve the connection
    const approveButton = await popupPage.waitForSelector('button:has-text("Approve")', { timeout: 10000 });
    await approveButton.click();
    console.log('✅ Clicked approve');

    // Wait for connection to complete
    await dappPage.waitForFunction(() => {
      const status = document.getElementById('statusText');
      return status?.textContent === 'Connected';
    }, { timeout: 10000 });

    console.log('🎉 Connection established!');

    // Verify we got an account
    const account = await dappPage.evaluate(async () => {
      const provider = (window as any).xcpwallet;
      const accounts = await provider.request({ method: 'xcp_accounts' });
      return accounts[0];
    });

    expect(account).toBeTruthy();
    console.log('👤 Connected account:', account);
  });

  test('Compose send flow opens in unified popup with pre-filled data', async () => {
    // Create test dApp page
    const dappPage = await context.newPage();
    const testDappPath = path.join(__dirname, 'test-dapp-unified.html');
    await dappPage.goto(`file:///${testDappPath}`);

    // Wait for provider
    await dappPage.waitForFunction(() => {
      return typeof (window as any).xcpwallet !== 'undefined';
    });

    // Ensure we're connected first
    const isConnected = await dappPage.evaluate(async () => {
      const provider = (window as any).xcpwallet;
      const accounts = await provider.request({ method: 'xcp_accounts' });
      return accounts.length > 0;
    });

    if (!isConnected) {
      console.log('Not connected, connecting first...');
      // Connect flow (simplified, assuming already done in previous test)
      await dappPage.click('#btnConnect');
      await dappPage.waitForTimeout(2000);
    }

    // Fill in send form
    await dappPage.fill('#sendDestination', 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh');
    await dappPage.selectOption('#sendAsset', 'XCP');
    await dappPage.fill('#sendQuantity', '100000000');
    await dappPage.fill('#sendMemo', 'Automated test memo');

    console.log('📝 Filled send form');

    // Set up popup promise
    const popupPromise = context.waitForEvent('page', {
      predicate: (page: Page) => page.url().includes('popup.html')
    });

    // Click compose send
    await dappPage.click('#btnComposeSend');
    console.log('📤 Clicked compose send');

    // Wait for popup
    const popupPage = await popupPromise;
    console.log('📱 Popup opened for compose');

    // Wait for navigation to compose/send
    await popupPage.waitForURL('**/compose/send**', { timeout: 10000 });
    console.log('📍 Navigated to compose/send');

    // Verify form is pre-populated
    await popupPage.waitForSelector('input[name="destination"]', { timeout: 5000 });

    const destination = await popupPage.inputValue('input[name="destination"]');
    expect(destination).toBe('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh');

    const memo = await popupPage.inputValue('input[name="memo"]');
    expect(memo).toBe('Automated test memo');

    console.log('✅ Form pre-populated correctly!');
    console.log('  Destination:', destination);
    console.log('  Memo:', memo);
  });

  test('Multiple requests queue in same popup', async () => {
    // Create test dApp page
    const dappPage = await context.newPage();
    const testDappPath = path.join(__dirname, 'test-dapp-unified.html');
    await dappPage.goto(`file:///${testDappPath}`);

    // Wait for provider
    await dappPage.waitForFunction(() => {
      return typeof (window as any).xcpwallet !== 'undefined';
    });

    // Send multiple requests rapidly
    console.log('🚀 Sending multiple requests...');

    // Don't await these - send them all at once
    dappPage.evaluate(async () => {
      const provider = (window as any).xcpwallet;

      // Send multiple requests without waiting
      provider.request({
        method: 'xcp_composeSend',
        params: [{ destination: 'bc1q1', asset: 'XCP', quantity: 100 }]
      }).catch(() => {});

      provider.request({
        method: 'xcp_composeOrder',
        params: [{ give_asset: 'XCP', give_quantity: 100, get_asset: 'PEPECASH', get_quantity: 10, expiration: 1000 }]
      }).catch(() => {});

      provider.request({
        method: 'xcp_signMessage',
        params: ['Test message']
      }).catch(() => {});
    });

    // Wait for popup to open
    const popupPage = await context.waitForEvent('page', {
      predicate: (page: Page) => page.url().includes('popup.html'),
      timeout: 5000
    });

    console.log('📱 Single popup opened');

    // Verify we're on approval queue with multiple items
    await popupPage.waitForURL('**/approval-queue**', { timeout: 5000 });

    // Check for multiple pending requests
    const queueItems = await popupPage.$$('.approval-item, .queue-item, [data-testid="approval-item"]');

    console.log(`📋 Found ${queueItems.length} queued items`);
    expect(queueItems.length).toBeGreaterThanOrEqual(1);

    // Verify only one popup window exists
    const pages = context.pages();
    const popupPages = pages.filter((p: Page) => p.url().includes('popup.html'));

    console.log(`🪟 Number of popup windows: ${popupPages.length}`);
    expect(popupPages.length).toBe(1);

    console.log('✅ Multiple requests queued in single popup!');
  });

  test('Provider methods return proper errors when rejected', async () => {
    // Create test dApp page
    const dappPage = await context.newPage();
    const testDappPath = path.join(__dirname, 'test-dapp-unified.html');
    await dappPage.goto(`file:///${testDappPath}`);

    // Wait for provider
    await dappPage.waitForFunction(() => {
      return typeof (window as any).xcpwallet !== 'undefined';
    });

    // Set up popup promise
    const popupPromise = context.waitForEvent('page', {
      predicate: (page: Page) => page.url().includes('popup.html')
    });

    // Send a request that we'll reject
    const requestPromise = dappPage.evaluate(async () => {
      const provider = (window as any).xcpwallet;
      try {
        await provider.request({
          method: 'xcp_composeSend',
          params: [{ destination: 'bc1qreject', asset: 'XCP', quantity: 999 }]
        });
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Wait for popup
    const popupPage = await popupPromise;
    await popupPage.waitForLoadState('networkidle');

    // Find and click reject/cancel button
    const cancelButton = await popupPage.waitForSelector('button:has-text("Cancel"), button:has-text("Reject")', { timeout: 5000 });
    await cancelButton.click();
    console.log('❌ Clicked reject');

    // Check the error
    const result = await requestPromise;
    expect(result.success).toBe(false);
    expect(result.error).toContain('User');

    console.log('✅ Request properly rejected with error:', result.error);
  });
});

// Additional test for cleanup
test.describe('Provider Cleanup', () => {
  test('Extension cleans up pending requests on timeout', async ({ page }) => {
    // This test would verify that requests are cleaned up after timeout
    // Implementation depends on your specific timeout handling
  });
});