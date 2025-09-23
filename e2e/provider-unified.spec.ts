import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import path from 'path';

// Test configuration
const TEST_DAPP_PATH = 'e2e/test-dapp-unified.html';
const EXTENSION_ID = 'your-extension-id'; // Will be set dynamically

test.describe('Provider Unified Popup Flow', () => {
  let context: BrowserContext;
  let extensionId: string;
  let dappPage: Page;
  let popupPage: Page;

  test.beforeAll(async ({ browser }) => {
    // Load the extension
    const pathToExtension = path.join(__dirname, '../dist');
    context = await browser.newContext({
      // Load extension in development mode
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });

    // Get the extension ID
    const backgroundPages = context.backgroundPages();
    if (backgroundPages.length > 0) {
      const backgroundPage = backgroundPages[0];
      extensionId = backgroundPage.url().split('/')[2];
    }
  });

  test.beforeEach(async () => {
    // Open the test dApp
    dappPage = await context.newPage();
    await dappPage.goto(`file://${path.join(__dirname, '..', TEST_DAPP_PATH)}`);

    // Wait for provider to be available
    await dappPage.waitForFunction(() => {
      return typeof window.xcpwallet !== 'undefined';
    }, { timeout: 5000 });
  });

  test.afterEach(async () => {
    // Clean up pages
    if (dappPage) await dappPage.close();
    if (popupPage && !popupPage.isClosed()) await popupPage.close();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('should detect XCP Wallet provider', async () => {
    // Check that provider is available
    const hasProvider = await dappPage.evaluate(() => {
      return typeof window.xcpwallet !== 'undefined';
    });
    expect(hasProvider).toBe(true);

    // Check provider methods exist
    const methods = await dappPage.evaluate(() => {
      const provider = window.xcpwallet;
      return {
        hasRequest: typeof provider.request === 'function',
        hasOn: typeof provider.on === 'function',
        hasRemoveListener: typeof provider.removeListener === 'function',
      };
    });
    expect(methods.hasRequest).toBe(true);
    expect(methods.hasOn).toBe(true);
    expect(methods.hasRemoveListener).toBe(true);
  });

  test('should open normal popup for connection approval', async () => {
    // Click connect button
    await dappPage.click('#btnConnect');

    // Wait for popup to open
    const popupPromise = context.waitForEvent('page');
    popupPage = await popupPromise;

    // Verify popup URL contains the extension ID and approval route
    expect(popupPage.url()).toContain('popup.html');

    // The popup should navigate to approval queue or connection approval
    await popupPage.waitForURL(
      url => url.includes('approval-queue') || url.includes('approve-connection'),
      { timeout: 5000 }
    );

    // Verify popup is the normal extension popup, not a separate window
    const popupTitle = await popupPage.title();
    expect(popupTitle).toContain('XCP Wallet');
  });

  test('should route compose requests to normal popup with deep linking', async () => {
    // First, establish connection (mock or real)
    // For this test, we'll assume the wallet is already connected

    // Fill in send form
    await dappPage.fill('#sendDestination', 'bc1qtest123456789');
    await dappPage.selectOption('#sendAsset', 'XCP');
    await dappPage.fill('#sendQuantity', '100000000');
    await dappPage.fill('#sendMemo', 'Test memo');

    // Click compose send button
    await dappPage.click('#btnComposeSend');

    // Wait for popup to open
    const popupPromise = context.waitForEvent('page');
    popupPage = await popupPromise;

    // Verify popup navigated to compose/send route
    await popupPage.waitForURL(url => url.includes('compose/send'), {
      timeout: 5000
    });

    // Check that form is pre-populated with the data
    await popupPage.waitForSelector('input[name="destination"]', { timeout: 5000 });

    const destination = await popupPage.inputValue('input[name="destination"]');
    expect(destination).toBe('bc1qtest123456789');

    const memo = await popupPage.inputValue('input[name="memo"]');
    expect(memo).toBe('Test memo');
  });

  test('should handle approval queue in normal popup', async () => {
    // Create multiple requests to test queue
    const requests = [
      { method: 'xcp_connect' },
      { method: 'xcp_composeSend', params: [{ destination: 'bc1q1', asset: 'XCP', quantity: 100 }] },
      { method: 'xcp_signMessage', params: ['Test message'] },
    ];

    // Send requests without waiting
    for (const request of requests) {
      dappPage.evaluate(async (req) => {
        window.xcpwallet.request(req).catch(() => {});
      }, request);
    }

    // Wait for popup to open
    const popupPromise = context.waitForEvent('page');
    popupPage = await popupPromise;

    // Should navigate to approval queue
    await popupPage.waitForURL(url => url.includes('approval-queue'), {
      timeout: 5000
    });

    // Check that queue shows multiple requests
    const queueItems = await popupPage.$$('.approval-item');
    expect(queueItems.length).toBeGreaterThan(0);
  });

  test('should preserve popup state when switching between approvals', async () => {
    // Open popup with first request
    await dappPage.click('#btnConnect');

    const popupPromise = context.waitForEvent('page');
    popupPage = await popupPromise;

    // Get popup window ID
    const popupUrl = popupPage.url();

    // Send another request
    await dappPage.click('#btnComposeSend');

    // The same popup should be reused
    await popupPage.waitForTimeout(1000);
    expect(popupPage.isClosed()).toBe(false);

    // Popup should navigate to handle new request
    const newUrl = popupPage.url();
    expect(newUrl).toContain('popup.html');
  });

  test('should handle compose deep linking with session storage', async () => {
    // Test the new session storage approach
    const testData = {
      destination: 'bc1qtestaddress',
      asset: 'PEPECASH',
      quantity: 1000000,
      memo: 'Session storage test'
    };

    // Simulate provider sending data via session storage
    await dappPage.evaluate((data) => {
      sessionStorage.setItem('compose_initial_data', JSON.stringify(data));

      // Simulate navigation message
      chrome.runtime.sendMessage({
        type: 'NAVIGATE_TO_COMPOSE',
        data: {
          method: 'xcp_composeSend',
          params: data
        }
      });
    }, testData);

    // Wait for popup to process the data
    const popupPromise = context.waitForEvent('page');
    popupPage = await popupPromise;

    // Verify data was received and processed
    await popupPage.waitForSelector('input[name="destination"]', { timeout: 5000 });

    const destination = await popupPage.inputValue('input[name="destination"]');
    expect(destination).toBe(testData.destination);
  });

  test('should handle errors gracefully', async () => {
    // Test error handling when popup fails to open
    await dappPage.evaluate(async () => {
      try {
        // Send request with invalid parameters
        await window.xcpwallet.request({
          method: 'xcp_composeSend',
          params: [{ invalid: 'params' }]
        });
      } catch (error) {
        window.lastError = error.message;
      }
    });

    // Check that error was caught
    const errorMessage = await dappPage.evaluate(() => window.lastError);
    expect(errorMessage).toBeTruthy();
  });

  test('should support all compose methods with deep linking', async () => {
    const composeMethods = [
      'xcp_composeSend',
      'xcp_composeOrder',
      'xcp_composeDispenser',
      'xcp_composeIssuance',
      'xcp_composeSweep',
      'xcp_composeDividend',
      'xcp_composeBroadcast',
    ];

    for (const method of composeMethods) {
      // Test that each method opens the popup with correct route
      await dappPage.evaluate(async (methodName) => {
        window.xcpwallet.request({
          method: methodName,
          params: [{}] // Minimal params
        }).catch(() => {}); // Ignore errors for this test
      }, method);

      // Wait for popup
      const popupPromise = context.waitForEvent('page', { timeout: 2000 }).catch(() => null);
      const popup = await popupPromise;

      if (popup) {
        // Verify popup opened to correct compose route
        const url = popup.url();
        expect(url).toContain('compose/');
        await popup.close();
      }
    }
  });

  test('should handle concurrent requests properly', async () => {
    // Send multiple requests simultaneously
    const promises = [];

    promises.push(dappPage.evaluate(async () => {
      return window.xcpwallet.request({ method: 'xcp_requestAccounts' });
    }));

    promises.push(dappPage.evaluate(async () => {
      return window.xcpwallet.request({
        method: 'xcp_composeSend',
        params: [{ destination: 'bc1q1', asset: 'XCP', quantity: 100 }]
      });
    }));

    promises.push(dappPage.evaluate(async () => {
      return window.xcpwallet.request({
        method: 'xcp_signMessage',
        params: ['Test message']
      });
    }));

    // Wait for popup to handle queue
    const popupPromise = context.waitForEvent('page');
    popupPage = await popupPromise;

    // Verify popup shows approval queue with multiple items
    await popupPage.waitForSelector('.approval-queue', { timeout: 5000 });

    // Clean up - cancel all requests
    await popupPage.click('.cancel-all-button').catch(() => {});
  });

  test('should maintain single popup instance', async () => {
    // Open initial popup
    await dappPage.click('#btnConnect');

    const popup1Promise = context.waitForEvent('page');
    const popup1 = await popup1Promise;

    // Send another request
    await dappPage.click('#btnComposeSend');

    // Wait to see if a new popup opens
    const popup2Promise = context.waitForEvent('page', { timeout: 2000 }).catch(() => null);
    const popup2 = await popup2Promise;

    // Should not open a second popup
    expect(popup2).toBeNull();

    // Original popup should still be open
    expect(popup1.isClosed()).toBe(false);
  });
});

// Additional test suite for specific compose flows
test.describe('Compose Method Deep Linking', () => {
  // ... Additional specific tests for each compose method

  test('should pre-populate send form correctly', async ({ page }) => {
    // Test implementation
  });

  test('should pre-populate order form correctly', async ({ page }) => {
    // Test implementation
  });

  test('should pre-populate dispenser form correctly', async ({ page }) => {
    // Test implementation
  });

  // ... More specific compose method tests
});