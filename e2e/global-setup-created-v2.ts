import { chromium } from '@playwright/test';
import path from 'path';
import { initializeExtension } from './helpers/extension-init';
import { createWalletWithUI } from './helpers/auth-helpers';

async function globalSetupCreated() {
  console.log('[Global Setup] Starting setup for created wallet...');
  
  const pathToExtension = path.resolve('.output/chrome-mv3');
  const userDataDir = 'userData/created';

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${pathToExtension}`,
      `--load-extension=${pathToExtension}`,
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-sandbox',
    ],
    timeout: 60000,
  });

  try {
    // Properly initialize the extension
    const { extensionId } = await initializeExtension(context);
    
    // Create a new page for wallet creation
    const page = await context.newPage();
    
    // Create wallet through UI
    const success = await createWalletWithUI(page, extensionId);
    
    if (!success) {
      throw new Error('Failed to create wallet in global setup');
    }
    
    // Verify storage was persisted
    const storage = await page.evaluate(() => chrome.storage.local.get());
    console.log('[Global Setup] Storage after creation:', {
      hasAppRecords: !!storage.appRecords,
      recordCount: storage.appRecords?.length || 0,
      hasSettings: !!storage.settings
    });
    
    if (!storage.appRecords || storage.appRecords.length === 0) {
      throw new Error('Wallet creation succeeded but storage is empty');
    }
    
    // Save the extension ID for tests
    await page.evaluate((id) => {
      localStorage.setItem('test-extension-id', id);
    }, extensionId);
    
    console.log('[Global Setup] Created wallet setup complete');
    
    // Close the page but keep context open briefly
    await page.close();
    await new Promise(resolve => setTimeout(resolve, 2000));
    
  } catch (error) {
    console.error('[Global Setup] Failed:', error);
    throw error;
  } finally {
    await context.close();
  }
}

export default globalSetupCreated;