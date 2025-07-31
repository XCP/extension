import { test } from '@playwright/test';
import path from 'path';

test('verify background script and proxy service connection', async ({ browser }) => {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  
  // Launch with extension
  const context = await browser.newContext({
    args: [
      `--disable-extensions-except=${pathToExtension}`,
      `--load-extension=${pathToExtension}`,
    ],
  });

  // Wait for service worker
  console.log('[Test] Waiting for service worker...');
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker', { timeout: 30000 });
  }
  console.log('[Test] Service worker found:', serviceWorker.url());
  
  const extensionId = serviceWorker.url().split('/')[2];
  
  // Give service worker MORE time to initialize
  console.log('[Test] Waiting 5 seconds for full initialization...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Create a page and try to communicate with background
  const page = await context.newPage();
  
  // Navigate to extension
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForLoadState('networkidle');
  
  // Test 1: Check if chrome.runtime is available
  const hasRuntime = await page.evaluate(() => {
    return typeof chrome !== 'undefined' && typeof chrome.runtime !== 'undefined';
  });
  console.log('[Test] Has chrome.runtime:', hasRuntime);
  
  // Test 2: Try to send a message to background
  console.log('[Test] Testing message to background...');
  const messageResult = await page.evaluate(async () => {
    try {
      // Try sending a test message
      const response = await chrome.runtime.sendMessage({ type: 'test' });
      return { success: true, response };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  console.log('[Test] Message result:', messageResult);
  
  // Test 3: Check if webext-bridge is working
  console.log('[Test] Testing webext-bridge...');
  const bridgeTest = await page.evaluate(async () => {
    try {
      // Check if the proxy service functions exist
      const win = window as any;
      
      // Log what's available on window
      const extensionAPIs = Object.keys(win).filter(k => 
        k.includes('wallet') || 
        k.includes('service') || 
        k.includes('proxy') ||
        k.includes('bridge')
      );
      
      return {
        apis: extensionAPIs,
        hasGetWalletService: typeof win.getWalletService === 'function',
      };
    } catch (error) {
      return { error: error.message };
    }
  });
  console.log('[Test] Bridge test:', bridgeTest);
  
  // Test 4: Try to access storage directly
  console.log('[Test] Testing direct storage access...');
  const storageTest = await page.evaluate(async () => {
    try {
      const result = await chrome.storage.local.get();
      return { success: true, keys: Object.keys(result) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  console.log('[Test] Storage test:', storageTest);
  
  // Test 5: Check background script logs
  console.log('[Test] Checking service worker console...');
  serviceWorker.on('console', msg => {
    console.log(`[Service Worker Console]: ${msg.text()}`);
  });
  
  // Try to trigger wallet creation to see what happens
  console.log('[Test] Navigating to trigger wallet flow...');
  await page.goto(`chrome-extension://${extensionId}/popup.html#/onboarding`);
  await page.waitForTimeout(2000);
  
  // Click create wallet
  const createButton = page.getByRole('button', { name: /Create Wallet/i });
  if (await createButton.isVisible()) {
    console.log('[Test] Found create button, clicking...');
    await createButton.click();
    
    // Wait a bit to see if navigation works
    await page.waitForTimeout(2000);
    console.log('[Test] Current URL after click:', page.url());
  }
  
  // Keep open for debugging
  await page.waitForTimeout(30000);
  
  await context.close();
});