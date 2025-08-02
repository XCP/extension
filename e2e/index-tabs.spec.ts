import { test, expect, chromium } from '@playwright/test';
import path from 'path';

const TEST_PASSWORD = 'TestPassword123!';

test('assets and balances tab switching', async () => {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext('test-results/index-tabs-test', {
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
  
  // Wait for page to load
  await page.waitForTimeout(2000);
  
  // We start on Balances by default
  const btcVisible = await page.getByText('BTC').isVisible();
  // console.log('On Balances tab, BTC visible:', btcVisible);
  
  // Click Assets tab
  const assetsTab = page.getByText('Assets').first();
  await assetsTab.click();
  await page.waitForTimeout(1000);
  
  // URL should change
  const urlHasAssets = page.url().includes('tab=Assets');
  // console.log('URL includes tab=Assets:', urlHasAssets);
  
  // Should see search input for assets
  const searchVisible = await page.locator('input[placeholder*="Search assets"]').isVisible();
  // console.log('Search input visible on Assets:', searchVisible);
  
  // Switch back to Balances
  const balancesTab = page.getByText('Balances').first();
  await balancesTab.click();
  await page.waitForTimeout(1000);
  
  // Should be back on Balances
  const backOnBalances = await page.getByText('BTC').isVisible();
  // console.log('Back on Balances, BTC visible:', backOnBalances);
  
  await context.close();
});

test('search functionality', async () => {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext('test-results/index-search-test', {
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
  
  // Search on Balances tab
  const balancesSearch = page.locator('input[placeholder*="Search balances"]');
  if (await balancesSearch.isVisible()) {
    await balancesSearch.fill('XCP');
    await page.waitForTimeout(500);
    // console.log('✓ Searched for XCP in balances');
    
    await balancesSearch.clear();
    await balancesSearch.fill('BTC');
    await page.waitForTimeout(500);
    // console.log('✓ Searched for BTC in balances');
  }
  
  // Switch to Assets and search
  await page.getByText('Assets').first().click();
  await page.waitForTimeout(1000);
  
  const assetsSearch = page.locator('input[placeholder*="Search"]').first();
  if (await assetsSearch.isVisible()) {
    await assetsSearch.fill('PEPE');
    await page.waitForTimeout(500);
    // console.log('✓ Searched for PEPE in assets');
    
    await assetsSearch.clear();
    await assetsSearch.fill('RARE');
    await page.waitForTimeout(500);
    // console.log('✓ Searched for RARE in assets');
  }
  
  await context.close();
});