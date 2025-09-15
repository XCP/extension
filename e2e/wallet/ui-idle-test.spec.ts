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

  // Look for the 10 seconds dev option in the radio list
  let usingTestTimer = false;

  // First check if we have the 10 seconds dev option (only in dev mode)
  const tenSecondsOption = page.locator('text="10 Seconds (Dev)"');
  const hasTenSecondsOption = await tenSecondsOption.isVisible();

  if (hasTenSecondsOption) {
    await tenSecondsOption.click();
    // Wait for settings to save
    await page.waitForTimeout(2000);
    usingTestTimer = true;
  } else {

    // Click the 1 minute option
    const oneMinuteOption = page.locator('text="1 Minute"');
    if (await oneMinuteOption.isVisible()) {
      await oneMinuteOption.click();
      await page.waitForTimeout(1000);
    } else {
      throw new Error('No timer controls found on advanced settings page');
    }
  }

  // Navigate back to main page
  await page.goto(page.url().replace('#/settings/advanced', '#/index'));
  await page.waitForURL(/.*\/index$/);

  // Wait a bit for settings to propagate
  await page.waitForTimeout(3000);

  // Reload the page to ensure settings are fresh
  await page.reload();
  await page.waitForTimeout(2000);
  const startTime = Date.now();

  // Use different wait times based on what we clicked
  const waitTime = usingTestTimer ? 15000 : 70000; // 15 seconds for 10s, 70 seconds for 1 minute
  await page.waitForTimeout(waitTime);

  const url = page.url();

  // Check if we're now on unlock page
  if (url.includes('unlock')) {
    await expect(page).toHaveURL(/unlock/);
  } else {
    throw new Error(`Idle timer failed to trigger. Final URL: ${url}`);
  }

  await cleanup(context);
});