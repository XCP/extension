import { test, expect, chromium } from '@playwright/test';
import path from 'path';

const TEST_PASSWORD = 'TestPassword123!';

test('copy address from blue button', async () => {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext('test-results/copy-address', {
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
  
  // Find the blue address button
  const addressButton = page.locator('.bg-blue-600, .bg-blue-500, [class*="blue"]').first();
  const hasAddressButton = await addressButton.isVisible().catch(() => false);
  
  if (hasAddressButton) {
    console.log('Found address button');
    
    // Get address text before clicking
    const addressText = await addressButton.textContent();
    console.log('Address text:', addressText);
    
    // Click to copy
    await addressButton.click();
    await page.waitForTimeout(1000);
    
    // Look for copy confirmation (check mark or "copied" text)
    const hasCopyConfirmation = await page.locator('.text-green-500, [class*="check"], text=/copied/i').isVisible().catch(() => false);
    console.log('Shows copy confirmation:', hasCopyConfirmation);
  }
  
  await context.close();
});

test('navigate to address selection', async () => {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext('test-results/address-selection', {
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
  
  // Look for chevron or button to access address selection
  const addressSection = page.locator('.bg-blue-600, .bg-blue-500, [class*="blue"]').first();
  const chevron = addressSection.locator('svg, [class*="chevron"], [class*="arrow"]');
  
  if (await chevron.isVisible()) {
    console.log('Found address selection chevron');
    await chevron.click();
    await page.waitForTimeout(1000);
    
    // Should navigate to address selection
    const onAddressPage = page.url().includes('address') || await page.getByText(/Select Address|Address/i).isVisible().catch(() => false);
    console.log('Navigated to address selection:', onAddressPage);
    
    // Look for address list
    const hasAddressList = await page.getByText(/Address 1|bc1/i).isVisible().catch(() => false);
    console.log('Shows address list:', hasAddressList);
  }
  
  await context.close();
});

test('add new address', async () => {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext('test-results/add-address', {
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
  
  // Navigate to address management
  const addressSection = page.locator('.bg-blue-600, .bg-blue-500, [class*="blue"]').first();
  const chevron = addressSection.locator('svg, [class*="chevron"], [class*="arrow"]');
  
  if (await chevron.isVisible()) {
    await chevron.click();
    await page.waitForTimeout(1000);
    
    // Look for add address button
    const addButton = page.getByRole('button', { name: /Add.*Address|New.*Address|\+/i });
    if (await addButton.isVisible()) {
      console.log('Found add address button');
      
      // Count current addresses
      const addressCards = await page.locator('[class*="address"], text=/Address \\d+/').count();
      console.log('Current address count:', addressCards);
      
      // Click add
      await addButton.click();
      await page.waitForTimeout(2000);
      
      // Count again
      const newCount = await page.locator('[class*="address"], text=/Address \\d+/').count();
      console.log('New address count:', newCount);
      
      // Should have one more address
      expect(newCount).toBeGreaterThan(addressCards);
    }
  }
  
  await context.close();
});

test('switch between addresses', async () => {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext('test-results/switch-address', {
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
  
  // Navigate to address selection
  const addressSection = page.locator('.bg-blue-600, .bg-blue-500, [class*="blue"]').first();
  const chevron = addressSection.locator('svg, [class*="chevron"], [class*="arrow"]');
  
  if (await chevron.isVisible()) {
    await chevron.click();
    await page.waitForTimeout(1000);
    
    // Add a second address if needed
    const addressCount = await page.locator('[class*="address"], text=/Address \\d+/').count();
    if (addressCount < 2) {
      const addButton = page.getByRole('button', { name: /Add.*Address|New.*Address|\+/i });
      if (await addButton.isVisible()) {
        await addButton.click();
        await page.waitForTimeout(2000);
      }
    }
    
    // Click on second address
    const secondAddress = page.locator('text=/Address 2/').first();
    if (await secondAddress.isVisible()) {
      console.log('Switching to Address 2');
      await secondAddress.click();
      await page.waitForTimeout(1000);
      
      // Should return to index
      const onIndex = page.url().includes('index');
      console.log('Returned to index:', onIndex);
      
      // Verify address changed
      const activeAddress = await page.locator('.bg-blue-600, .bg-blue-500, [class*="blue"]').first().textContent();
      console.log('Active address now shows:', activeAddress);
      
      // Should show "Address 2"
      expect(activeAddress).toContain('Address 2');
    }
  }
  
  await context.close();
});