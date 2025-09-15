import { test, expect } from '@playwright/test';
import {
  launchExtension,
  setupWallet,
  cleanup,
} from '../helpers/test-helpers';

test('UI-based idle timer test', async () => {
  const { context, page } = await launchExtension('ui-idle');

  await setupWallet(page);

  // Navigate directly to advanced settings
  await page.goto(page.url().replace('#/index', '#/settings/advanced'));
  await page.waitForURL(/.*\/settings\/advanced$/);

  // Wait for page to load completely
  await page.waitForTimeout(2000);

  // The 1 minute option should be selected by default
  const oneMinuteOption = page.locator('text="1 Minute"');
  const hasOneMinuteOption = await oneMinuteOption.isVisible();

  if (!hasOneMinuteOption) {
    throw new Error('1 Minute option not found');
  }

  // Click to ensure it's selected (it should be default)
  await oneMinuteOption.click();
  // Wait for settings to save
  await page.waitForTimeout(2000);

  // Navigate back to main page
  await page.goto(page.url().replace('#/settings/advanced', '#/index'));
  await page.waitForURL(/.*\/index$/);

  // Wait a bit for settings to propagate
  await page.waitForTimeout(3000);

  // Reload the page to ensure settings are fresh
  await page.reload();
  await page.waitForTimeout(2000);

  // Wait 65 seconds for the 1-minute timer to trigger (with 5 second buffer)
  await page.waitForTimeout(65000);

  const url = page.url();

  // Check if we're now on unlock page
  if (url.includes('unlock')) {
    await expect(page).toHaveURL(/unlock/);
  } else {
    throw new Error(`Idle timer failed to trigger. Final URL: ${url}`);
  }

  await cleanup(context);
});