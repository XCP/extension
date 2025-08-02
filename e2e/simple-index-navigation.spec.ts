import { test, expect, chromium } from '@playwright/test';
import path from 'path';

const TEST_PASSWORD = 'TestPassword123!';

test('receive send history buttons', async () => {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext('test-results/index-buttons', {
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
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForLoadState('networkidle');
  
  // Ensure we have a wallet
  const needsWallet = await page.getByText('Create Wallet').isVisible().catch(() => false);
  if (needsWallet) {
    await page.getByText('Create Wallet').click();
    await page.waitForTimeout(1000);
    await page.getByText('View 12-word Secret Phrase').click();
    await page.waitForTimeout(1000);
    await page.getByLabel(/I have saved my secret recovery phrase/).check();
    await page.waitForTimeout(500);
    await page.locator('input[name="password"]').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /Continue/i }).click();
    await page.waitForURL(/index/, { timeout: 10000 });
  }
  
  // Test Receive button
  const receiveButton = page.getByText('Receive');
  if (await receiveButton.isVisible()) {
    // console.log('Testing Receive button...');
    await receiveButton.click();
    await page.waitForTimeout(1000);
    
    // Should show QR code
    const hasQR = await page.locator('canvas, img[alt*="QR"], [class*="qr"]').isVisible().catch(() => false);
    // console.log('Shows QR code:', hasQR);
    
    // Go back
    await page.goBack();
    await page.waitForTimeout(1000);
  }
  
  // Test Send button
  const sendButton = page.getByText('Send');
  if (await sendButton.isVisible()) {
    // console.log('Testing Send button...');
    await sendButton.click();
    await page.waitForTimeout(1000);
    
    // Should be on send page
    const onSendPage = page.url().includes('send') || await page.getByText(/Recipient|Destination/i).isVisible().catch(() => false);
    // console.log('On send page:', onSendPage);
    
    // Go back
    await page.goBack();
    await page.waitForTimeout(1000);
  }
  
  // Test History button
  const historyButton = page.getByText('History');
  if (await historyButton.isVisible()) {
    // console.log('Testing History button...');
    await historyButton.click();
    await page.waitForTimeout(1000);
    
    // Should be on history page
    const onHistoryPage = page.url().includes('history') || await page.getByText(/Transaction|History/i).isVisible().catch(() => false);
    // console.log('On history page:', onHistoryPage);
  }
  
  await context.close();
});

test('assets and balances tabs', async () => {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext('test-results/tabs-test', {
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
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForLoadState('networkidle');
  
  // Ensure we have a wallet
  const needsWallet = await page.getByText('Create Wallet').isVisible().catch(() => false);
  if (needsWallet) {
    await page.getByText('Create Wallet').click();
    await page.waitForTimeout(1000);
    await page.getByText('View 12-word Secret Phrase').click();
    await page.waitForTimeout(1000);
    await page.getByLabel(/I have saved my secret recovery phrase/).check();
    await page.waitForTimeout(500);
    await page.locator('input[name="password"]').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /Continue/i }).click();
    await page.waitForURL(/index/, { timeout: 10000 });
  }
  
  // Look for tab buttons
  const assetsTab = page.getByRole('tab', { name: /Assets/i });
  const balancesTab = page.getByRole('tab', { name: /Balances/i });
  
  // Alternative selectors
  const assetsButton = page.getByText('Assets').first();
  const balancesButton = page.getByText('Balances').first();
  
  // Test Assets tab
  if (await assetsButton.isVisible()) {
    // console.log('Clicking Assets tab...');
    await assetsButton.click();
    await page.waitForTimeout(1000);
    
    // Should show search
    const hasSearch = await page.locator('input[placeholder*="Search"]').isVisible().catch(() => false);
    // console.log('Shows search on Assets:', hasSearch);
  }
  
  // Test Balances tab
  if (await balancesButton.isVisible()) {
    // console.log('Clicking Balances tab...');
    await balancesButton.click();
    await page.waitForTimeout(1000);
    
    // Should show BTC balance
    const hasBTC = await page.getByText('BTC').isVisible().catch(() => false);
    // console.log('Shows BTC on Balances:', hasBTC);
  }
  
  await context.close();
});

test('footer navigation', async () => {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext('test-results/footer-nav', {
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
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForLoadState('networkidle');
  
  // Ensure we have a wallet
  const needsWallet = await page.getByText('Create Wallet').isVisible().catch(() => false);
  if (needsWallet) {
    await page.getByText('Create Wallet').click();
    await page.waitForTimeout(1000);
    await page.getByText('View 12-word Secret Phrase').click();
    await page.waitForTimeout(1000);
    await page.getByLabel(/I have saved my secret recovery phrase/).check();
    await page.waitForTimeout(500);
    await page.locator('input[name="password"]').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /Continue/i }).click();
    await page.waitForURL(/index/, { timeout: 10000 });
  }
  
  // Make sure we're on /index where footer is shown
  const currentUrl = page.url();
  if (!currentUrl.includes('/index')) {
    await page.goto(`chrome-extension://${extensionId}/popup.html#/index`);
    await page.waitForLoadState('networkidle');
  }
  
  // Wait for footer to be visible
  await page.waitForTimeout(1000);
  
  // Find the footer by its styling
  const footer = page.locator('.p-2.bg-white.border-t').first();
  const footerButtons = await footer.locator('button').all();
  
  // console.log(`Found ${footerButtons.length} footer buttons`);
  
  if (footerButtons.length === 4) {
    // Test all 4 footer buttons in order: Wallet, Market, Actions, Settings
    
    // First button: Wallet/Index
    // console.log('Testing Wallet button (1st)...');
    await footerButtons[0].click();
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('/index');
    // console.log('✓ Wallet button works');
    
    // Second button: Market
    // console.log('Testing Market button (2nd)...');
    await footerButtons[1].click();
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('/market');
    // console.log('✓ Market button works');
    
    // Third button: Actions
    // console.log('Testing Actions button (3rd)...');
    await footerButtons[2].click();
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('/actions');
    // console.log('✓ Actions button works');
    
    // Fourth button: Settings
    // console.log('Testing Settings button (4th)...');
    await footerButtons[3].click();
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('/settings');
    // console.log('✓ Settings button works');
    
    // Go back to index
    // console.log('Returning to index...');
    await footerButtons[0].click();
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('/index');
    // console.log('✓ All footer buttons tested successfully');
  } else {
    throw new Error(`Expected 4 footer buttons but found ${footerButtons.length}`);
  }
  
  await context.close();
});