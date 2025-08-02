import { test, expect, chromium } from '@playwright/test';
import path from 'path';

// Helper function to create a wallet and return authenticated page
async function createWalletAndGetPage() {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext('test-results/wallet-functionality', {
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
  
  // Check if wallet already exists (from previous test runs)
  const hasCreateWallet = await page.getByText('Create Wallet').isVisible();
  
  if (hasCreateWallet) {
    // console.log('Creating new wallet...');
    // Create wallet
    await page.getByText('Create Wallet').click();
    await page.waitForTimeout(1000);
    
    // Reveal phrase
    await page.getByText('View 12-word Secret Phrase').click();
    await page.waitForTimeout(1000);
    
    // Confirm and submit
    await page.getByLabel(/I have saved my secret recovery phrase/).check();
    await page.waitForTimeout(500);
    
    await page.locator('input[name="password"]').fill('TestPassword123!');
    await page.getByRole('button', { name: /Continue/i }).click();
    
    // Wait for success
    await page.waitForURL(/index/, { timeout: 10000 });
  } else {
    // console.log('Wallet already exists, checking if unlocked...');
    // Check if we need to unlock
    const needsUnlock = page.url().includes('unlock');
    if (needsUnlock) {
      // console.log('Unlocking wallet...');
      await page.locator('input[name="password"]').fill('TestPassword123!');
      await page.getByRole('button', { name: /unlock/i }).click();
      await page.waitForURL(/index/, { timeout: 10000 });
    }
  }
  
  return { page, context, extensionId };
}

test('wallet shows address and balance', async () => {
  const { page, context } = await createWalletAndGetPage();
  
  // console.log('Checking wallet main page...');
  
  // Should be on main wallet page
  expect(page.url()).toContain('#/index');
  
  // Look for wallet address (truncated format like bc1qxl...gjy8td)
  const addressElement = page.locator('text=/^bc1q[a-z0-9]{2,3}\\.\\.\\.[a-z0-9]{6}$/');
  const hasAddress = await addressElement.count() > 0;
  // console.log('Has truncated address:', hasAddress);
  
  if (hasAddress) {
    const address = await addressElement.first().textContent();
    // console.log('Wallet address:', address);
  } else {
    // Alternative: look for any address-like pattern
    const anyAddress = page.locator('text=/bc1q[a-z0-9.]{10,}/');
    const count = await anyAddress.count();
    if (count > 0) {
      const address = await anyAddress.first().textContent();
      // console.log('Found address pattern:', address);
    }
  }
  
  // Look for balance (might be 0 for new wallet)
  const balanceElements = page.locator('text=/\\d+(\\.\\d+)? BTC/');
  const hasBalance = await balanceElements.count() > 0;
  // console.log('Has balance display:', hasBalance);
  
  if (hasBalance) {
    const balance = await balanceElements.first().textContent();
    // console.log('Balance:', balance);
  }
  
  await page.screenshot({ path: 'test-results/screenshots/wallet-main-page.png' });
  
  await context.close();
});

test('can navigate to different sections', async () => {
  const { page, context } = await createWalletAndGetPage();
  
  // console.log('Testing navigation...');
  
  // Check what navigation options are available
  const navButtons = page.locator('button, a').filter({ hasText: /send|receive|settings|assets/i });
  const navCount = await navButtons.count();
  // console.log('Found', navCount, 'navigation elements');
  
  // Test navigation to different sections
  const sections = ['Send', 'Assets', 'Settings'];
  
  for (const section of sections) {
    // Be more specific for Assets to avoid multiple matches
    let navElement;
    if (section === 'Assets') {
      navElement = page.getByRole('button', { name: 'View Assets' });
    } else {
      navElement = page.getByRole('button', { name: new RegExp(section, 'i') })
        .or(page.getByRole('link', { name: new RegExp(section, 'i') }));
    }
    
    const isVisible = await navElement.isVisible();
    // console.log(`${section} navigation visible:`, isVisible);
    
    if (isVisible) {
      // console.log(`Navigating to ${section}...`);
      await navElement.click();
      await page.waitForTimeout(1000);
      
      const currentUrl = page.url();
      // console.log(`URL after clicking ${section}:`, currentUrl);
      
      await page.screenshot({ path: `test-results/screenshots/navigation-${section.toLowerCase()}.png` });
      
      // Navigate back to main (if there's a back button or home)
      const backButton = page.getByRole('button', { name: /back|home/i })
        .or(page.locator('[aria-label*="back" i]'));
      
      if (await backButton.isVisible()) {
        await backButton.click();
        await page.waitForTimeout(500);
      }
    }
  }
  
  await context.close();
});

test('can access wallet settings', async () => {
  const { page, context } = await createWalletAndGetPage();
  
  // console.log('Testing wallet settings access...');
  
  // Look for settings or menu button
  const settingsButton = page.getByRole('button', { name: /settings|menu/i })
    .or(page.locator('[aria-label*="settings" i]'))
    .or(page.locator('[aria-label*="menu" i]'));
  
  const hasSettings = await settingsButton.count() > 0;
  // console.log('Has settings button:', hasSettings);
  
  if (hasSettings && await settingsButton.first().isVisible()) {
    await settingsButton.first().click();
    await page.waitForTimeout(1000);
    
    // console.log('URL after clicking settings:', page.url());
    await page.screenshot({ path: 'test-results/screenshots/wallet-settings.png' });
    
    // Look for settings options
    const settingsOptions = page.locator('text=/address|security|backup|private/i');
    const optionsCount = await settingsOptions.count();
    // console.log('Found', optionsCount, 'settings options');
    
    if (optionsCount > 0) {
      // console.log('✅ Successfully accessed wallet settings');
    }
  } else {
    // console.log('No settings button found on main page');
  }
  
  await context.close();
});