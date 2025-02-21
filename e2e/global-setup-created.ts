import { chromium } from '@playwright/test';
import path from 'path';

async function globalSetupCreated() {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  const userDataDir = 'userData/created';
  const storageStatePath = 'userData/created/state.json';

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

  const page = await context.newPage();
  let [background] = context.serviceWorkers();
  if (!background) background = await context.waitForEvent('serviceworker', { timeout: 15000 });
  const extensionId = background.url().split('/')[2];

  await page.goto(`chrome-extension://${extensionId}/popup.html#/onboarding`);
  await page.getByRole('button', { name: /Create Wallet/i }).click();
  await page.waitForURL(/#\/create-wallet$/);
  await page.getByText(/View 12-word Secret Phrase/).click();
  await page.getByLabel(/I have saved my secret recovery phrase/).check();
  await page.fill('input[id="password"]', 'TestPassword123!');
  await page.getByRole('button', { name: /Continue/i }).click();
  await page.waitForURL(/#\/index$/);
  await page.waitForSelector('text=bc1q');
  await page.waitForTimeout(2000);

  const records = await page.evaluate(() => chrome.storage.local.get('appRecords'));
  console.log('Stored appRecords after creation:', records);
  if (!records.appRecords || records.appRecords.length === 0) {
    throw new Error('Wallet creation failed to persist in local:appRecords');
  }

  // Transfer chrome.storage.local to localStorage before saving state
  await page.evaluate((records) => {
    window.localStorage.setItem('appRecords', JSON.stringify(records.appRecords));
  }, records);

  await context.storageState({ path: storageStatePath });
  await context.close();
}

export default globalSetupCreated;
