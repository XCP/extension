import { test as base, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';

const pathToExtension = path.resolve('.output/chrome-mv3');

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  context: async ({}, use, testInfo) => {
    // Retrieve our custom userDataDir property.
    // Cast testInfo.project.use to any so that TypeScript ignores unknown properties.
    const userDataDir = (testInfo.project.use as any).userDataDir || '';
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false, // Use headed mode for extension testing.
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [background] = context.serviceWorkers();
    if (!background) background = await context.waitForEvent('serviceworker');
    const extensionId = background.url().split('/')[2];
    await use(extensionId);
  },
});

export const expect = test.expect;
