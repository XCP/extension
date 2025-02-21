import { chromium } from '@playwright/test';
import path from 'path';

async function globalSetupImported() {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  const userDataDir = 'userData/imported';
  const storageStatePath = 'userData/imported/state.json';

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
    const page = await context.newPage();
    let [background] = context.serviceWorkers();
    if (!background) background = await context.waitForEvent('serviceworker', { timeout: 15000 });
    const extensionId = background.url().split('/')[2];

    // Navigate to onboarding
    await page.goto(`chrome-extension://${extensionId}/popup.html#/onboarding`);
    
    // Wait for and click Import Wallet button
    await page.waitForSelector('button:has-text("Import Wallet")', { state: 'visible', timeout: 10000 });
    await page.getByRole('button', { name: /Import Wallet/i }).click();
    
    // Wait for import wallet page to load
    await page.waitForURL(/#\/import-wallet$/);
    await page.waitForSelector('input[placeholder="Enter word"]', { state: 'visible', timeout: 10000 });

    // Enter mnemonic words
    const testMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const words = testMnemonic.split(' ');
    
    for (let i = 0; i < 12; i++) {
      const input = page.getByPlaceholder('Enter word').nth(i);
      await input.waitFor({ state: 'visible' });
      await input.fill(words[i]);
      await input.press('Tab');
    }

    // Check the confirmation checkbox - updated selector
    await page.getByRole('checkbox', { name: /I have saved my secret recovery phrase/i }).check();

    // Enter password
    await page.waitForSelector('input[id="password"]', { state: 'visible' });
    await page.fill('input[id="password"]', 'TestPassword123!');

    // Click continue and wait for success
    await page.getByRole('button', { name: /Continue/i }).click();

    // Wait for success indicator (the address)
    await page.waitForSelector('text=bc1qcr...306fyu', { timeout: 15000 });

    // Add delay to ensure storage is updated
    await page.waitForTimeout(3000);

    // Check storage
    const records = await page.evaluate(() => chrome.storage.local.get('appRecords'));
    console.log('Stored appRecords after import:', records);
    
    if (!records.appRecords || records.appRecords.length === 0) {
      throw new Error('Wallet import failed to persist in local:appRecords');
    }

    // Transfer storage
    await page.evaluate((records) => {
      window.localStorage.setItem('appRecords', JSON.stringify(records.appRecords));
    }, records);

    await context.storageState({ path: storageStatePath });

  } catch (error) {
    console.error('Setup failed:', error);
    throw error;
  } finally {
    await context.close();
  }
}

export default globalSetupImported;
