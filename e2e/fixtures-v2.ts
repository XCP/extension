import { test as base, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';
import { initializeExtension } from './helpers/extension-init';
import { ensureWalletReady, unlockWallet } from './helpers/auth-helpers';

const pathToExtension = path.resolve('.output/chrome-mv3');

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  authenticatedPage: any; // Page that ensures wallet is unlocked
}>({
  context: async ({}, use, testInfo) => {
    const userDataDir = (testInfo.project.use as any).userDataDir || '';
    
    let context: BrowserContext;
    if (testInfo.project.name === 'onboarding') {
      // Fresh browser for onboarding tests
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
      // Persistent context for other tests
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

    // Initialize extension and wait for services
    await initializeExtension(context);

    await use(context);
    await context.close();
  },
  
  extensionId: async ({ context }, use) => {
    const { extensionId } = await initializeExtension(context);
    await use(extensionId);
  },
  
  authenticatedPage: async ({ context, extensionId }, use) => {
    // Create a page that ensures wallet is ready
    const page = await context.newPage();
    
    // Navigate to extension
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.waitForLoadState('networkidle');
    
    // Ensure wallet is unlocked
    const ready = await ensureWalletReady(page, extensionId);
    if (!ready) {
      throw new Error('Failed to prepare authenticated page');
    }
    
    await use(page);
    await page.close();
  },
});

export const expect = test.expect;