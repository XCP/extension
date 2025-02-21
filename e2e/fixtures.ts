import { test as base, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';

const pathToExtension = path.resolve('.output/chrome-mv3');

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  unlockWallet: (walletId?: string) => Promise<void>;
}>({
  context: async ({}, use, testInfo) => {
    const userDataDir = (testInfo.project.use as any).userDataDir || '';
    const storageStatePath = (testInfo.project.use as any).storageState || undefined;

    let context: BrowserContext;
    if (testInfo.project.name === 'onboarding') {
      const browser = await chromium.launch({
        headless: false,
        args: [
          `--disable-extensions-except=${pathToExtension}`,
          `--load-extension=${pathToExtension}`,
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-sandbox',
        ],
      });
      context = await browser.newContext();
    } else {
      context = await chromium.launchPersistentContext(userDataDir, {
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
    }

    let [background] = context.serviceWorkers();
    if (!background) background = await context.waitForEvent('serviceworker', { timeout: 15000 });

    context.on('close', () => console.log(`Browser context closed unexpectedly for project: ${testInfo.project.name}`));

    if (storageStatePath) {
      try {
        await context.addInitScript({ path: storageStatePath });
        // Restore localStorage appRecords to chrome.storage.local
        await context.addInitScript(() => {
          const appRecords = window.localStorage.getItem('appRecords');
          if (appRecords) {
            chrome.storage.local.set({ appRecords: JSON.parse(appRecords) });
          }
        });
      } catch (e) {
        console.warn(`Failed to load storage state from ${storageStatePath}: ${e.message}`);
      }
    }

    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [background] = context.serviceWorkers();
    if (!background) background = await context.waitForEvent('serviceworker', { timeout: 15000 });
    const extensionId = background.url().split('/')[2];
    await use(extensionId);
  },
  unlockWallet: async ({ page, extensionId }, use) => {
    const unlock = async (walletId?: string) => {
      await page.goto(`chrome-extension://${extensionId}/popup.html#/unlock-wallet`);
      const records = await page.evaluate(() => chrome.storage.local.get('appRecords'));
      console.log('appRecords before unlock:', records);
      if (!records.appRecords || records.appRecords.length === 0) {
        throw new Error('No wallets found in local:appRecords during unlock');
      }
      if (walletId) {
        await page.selectOption('select[name="wallet"]', walletId);
      }
      await page.fill('input[name="password"]', 'TestPassword123!');
      await page.getByRole('button', { name: /unlock/i }).click();
      await page.waitForURL(/#\/index$/);
      await page.waitForSelector('text=bc1q');
      console.log('Unlock successful, wallet address visible');
    };
    await use(unlock);
  },
});

export const expect = test.expect;
