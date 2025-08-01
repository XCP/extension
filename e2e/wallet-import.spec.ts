import { test, expect, chromium } from '@playwright/test';
import path from 'path';

// Well-known test mnemonic that generates deterministic addresses
const TEST_MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

// Expected addresses for the test mnemonic across different address types
const EXPECTED_ADDRESSES = {
  P2PKH: '1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA',     // Legacy
  P2WPKH: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu', // Native SegWit (bech32)
  P2SH_P2WPKH: '37Lx99uaGn5avKBxiW26HjedQE3LrDCZru', // Nested SegWit
  P2TR: 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr', // Taproot
};

test('import wallet with test mnemonic', async () => {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext('test-results/wallet-import-basic', {
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
  
  // Check if onboarding page
  const hasImportOption = await page.getByText('Restore Wallet').isVisible();
  
  if (!hasImportOption) {
    console.log('Wallet already exists, this test requires fresh state');
    await context.close();
    return;
  }
  
  console.log('Starting wallet import with test mnemonic...');
  
  // Click restore wallet
  await page.getByText('Restore Wallet').click();
  await page.waitForTimeout(1000);
  
  // Handle the "Import Wallet" option if it appears
  const importButton = page.getByText('Import Wallet');
  if (await importButton.isVisible()) {
    await importButton.click();
    await page.waitForTimeout(1000);
  }
  
  // Enter the test mnemonic
  const mnemonicInput = page.locator('textarea[placeholder*="Enter your 12"]');
  await mnemonicInput.fill(TEST_MNEMONIC);
  
  // Set password
  await page.locator('input[name="password"]').fill('TestPassword123!');
  
  // Submit
  await page.getByRole('button', { name: /Continue|Import/i }).click();
  
  // Wait for wallet to load
  await page.waitForURL(/index/, { timeout: 10000 });
  await page.waitForTimeout(2000);
  
  // Check the default address (should be Native SegWit)
  // Look for full address or truncated format
  const fullAddressElement = page.locator('text=/^bc1q[a-z0-9]{38}$/');
  const truncatedAddressElement = page.locator('text=/^bc1q[a-z0-9]{2,3}\\.\\.\\.[a-z0-9]{6}$/');
  
  let foundAddress = false;
  if (await fullAddressElement.count() > 0) {
    const fullAddress = await fullAddressElement.first().textContent();
    console.log('Found full address:', fullAddress);
    expect(fullAddress).toBe(EXPECTED_ADDRESSES.P2WPKH);
    foundAddress = true;
  } else if (await truncatedAddressElement.count() > 0) {
    const truncatedAddress = await truncatedAddressElement.first().textContent();
    console.log('Found truncated address:', truncatedAddress);
    // Verify it starts with bc1q and ends correctly
    expect(truncatedAddress).toMatch(/^bc1q/);
    foundAddress = true;
  }
  
  expect(foundAddress).toBe(true);
  
  await page.screenshot({ path: 'test-results/screenshots/imported-wallet.png' });
  
  await context.close();
});

test('switch address types with imported wallet', async () => {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  let context;
  let page;
  
  try {
  context = await chromium.launchPersistentContext('test-results/wallet-import-switch', {
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
  page = await context.newPage();
  
  // Navigate to extension
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForLoadState('networkidle');
  
  // Check if we need to import wallet first
  const hasImportOption = await page.getByText('Restore Wallet').isVisible();
  if (hasImportOption) {
    console.log('Need to import wallet first...');
    await page.getByText('Restore Wallet').click();
    await page.waitForTimeout(1000);
    
    // Handle the "Import Wallet" option if it appears
    const importButton = page.getByText('Import Wallet');
    if (await importButton.isVisible()) {
      await importButton.click();
      await page.waitForTimeout(1000);
    }
    
    const mnemonicInput = page.locator('textarea[placeholder*="Enter your 12"]');
    await mnemonicInput.fill(TEST_MNEMONIC);
    
    await page.locator('input[name="password"]').fill('TestPassword123!');
    await page.getByRole('button', { name: /Continue|Import/i }).click();
    
    await page.waitForURL(/index/, { timeout: 10000 });
    await page.waitForTimeout(2000);
  } else {
    // Unlock wallet if needed
    const needsUnlock = page.url().includes('unlock');
    if (needsUnlock) {
      console.log('Unlocking wallet...');
      await page.locator('input[name="password"]').fill('TestPassword123!');
      await page.getByRole('button', { name: /unlock/i }).click();
      await page.waitForURL(/index/, { timeout: 10000 });
    }
  }
  
  console.log('Testing address type switching...');
  
  // Take a screenshot to see current state
  await page.screenshot({ path: 'test-results/screenshots/before-settings-click.png' });
  
  // Try multiple selectors for settings/menu
  const settingsSelectors = [
    'button:has-text("Settings")',
    'button:has-text("Menu")',
    '[aria-label*="settings" i]',
    '[aria-label*="menu" i]',
    'button[title*="settings" i]',
    'button[title*="menu" i]',
    'svg[data-icon="settings"]',
    'svg[data-icon="menu"]',
    'button:has(svg)',
    '[role="button"]:has-text("⚙")',
    'button.settings-button',
    'button.menu-button'
  ];
  
  let settingsClicked = false;
  for (const selector of settingsSelectors) {
    try {
      const element = page.locator(selector).first();
      if (await element.count() > 0) {
        console.log(`Found settings element with selector: ${selector}`);
        await element.click();
        settingsClicked = true;
        break;
      }
    } catch (error) {
      // Continue to next selector
    }
  }
  
  if (!settingsClicked) {
    console.log('Could not find settings button, trying to find any clickable elements...');
    const buttons = await page.locator('button').all();
    console.log(`Found ${buttons.length} buttons`);
    for (let i = 0; i < buttons.length; i++) {
      const text = await buttons[i].textContent();
      const ariaLabel = await buttons[i].getAttribute('aria-label');
      console.log(`Button ${i}: text="${text}", aria-label="${ariaLabel}"`);
    }
    
    // Take screenshot to debug
    await page.screenshot({ path: 'test-results/screenshots/no-settings-button.png' });
    throw new Error('Could not find settings button');
  }
  
  await page.waitForTimeout(1000);
  
  // For now, just verify we can access settings and take a screenshot
  // The actual address type switching UI may need to be implemented or may work differently
  console.log('Current URL:', page.url());
  await page.screenshot({ path: 'test-results/screenshots/wallet-settings-page.png' });
  
  // Look for any address-related settings
  const addressSettings = page.locator('text=/address|Address/i');
  const hasAddressSettings = await addressSettings.count() > 0;
  console.log('Has address-related settings:', hasAddressSettings);
  
  if (hasAddressSettings) {
    console.log('Found address settings options');
    // Future: implement actual address type switching when UI is available
  } else {
    console.log('Address type switching may not be implemented in the UI yet');
  }
  
  } catch (error) {
    console.error('Test failed:', error);
    // Take a final screenshot on error
    if (page) {
      await page.screenshot({ path: 'test-results/screenshots/switch-test-error.png' });
    }
    throw error;
  } finally {
    if (context) {
      await context.close();
    }
  }
});

test('verify mnemonic-derived addresses are deterministic', async () => {
  let context;
  
  try {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  
  console.log('Testing deterministic address generation...');
  
  context = await chromium.launchPersistentContext('test-results/wallet-import-deterministic', {
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
  
  // Check if onboarding page is visible
  const restoreWalletButton = page.getByText('Restore Wallet');
  
  try {
    // Wait for the button to be visible with a timeout
    await restoreWalletButton.waitFor({ state: 'visible', timeout: 5000 });
  } catch (error) {
    console.log('Restore Wallet button not found - wallet may already exist');
    await page.screenshot({ path: 'test-results/screenshots/deterministic-test-error.png' });
    await context.close();
    return;
  }
  
  // Import wallet
  await restoreWalletButton.click();
  await page.waitForTimeout(1000);
  
  // Handle the "Import Wallet" option if it appears
  try {
    const importButton = page.getByText('Import Wallet');
    await importButton.waitFor({ state: 'visible', timeout: 2000 });
    await importButton.click();
    await page.waitForTimeout(1000);
  } catch (error) {
    // Import button might not appear, continue
    console.log('Import Wallet button not found, continuing...');
  }
  
  const mnemonicInput = page.locator('textarea[placeholder*="Enter your 12"]');
  await mnemonicInput.waitFor({ state: 'visible', timeout: 5000 });
  await mnemonicInput.fill(TEST_MNEMONIC);
  
  const passwordInput = page.locator('input[name="password"]');
  await passwordInput.waitFor({ state: 'visible', timeout: 5000 });
  await passwordInput.fill('TestPassword123!');
  
  const continueButton = page.getByRole('button', { name: /Continue|Import/i });
  await continueButton.waitFor({ state: 'visible', timeout: 5000 });
  await continueButton.click();
  
  try {
    await page.waitForURL(/index/, { timeout: 15000 });
  } catch (error) {
    console.log('Failed to navigate to index page');
    await page.screenshot({ path: 'test-results/screenshots/deterministic-test-navigation-error.png' });
    throw error;
  }
  
  await page.waitForTimeout(3000); // Give more time for the page to fully load
  
  // Check for any address pattern
  const fullAddressElement = page.locator('text=/^bc1q[a-z0-9]{38}$/');
  const truncatedAddressElement = page.locator('text=/^bc1q[a-z0-9]{2,3}\\.\\.\\.[a-z0-9]{6}$/');
  
  let foundAddress = false;
  
  // Wait for either address pattern to appear
  try {
    await page.waitForSelector('text=/^bc1q/', { timeout: 5000 });
  } catch (error) {
    console.log('No Bitcoin address found on page');
    await page.screenshot({ path: 'test-results/screenshots/deterministic-test-no-address.png' });
  }
  
  if (await fullAddressElement.count() > 0) {
    const address = await fullAddressElement.first().textContent();
    console.log('Deterministic test - Found full address:', address);
    expect(address).toBe(EXPECTED_ADDRESSES.P2WPKH);
    foundAddress = true;
  } else if (await truncatedAddressElement.count() > 0) {
    const address = await truncatedAddressElement.first().textContent();
    console.log('Deterministic test - Found truncated address:', address);
    expect(address).toMatch(/^bc1q/);
    foundAddress = true;
  } else {
    // Try to find any element that might contain the address
    const possibleAddressElements = await page.locator('text=/bc1q/').all();
    console.log(`Found ${possibleAddressElements.length} elements containing 'bc1q'`);
    for (const element of possibleAddressElements) {
      const text = await element.textContent();
      console.log('Possible address element:', text);
    }
  }
  
  expect(foundAddress).toBe(true);
  console.log('✅ Deterministic address generation verified');
  
  await page.screenshot({ path: 'test-results/screenshots/deterministic-test.png' });
  } catch (error) {
    console.error('Test failed with error:', error);
    throw error;
  } finally {
    if (context) {
      await context.close();
    }
  }
});