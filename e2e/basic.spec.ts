import { test, expect, chromium } from '@playwright/test';
import path from 'path';

test('extension loads', async () => {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  
  // Launch browser with extension
  const context = await chromium.launchPersistentContext('test-results/basic', {
    headless: false,
    args: [
      `--disable-extensions-except=${pathToExtension}`,
      `--load-extension=${pathToExtension}`,
    ],
  });

  // Wait for extension to load
  console.log('Waiting for service worker...');
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker');
  }
  
  const extensionId = serviceWorker.url().split('/')[2];
  console.log('Extension ID:', extensionId);

  // Open extension popup
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  
  // Wait for page to load
  await page.waitForLoadState('networkidle');
  
  // Take a screenshot to see what we have
  await page.screenshot({ path: 'test-results/screenshots/extension-loaded.png' });
  
  // Just check that we can access the page
  const title = await page.title();
  console.log('Page title:', title);
  
  // Check if there's any content
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('Page content (first 100 chars):', bodyText.substring(0, 100));
  
  await context.close();
});