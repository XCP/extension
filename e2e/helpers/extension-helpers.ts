import { Page, BrowserContext } from '@playwright/test';

/**
 * Helper functions for testing browser extension functionality
 */

/**
 * Wait for the extension's service worker to be ready
 */
export async function waitForServiceWorker(context: BrowserContext, timeout = 30000) {
  let [background] = context.serviceWorkers();
  if (!background) {
    background = await context.waitForEvent('serviceworker', { timeout });
  }
  
  // Give the service worker time to fully initialize
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  return background;
}

/**
 * Get the extension ID from the service worker URL
 */
export function getExtensionId(serviceWorkerUrl: string): string {
  return serviceWorkerUrl.split('/')[2];
}

/**
 * Navigate to extension page and wait for it to load
 */
export async function navigateToExtension(page: Page, extensionId: string, path = '') {
  const url = `chrome-extension://${extensionId}/popup.html${path}`;
  await page.goto(url, { waitUntil: 'networkidle' });
  
  // Give React time to render
  await page.waitForTimeout(1000);
}

/**
 * Create a wallet through the UI
 */
export async function createWallet(page: Page, password: string) {
  // Click Create Wallet button
  await page.getByRole('button', { name: /Create Wallet/i }).click();
  
  // Wait for navigation to create wallet page
  await page.waitForURL(/#\/create-wallet$/, { timeout: 10000 });
  
  // Click to reveal the recovery phrase
  await page.getByText(/View 12-word Secret Phrase/).click();
  
  // Wait a moment for the phrase to be revealed
  await page.waitForTimeout(500);
  
  // Check the confirmation checkbox
  await page.getByLabel(/I have saved my secret recovery phrase/).check();
  
  // Wait for password input to appear
  await page.waitForSelector('input[name="password"]', { state: 'visible' });
  
  // Fill in the password
  await page.fill('input[name="password"]', password);
  
  // Click Continue
  await page.getByRole('button', { name: /Continue/i }).click();
}

/**
 * Check if wallet was created successfully
 */
export async function verifyWalletCreated(page: Page) {
  try {
    // Wait for redirect to main page
    await page.waitForURL(/#\/index$/, { timeout: 10000 });
    
    // Wait for wallet address to appear
    await page.waitForSelector('text=bc1q', { timeout: 5000 });
    
    return true;
  } catch (error) {
    // Check for error message
    const errorElement = await page.locator('.text-red-600').first();
    if (await errorElement.isVisible()) {
      const errorText = await errorElement.textContent();
      console.error('Wallet creation error:', errorText);
    }
    return false;
  }
}

/**
 * Get extension storage data
 */
export async function getExtensionStorage(page: Page, key: string) {
  return await page.evaluate((storageKey) => {
    return new Promise((resolve) => {
      chrome.storage.local.get(storageKey, (result) => {
        resolve(result[storageKey]);
      });
    });
  }, key);
}

/**
 * Set extension storage data
 */
export async function setExtensionStorage(page: Page, data: Record<string, any>) {
  return await page.evaluate((storageData) => {
    return new Promise((resolve) => {
      chrome.storage.local.set(storageData, () => {
        resolve(true);
      });
    });
  }, data);
}

/**
 * Clear all extension storage
 */
export async function clearExtensionStorage(page: Page) {
  return await page.evaluate(() => {
    return new Promise((resolve) => {
      chrome.storage.local.clear(() => {
        resolve(true);
      });
    });
  });
}