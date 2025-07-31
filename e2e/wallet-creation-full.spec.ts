import { test, expect, chromium } from '@playwright/test';
import path from 'path';

test('attempt full wallet creation', async () => {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext('test-results/wallet-full', {
    headless: false,
    args: [
      `--disable-extensions-except=${pathToExtension}`,
      `--load-extension=${pathToExtension}`,
    ],
  });

  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker');
  }
  
  const extensionId = serviceWorker.url().split('/')[2];
  const page = await context.newPage();
  
  // Log all console messages
  page.on('console', msg => {
    console.log(`[Console ${msg.type()}]:`, msg.text());
  });
  
  console.log('Step 1: Navigate to extension');
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForLoadState('networkidle');
  
  console.log('Step 2: Go to create wallet');
  await page.getByText('Create Wallet').click();
  await page.waitForTimeout(1000);
  
  console.log('Step 3: Reveal recovery phrase');
  await page.getByText('View 12-word Secret Phrase').click();
  await page.waitForTimeout(1000);
  
  console.log('Step 4: Check confirmation');
  const checkbox = page.getByLabel(/I have saved my secret recovery phrase/);
  await checkbox.check();
  await page.waitForTimeout(1000);
  
  console.log('Step 5: Enter password');
  const passwordField = page.locator('input[name="password"]');
  await passwordField.fill('TestPassword123!');
  
  console.log('Step 6: Submit form - this is where we expect issues');
  
  // Before submitting, let's check if we can access chrome.storage
  const storageTest = await page.evaluate(async () => {
    try {
      const result = await chrome.storage.local.get();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  console.log('Storage test before submit:', storageTest);
  
  // Click submit
  const continueButton = page.getByRole('button', { name: /Continue/i });
  await continueButton.click();
  
  console.log('Step 7: Wait to see what happens');
  
  // Wait and check result
  await page.waitForTimeout(5000);
  
  const currentUrl = page.url();
  console.log('URL after submit:', currentUrl);
  
  // Check for error message
  const errorElement = page.locator('[role="alert"]');
  const hasError = await errorElement.isVisible();
  console.log('Has error message:', hasError);
  
  if (hasError) {
    const errorText = await errorElement.textContent();
    console.log('Error message:', errorText);
  }
  
  // Check if redirected to success
  const isSuccess = currentUrl.includes('#/index');
  console.log('Redirected to success page:', isSuccess);
  
  if (isSuccess) {
    console.log('✅ Wallet creation succeeded!');
  } else {
    console.log('❌ Wallet creation failed');
  }
  
  await page.screenshot({ path: 'test-results/screenshots/wallet-creation-result.png' });
  
  // Check storage after attempt
  const storageAfter = await page.evaluate(async () => {
    try {
      const result = await chrome.storage.local.get();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  console.log('Storage after submit:', storageAfter);
  
  await context.close();
});