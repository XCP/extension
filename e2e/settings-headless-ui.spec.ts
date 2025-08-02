import { test, expect, chromium } from '@playwright/test';
import path from 'path';

const TEST_PASSWORD = 'TestPassword123!';

test('change address type using Headless UI RadioGroup', async () => {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext('test-results/address-type-headless', {
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
  
  // Get current address
  const addressButton = page.locator('.bg-blue-600, .bg-blue-500').first();
  const originalAddress = await addressButton.textContent();
  // console.log('Original address:', originalAddress);
  
  // Navigate to settings
  const footerButtons = await page.locator('.p-2.border-t button').all();
  await footerButtons[3].click();
  await page.waitForTimeout(1000);
  
  // Click Address Type
  await page.getByText('Address Type').click();
  await page.waitForTimeout(1000);
  
  // Headless UI RadioGroup options are divs with role="radio"
  const radioOptions = await page.locator('[role="radio"]').all();
  // console.log(`Found ${radioOptions.length} radio options`);
  
  // Find the selected option (it should have aria-checked="true")
  let selectedIndex = -1;
  for (let i = 0; i < radioOptions.length; i++) {
    const isChecked = await radioOptions[i].getAttribute('aria-checked') === 'true';
    if (isChecked) {
      selectedIndex = i;
      const text = await radioOptions[i].textContent();
      // console.log(`Currently selected: ${text} (index ${i})`);
      break;
    }
  }
  
  // Click a different option
  const newIndex = selectedIndex === 0 ? 1 : 0;
  if (newIndex < radioOptions.length) {
    const newOptionText = await radioOptions[newIndex].textContent();
    // console.log(`Selecting: ${newOptionText} (index ${newIndex})`);
    await radioOptions[newIndex].click();
    await page.waitForTimeout(1000);
  }
  
  // Go back to index
  await page.goto(`chrome-extension://${extensionId}/popup.html#/index`);
  await page.waitForTimeout(2000);
  
  // Check new address
  const newAddress = await addressButton.textContent();
  // console.log('New address:', newAddress);
  
  // Address should have changed
  expect(newAddress).not.toBe(originalAddress);
  
  await context.close();
});

test('advanced settings auto-lock timer with Headless UI', async () => {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext('test-results/security-headless', {
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
  
  // Navigate to settings
  const footerButtons = await page.locator('.p-2.border-t button').all();
  await footerButtons[3].click();
  await page.waitForTimeout(1000);
  
  // Click Advanced
  await page.getByText('Advanced').click();
  await page.waitForTimeout(1000);
  
  // Look for auto-lock section
  const autoLockTitle = await page.getByText('Auto-Lock Timer').isVisible();
  // console.log('Auto-lock section visible:', autoLockTitle);
  
  // Find the radio options for auto-lock timer
  const lockOptions = await page.locator('[role="radio"]').all();
  // console.log(`Found ${lockOptions.length} lock timer options`);
  
  // Select 1 minute option
  for (const option of lockOptions) {
    const text = await option.textContent();
    // console.log(`Option: ${text}`);
    
    if (text?.includes('1 minute')) {
      await option.click();
      await page.waitForTimeout(500);
      // console.log('Selected 1 minute auto-lock');
      break;
    }
  }
  
  // Go back to index
  await page.goto(`chrome-extension://${extensionId}/popup.html#/index`);
  await page.waitForTimeout(1000);
  
  // Wait for 70 seconds (just over 1 minute) to test auto-lock
  // console.log('Waiting 70 seconds for auto-lock to trigger...');
  await page.waitForTimeout(70000);
  
  // Try to interact with the page - should be locked
  const isLocked = page.url().includes('unlock') || await page.getByText(/Unlock/i).isVisible().catch(() => false);
  // console.log('Wallet auto-locked after 1 minute:', isLocked);
  expect(isLocked).toBe(true);
  
  await context.close();
});

test('pinned assets with drag and drop', async () => {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext('test-results/pinned-assets-dnd', {
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
  
  // Navigate to settings
  const footerButtons = await page.locator('.p-2.border-t button').all();
  await footerButtons[3].click();
  await page.waitForTimeout(1000);
  
  // Click Pinned Assets
  await page.getByText('Pinned Assets').click();
  await page.waitForTimeout(1000);
  
  // Look for search to add assets
  const searchInput = page.locator('input[placeholder*="Search"]');
  if (await searchInput.isVisible()) {
    await searchInput.fill('XCP');
    await page.waitForTimeout(500);
    
    // Look for XCP in results and pin it
    const xcpResult = page.getByText('XCP').nth(1); // Skip the first one which might be in the search
    if (await xcpResult.isVisible()) {
      // Find the pin button (might be next to XCP)
      const pinButton = xcpResult.locator('..').locator('button').first();
      if (await pinButton.isVisible()) {
        await pinButton.click();
        await page.waitForTimeout(500);
        // console.log('Pinned XCP');
      }
    }
    
    // Clear search to see pinned assets
    await searchInput.clear();
    await page.waitForTimeout(500);
  }
  
  // Check for drag handles (using hello-pangea/dnd)
  const dragHandles = await page.locator('[data-rfd-drag-handle-draggable-id]').count();
  // console.log('Drag handles found:', dragHandles);
  
  // Check for pinned items
  const pinnedItems = await page.locator('[draggable="true"]').count();
  // console.log('Draggable items found:', pinnedItems);
  
  // If we have multiple pinned items, try to drag one
  if (pinnedItems >= 2) {
    const firstItem = page.locator('[draggable="true"]').first();
    const secondItem = page.locator('[draggable="true"]').nth(1);
    
    // Get positions
    const firstBox = await firstItem.boundingBox();
    const secondBox = await secondItem.boundingBox();
    
    if (firstBox && secondBox) {
      // Drag first item to second position
      await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2 + 10);
      await page.mouse.up();
      await page.waitForTimeout(500);
      // console.log('Performed drag and drop');
    }
  }
  
  await context.close();
});

test('settings changes persist across navigation', async () => {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext('test-results/settings-persist', {
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
  
  // Get original address to track if it changes
  const addressButton = page.locator('.bg-blue-600, .bg-blue-500').first();
  const originalAddress = await addressButton.textContent();
  // console.log('Original address before settings:', originalAddress);
  
  // Navigate to settings
  const footerButtons = await page.locator('.p-2.border-t button').all();
  await footerButtons[3].click();
  await page.waitForTimeout(1000);
  
  // Change address type
  await page.getByText('Address Type').click();
  await page.waitForTimeout(1000);
  
  const radioOptions = await page.locator('[role="radio"]').all();
  if (radioOptions.length >= 2) {
    // Find non-selected option and click it
    for (const option of radioOptions) {
      const isChecked = await option.getAttribute('aria-checked') === 'true';
      if (!isChecked) {
        await option.click();
        await page.waitForTimeout(1000);
        // console.log('Changed address type');
        break;
      }
    }
  }
  
  // Navigate away and back
  await page.goto(`chrome-extension://${extensionId}/popup.html#/index`);
  await page.waitForTimeout(1000);
  
  // Check that address changed
  const newAddress = await addressButton.textContent();
  // console.log('Address after change:', newAddress);
  expect(newAddress).not.toBe(originalAddress);
  
  // Go to a different page (Actions)
  await footerButtons[2].click();
  await page.waitForTimeout(1000);
  
  // Go back to index
  await footerButtons[0].click();
  await page.waitForTimeout(1000);
  
  // Address should still be the new one
  const stillNewAddress = await addressButton.textContent();
  // console.log('Address after navigation:', stillNewAddress);
  expect(stillNewAddress).toBe(newAddress);
  
  await context.close();
});