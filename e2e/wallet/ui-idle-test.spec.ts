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
  console.log('[TEST] Navigating to advanced settings...');
  await page.goto(page.url().replace('#/index', '#/settings/advanced'));
  await page.waitForURL(/.*\/settings\/advanced$/);

  // Wait for page to load completely
  await page.waitForTimeout(2000);

  // Look for the 10 seconds dev option in the radio list
  console.log('[TEST] Looking for timer options...');

  let usingTestTimer = false;

  // First check if we have the 10 seconds dev option (only in dev mode)
  const tenSecondsOption = page.locator('text="10 Seconds (Dev)"');
  const hasTenSecondsOption = await tenSecondsOption.isVisible();

  if (hasTenSecondsOption) {
    console.log('[TEST] Found 10 seconds dev option, clicking...');
    await tenSecondsOption.click();

    // Wait for settings to save
    await page.waitForTimeout(2000);

    // Verify the selection was saved by checking if it's selected
    const isSelected = await page.locator('input[type="radio"]:checked').isVisible();
    console.log('[TEST] Radio button selected:', isSelected);

    usingTestTimer = true;
  } else {
    console.log('[TEST] No 10 seconds dev option found, using 1 minute option...');

    // Click the 1 minute option
    const oneMinuteOption = page.locator('text="1 Minute"');
    if (await oneMinuteOption.isVisible()) {
      console.log('[TEST] Clicking 1 minute option...');
      await oneMinuteOption.click();
      await page.waitForTimeout(1000);
    } else {
      console.log('[TEST] No timer options found, taking screenshot for debugging...');
      await page.screenshot({ path: 'debug-advanced-settings.png' });
      throw new Error('No timer controls found on advanced settings page');
    }
  }

  // Navigate back to main page
  console.log('[TEST] Navigating back to main page...');
  await page.goto(page.url().replace('#/settings/advanced', '#/index'));
  await page.waitForURL(/.*\/index$/);

  // Wait a bit for settings to propagate
  await page.waitForTimeout(3000);

  // Reload the page to ensure settings are fresh
  console.log('[TEST] Reloading page to ensure settings are loaded...');
  await page.reload();
  await page.waitForTimeout(2000);

  // Debug: Check if idle timer config is correct
  const debugInfo = await page.evaluate(() => {
    return (window as any).idleTimerDebug;
  });
  console.log('[TEST] Idle timer debug info after reload:', debugInfo);

  console.log('[TEST] Starting wait for idle timer...');
  const startTime = Date.now();

  // Use different wait times based on what we clicked
  const waitTime = usingTestTimer ? 15000 : 70000; // 15 seconds for 10s, 70 seconds for 1 minute
  console.log(`[TEST] Waiting ${waitTime}ms for idle timer to trigger... (using ${usingTestTimer ? '10s test' : '1m'} timer)`);

  await page.waitForTimeout(waitTime);

  const url = page.url();
  console.log(`[TEST] After wait, URL is: ${url}`);
  console.log(`[TEST] Elapsed time: ${Date.now() - startTime}ms`);

  // Check if we're now on unlock page
  const isOnUnlockPage = url.includes('unlock');
  console.log(`[TEST] Is on unlock page: ${isOnUnlockPage}`);

  if (isOnUnlockPage) {
    console.log('[TEST] ✅ Idle timer worked!');
    await expect(page).toHaveURL(/unlock/);
  } else {
    console.log('[TEST] ❌ Idle timer did not trigger');
    throw new Error(`Idle timer failed to trigger. Final URL: ${url}`);
  }

  await cleanup(context);
});