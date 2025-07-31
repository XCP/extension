import { test, expect } from './fixtures-v2';
import { waitForProxyServices } from './helpers/extension-init';
import { TEST_PASSWORD } from './helpers/auth-helpers';

test('debug: detailed wallet creation flow', async ({ context, extensionId }) => {
  const page = await context.newPage();
  
  console.log('[Debug] Starting detailed wallet creation test...');
  
  // Navigate to extension
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForLoadState('networkidle');
  
  // Ensure proxy services are ready
  await waitForProxyServices(page);
  
  // Set up console logging
  page.on('console', msg => {
    console.log(`[Browser Console ${msg.type()}]:`, msg.text());
  });
  
  // Set up request logging to see API calls
  page.on('request', request => {
    if (request.url().includes('chrome-extension://')) {
      console.log(`[Request]: ${request.method()} ${request.url()}`);
    }
  });
  
  page.on('response', response => {
    if (response.url().includes('chrome-extension://')) {
      console.log(`[Response]: ${response.status()} ${response.url()}`);
    }
  });
  
  // Check current URL
  console.log('[Debug] Current URL:', page.url());
  await page.screenshot({ path: 'debug-1-initial.png' });
  
  // Click Create Wallet
  console.log('[Debug] Looking for Create Wallet button...');
  const createButton = page.getByRole('button', { name: /Create Wallet/i });
  await expect(createButton).toBeVisible({ timeout: 5000 });
  await createButton.click();
  
  // Wait for navigation
  await page.waitForURL(/#\/create-wallet$/, { timeout: 10000 });
  console.log('[Debug] On create wallet page');
  await page.screenshot({ path: 'debug-2-create-page.png' });
  
  // Click to reveal phrase
  console.log('[Debug] Revealing recovery phrase...');
  const viewPhraseButton = page.getByText(/View 12-word Secret Phrase/);
  await viewPhraseButton.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'debug-3-phrase-revealed.png' });
  
  // Check confirmation
  console.log('[Debug] Checking confirmation...');
  const checkbox = page.getByLabel(/I have saved my secret recovery phrase/);
  await checkbox.check();
  
  // Wait for password field
  await page.waitForSelector('input[name="password"]', { state: 'visible' });
  console.log('[Debug] Password field is visible');
  
  // Fill password
  await page.fill('input[name="password"]', TEST_PASSWORD);
  await page.screenshot({ path: 'debug-4-password-filled.png' });
  
  // Before clicking continue, let's check the background service
  console.log('[Debug] Checking extension storage before submit...');
  const storageBefore = await page.evaluate(() => chrome.storage.local.get());
  console.log('[Debug] Storage before:', storageBefore);
  
  // Also check if we can call the wallet service directly
  console.log('[Debug] Testing direct service call...');
  try {
    const serviceTest = await page.evaluate(async () => {
      // Try to access the service through the window if it's exposed
      const win = window as any;
      return {
        hasWalletService: !!win.walletService,
        hasGetWalletService: typeof win.getWalletService === 'function',
        // Try to list any global functions/objects that might be the service
        globals: Object.keys(win).filter(k => k.includes('wallet') || k.includes('service'))
      };
    });
    console.log('[Debug] Service test:', serviceTest);
  } catch (error) {
    console.log('[Debug] Service test error:', error);
  }
  
  // Click continue with detailed error catching
  console.log('[Debug] Clicking Continue...');
  const continueButton = page.getByRole('button', { name: /Continue/i });
  
  // Set up promise to catch navigation or error
  const resultPromise = Promise.race([
    page.waitForURL(/#\/index$/, { timeout: 15000 }).then(() => ({ type: 'success' })),
    page.waitForSelector('[role="alert"]', { timeout: 5000 }).then(async () => {
      const errorText = await page.locator('[role="alert"]').textContent();
      return { type: 'error', message: errorText };
    }),
    new Promise(resolve => setTimeout(() => resolve({ type: 'timeout' }), 15000))
  ]);
  
  await continueButton.click();
  const result = await resultPromise;
  
  console.log('[Debug] Result:', result);
  await page.screenshot({ path: 'debug-5-after-submit.png' });
  
  // Check storage after
  const storageAfter = await page.evaluate(() => chrome.storage.local.get());
  console.log('[Debug] Storage after:', storageAfter);
  
  // Check for any errors in the page
  const pageContent = await page.evaluate(() => document.body.innerText);
  console.log('[Debug] Page content:', pageContent);
  
  // Keep open for inspection
  await page.waitForTimeout(30000);
});