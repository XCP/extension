import { chromium } from '@playwright/test';
import path from 'path';

async function globalSetup() {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  const userDataDir = 'userData/imported';

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${pathToExtension}`,
      `--load-extension=${pathToExtension}`,
    ],
  });

  const page = await context.newPage();

  let [background] = context.serviceWorkers();
  if (!background) background = await context.waitForEvent("serviceworker");
  const extensionId = background.url().split("/")[2];

  await page.goto(`chrome-extension://${extensionId}/popup.html#/onboarding`);

  // Click "Import Wallet"
  await page.getByRole('link', { name: /import wallet/i }).click();

  // Wait for the import wallet form.
  await page.waitForSelector('textarea[name="mnemonic"]');

  // Fill in the mnemonic with the test mnemonic.
  await page.fill(
    'textarea[name="mnemonic"]',
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
  );

  // Fill in password (and confirm password if needed).
  await page.fill('input[name="password"]', 'TestPassword123!');

  // Submit the form.
  await page.getByRole('button', { name: /import/i }).click();

  // Wait until the active address appears.
  await page.waitForSelector('text=bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');

  await context.close();
}

export default globalSetup;
