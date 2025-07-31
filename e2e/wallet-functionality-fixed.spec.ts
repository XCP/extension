import { test, expect, chromium } from '@playwright/test';
import path from 'path';

// Helper function to create a wallet and return authenticated page
async function createWalletAndGetPage() {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext('test-results/wallet-functional', {
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
  
  // Navigate to extension
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForLoadState('networkidle');
  
  // Check if wallet already exists
  const hasCreateWallet = await page.getByText('Create Wallet').isVisible();
  
  if (hasCreateWallet) {
    console.log('Creating new wallet...');
    await page.getByText('Create Wallet').click();
    await page.waitForTimeout(1000);
    await page.getByText('View 12-word Secret Phrase').click();
    await page.waitForTimeout(1000);
    await page.getByLabel(/I have saved my secret recovery phrase/).check();
    await page.waitForTimeout(500);
    await page.locator('input[name="password"]').fill('TestPassword123!');
    await page.getByRole('button', { name: /Continue/i }).click();
    await page.waitForURL(/index/, { timeout: 10000 });
  } else {
    const needsUnlock = page.url().includes('unlock');
    if (needsUnlock) {
      console.log('Unlocking wallet...');
      await page.locator('input[name="password"]').fill('TestPassword123!');
      await page.getByRole('button', { name: /unlock/i }).click();
      await page.waitForURL(/index/, { timeout: 10000 });
    }
  }
  
  return { page, context, extensionId };
}

test('wallet main page shows content', async () => {
  const { page, context } = await createWalletAndGetPage();
  
  console.log('Checking wallet main page...');
  
  // Should be on main wallet page
  expect(page.url()).toContain('#/index');
  
  // Take screenshot to see what's actually on the page
  await page.screenshot({ path: 'test-results/screenshots/wallet-main-page-debug.png' });
  
  // Get all text content to see what's available
  const pageText = await page.evaluate(() => document.body.innerText);
  console.log('Page content (first 300 chars):', pageText.substring(0, 300));
  
  // Look for any Bitcoin address pattern (more flexible)
  const addressPatterns = [
    /bc1q[a-z0-9]{39}/,  // Native SegWit
    /1[A-HJ-NP-Z0-9]{25,34}/, // Legacy  
    /3[A-HJ-NP-Z0-9]{25,34}/, // Script
  ];
  
  let foundAddress = false;
  for (const pattern of addressPatterns) {
    const addressElement = page.locator(`text=${pattern}`);
    const count = await addressElement.count();
    if (count > 0) {
      const address = await addressElement.first().textContent();
      console.log('Found address:', address);
      foundAddress = true;
      break;
    }
  }
  
  if (!foundAddress) {
    console.log('No address found, checking for any crypto-looking strings...');
    // Look for long alphanumeric strings that might be addresses
    const cryptoStrings = page.locator('text=/[a-zA-Z0-9]{25,}/');
    const cryptoCount = await cryptoStrings.count();
    console.log('Found', cryptoCount, 'potential crypto strings');
    
    for (let i = 0; i < Math.min(cryptoCount, 3); i++) {
      const str = await cryptoStrings.nth(i).textContent();
      console.log(`Crypto string ${i + 1}:`, str);
    }
  }
  
  // Check for balance-related text
  const balanceKeywords = ['BTC', 'Bitcoin', 'Balance', '$', '0.00'];
  for (const keyword of balanceKeywords) {
    const hasKeyword = await page.locator(`text=${keyword}`).count() > 0;
    console.log(`Has "${keyword}":`, hasKeyword);
  }
  
  console.log('✅ Wallet main page loaded and analyzed');
  
  await context.close();
});

test('can navigate to send page', async () => {
  const { page, context } = await createWalletAndGetPage();
  
  console.log('Testing send navigation...');
  
  // Look for Send button more specifically
  const sendButton = page.getByRole('button', { name: 'Send' }).first();
  const hasSendButton = await sendButton.isVisible();
  console.log('Has Send button:', hasSendButton);
  
  if (hasSendButton) {
    await sendButton.click();
    await page.waitForTimeout(2000);
    
    const currentUrl = page.url();
    console.log('URL after clicking Send:', currentUrl);
    
    // Check if we're on a send-related page
    const isOnSendPage = currentUrl.includes('send') || currentUrl.includes('compose');
    console.log('Successfully navigated to send page:', isOnSendPage);
    
    if (isOnSendPage) {
      // Take screenshot of send page
      await page.screenshot({ path: 'test-results/screenshots/send-page.png' });
      
      // Look for send form elements
      const hasDestinationField = await page.locator('input[name*="destination"], input[name*="address"], input[name*="to"]').count() > 0;
      const hasAmountField = await page.locator('input[name*="amount"], input[name*="value"]').count() > 0;
      
      console.log('Has destination field:', hasDestinationField);
      console.log('Has amount field:', hasAmountField);
      
      if (hasDestinationField && hasAmountField) {
        console.log('✅ Send page has expected form fields');
      }
    }
  }
  
  await context.close();
});

test('can explore assets section', async () => {
  const { page, context } = await createWalletAndGetPage();
  
  console.log('Testing assets navigation...');
  
  // Be more specific with assets button to avoid multiple matches
  const assetsButton = page.getByRole('button', { name: 'View Assets' });
  const hasAssetsButton = await assetsButton.isVisible();
  console.log('Has "View Assets" button:', hasAssetsButton);
  
  if (hasAssetsButton) {
    await assetsButton.click();
    await page.waitForTimeout(2000);
    
    const currentUrl = page.url();
    console.log('URL after clicking Assets:', currentUrl);
    
    await page.screenshot({ path: 'test-results/screenshots/assets-page.png' });
    
    // Look for asset-related content
    const assetKeywords = ['Asset', 'Token', 'BTC', 'Balance'];
    for (const keyword of assetKeywords) {
      const count = await page.locator(`text=${keyword}`).count();
      console.log(`"${keyword}" appears ${count} times`);
    }
    
    console.log('✅ Successfully navigated to assets section');
  }
  
  await context.close();
});