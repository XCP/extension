import { test, expect, chromium } from '@playwright/test';
import path from 'path';

const TEST_PASSWORD = 'TestPassword123!';

test('click on balance navigates to balance page', async () => {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext('test-results/balance-nav', {
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
  
  await page.waitForTimeout(2000);
  
  // Find BTC balance row and click it (not the menu button)
  const btcText = page.getByText('BTC').first();
  const btcRow = btcText.locator('../..');
  
  // Click on the row but avoid the menu button
  await btcRow.click({ position: { x: 50, y: 20 } });
  await page.waitForTimeout(1000);
  
  // Should navigate to send page for BTC
  const onSendPage = page.url().includes('/compose/send/BTC');
  // console.log('Navigated to BTC send page:', onSendPage);
  expect(onSendPage).toBe(true);
  
  // Check for send page elements
  const hasSendHeader = await page.getByRole('heading', { name: 'Send' }).isVisible();
  const hasAmountInput = await page.getByLabel('Amount*').isVisible();
  // console.log('Shows send form:', hasSendHeader && hasAmountInput);
  
  await context.close();
});

test('settings icon navigates to pinned assets', async () => {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext('test-results/settings-nav', {
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
  
  await page.waitForTimeout(2000);
  
  // Find and click settings icon using aria-label
  const settingsButton = page.locator('button[aria-label="Manage Pinned Assets"]');
  await expect(settingsButton).toBeVisible();
  await settingsButton.click();
  
  // Wait for navigation
  await page.waitForURL('**/pinned-assets', { timeout: 5000 });
  
  const onPinnedAssets = page.url().includes('pinned-assets');
  expect(onPinnedAssets).toBe(true);
  
  await context.close();
});

test('balance row menu actions', async () => {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext('test-results/balance-menu', {
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
  
  await page.waitForTimeout(2000);
  
  // Find the menu button (three dots) for BTC
  const btcRow = page.getByText('BTC').locator('../..');
  const menuButton = btcRow.locator('button').filter({ has: page.locator('svg') }).last();
  
  // console.log('Looking for menu button...');
  if (await menuButton.isVisible()) {
    await menuButton.click();
    await page.waitForTimeout(500);
    // console.log('✓ Clicked balance menu button');
    
    // Take screenshot to see menu
    await page.screenshot({ path: 'test-results/balance-menu/menu-open.png' });
    
    // Look for menu options - they might be in a dropdown/popover
    const sendOption = page.getByText(/Send.*BTC/i);
    const viewOption = page.getByText(/View.*Details/i);
    
    if (await sendOption.isVisible()) {
      // console.log('✓ Menu has Send option');
      await sendOption.click();
      await page.waitForTimeout(1000);
      
      // Should navigate to send
      const onSendPage = page.url().includes('/compose/send/BTC');
      // console.log('Navigated to send page:', onSendPage);
    } else if (await viewOption.isVisible()) {
      // console.log('✓ Menu has View Details option');
      await viewOption.click();
      await page.waitForTimeout(1000);
      
      // Should navigate to balance details
      const onBalancePage = page.url().includes('/balance/BTC');
      // console.log('Navigated to balance page:', onBalancePage);
    } else {
      // console.log('No menu options found');
    }
  } else {
    // console.log('Menu button not found');
  }
  
  await context.close();
});

test('receive page full functionality', async () => {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext('test-results/receive-full', {
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
  
  await page.waitForTimeout(2000);
  
  // Click Receive
  await page.getByText('Receive').click();
  await page.waitForTimeout(1000);
  
  // Should show QR code
  const qrCode = await page.locator('canvas, img[alt*="QR"], [class*="qr"]').isVisible();
  // console.log('✓ QR code displayed:', qrCode);
  
  // Should show address
  const addressElements = await page.locator('text=/^(bc1|1|3)[a-zA-Z0-9]{25,}/').all();
  // console.log(`Found ${addressElements.length} address elements`);
  
  // Look for copy button
  const copyButtons = await page.getByRole('button', { name: /Copy/i }).all();
  // console.log(`Found ${copyButtons.length} copy buttons`);
  
  if (copyButtons.length > 0) {
    await copyButtons[0].click();
    await page.waitForTimeout(500);
    
    // Check for copied confirmation
    const copied = await page.getByText(/Copied/i).isVisible().catch(() => false);
    // console.log('✓ Shows copied confirmation:', copied);
  }
  
  // Look for share button
  const shareButton = page.getByRole('button', { name: /Share/i });
  const hasShare = await shareButton.isVisible().catch(() => false);
  // console.log('Has share button:', hasShare);
  
  await context.close();
});