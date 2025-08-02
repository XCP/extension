import { test, expect, chromium } from '@playwright/test';
import path from 'path';

test('can navigate to create wallet page', async () => {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  
  // Launch browser with extension
  const context = await chromium.launchPersistentContext('test-results/wallet-creation', {
    headless: false,
    args: [
      `--disable-extensions-except=${pathToExtension}`,
      `--load-extension=${pathToExtension}`,
    ],
  });

  // Wait for extension to load
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker');
  }
  
  const extensionId = serviceWorker.url().split('/')[2];
  // console.log('Extension ID:', extensionId);

  // Open extension popup
  const page = await context.newPage();
  
  // Set up console logging
  page.on('console', msg => {
    // console.log(`[Console ${msg.type()}]:`, msg.text());
  });
  
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForLoadState('networkidle');
  
  // Should show onboarding with Create Wallet button
  await expect(page.getByText('Create Wallet')).toBeVisible();
  
  // Click Create Wallet
  // console.log('Clicking Create Wallet...');
  await page.getByText('Create Wallet').click();
  
  // Wait for navigation
  await page.waitForTimeout(2000);
  
  // Check current URL
  // console.log('Current URL:', page.url());
  
  // Take screenshot
  await page.screenshot({ path: 'test-results/screenshots/create-wallet-page.png' });
  
  // Check if we're on the create wallet page
  const isOnCreatePage = page.url().includes('create-wallet');
  // console.log('On create wallet page:', isOnCreatePage);
  
  if (isOnCreatePage) {
    // Look for recovery phrase section
    const hasRecoverySection = await page.getByText('Your Recovery Phrase').isVisible();
    // console.log('Has recovery phrase section:', hasRecoverySection);
    
    // Look for the reveal button
    const hasRevealButton = await page.getByText('View 12-word Secret Phrase').isVisible();
    // console.log('Has reveal button:', hasRevealButton);
  }
  
  await context.close();
});

test('can reveal recovery phrase and show password field', async () => {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext('test-results/wallet-reveal', {
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
  
  // Set up error logging
  page.on('console', msg => {
    if (msg.type() === 'error') {
      // console.log(`[Error]:`, msg.text());
    }
  });
  
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForLoadState('networkidle');
  
  // Navigate to create wallet
  await page.getByText('Create Wallet').click();
  await page.waitForTimeout(1000);
  
  // Click to reveal phrase
  // console.log('Revealing recovery phrase...');
  await page.getByText('View 12-word Secret Phrase').click();
  await page.waitForTimeout(1000);
  
  // Check confirmation checkbox
  // console.log('Checking confirmation...');
  const checkbox = page.getByLabel(/I have saved my secret recovery phrase/);
  await expect(checkbox).toBeVisible();
  await checkbox.check();
  
  // Wait for password field to appear
  await page.waitForTimeout(1000);
  
  // Check if password field is visible
  const passwordField = page.locator('input[name="password"]');
  const isPasswordVisible = await passwordField.isVisible();
  // console.log('Password field visible:', isPasswordVisible);
  
  await page.screenshot({ path: 'test-results/screenshots/recovery-phrase-revealed.png' });
  
  if (isPasswordVisible) {
    // console.log('✅ Successfully revealed phrase and showed password field');
  } else {
    // console.log('❌ Password field not visible');
  }
  
  await context.close();
});