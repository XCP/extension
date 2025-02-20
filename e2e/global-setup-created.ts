import { chromium } from '@playwright/test';
import path from 'path';

async function globalSetup() {
  const pathToExtension = path.resolve('.output/chrome-mv3');
  // Use the same fixed directory as specified in the "created" project.
  const userDataDir = 'userData/created';

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${pathToExtension}`,
      `--load-extension=${pathToExtension}`,
    ],
  });

  const page = await context.newPage();

  // Wait for the extension’s service worker and extract extensionId.
  let [background] = context.serviceWorkers();
  if (!background) background = await context.waitForEvent("serviceworker");
  const extensionId = background.url().split("/")[2];

  // Navigate to onboarding.
  await page.goto(`chrome-extension://${extensionId}/popup.html#/onboarding`);

  // Click "Create Wallet"
  await page.getByRole('link', { name: /create wallet/i }).click();

  // Fill in the form (adjust selectors as needed).
  await page.fill('input[name="password"]', 'TestPassword123!');

  // Submit the form.
  await page.getByRole('button', { name: /create/i }).click();

  // Wait for navigation to the main page.
  await page.waitForURL(/\/index/);
  // Optionally, wait for an element confirming the wallet is active.
  await page.waitForSelector('text=bc1q');

  await context.close();
}

export default globalSetup;
