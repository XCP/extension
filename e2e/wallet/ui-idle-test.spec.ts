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

  // Look for the development-only 10s timer button first
  console.log('[TEST] Looking for 10s test timer button...');
  const testButton = page.locator('text="Enable 10s Test Timer"');

  // Check if the dev section is visible
  const idleTimerSection = page.locator('text="Idle Timer Testing"');
  const isDevSectionVisible = await idleTimerSection.isVisible();
  console.log('[TEST] Dev section visible:', isDevSectionVisible);

  let usingTestTimer = false;
  if (isDevSectionVisible && await testButton.isVisible()) {
    console.log('[TEST] Found 10s test timer button, clicking...');
    await testButton.click();
    await page.waitForTimeout(1000);
    usingTestTimer = true;
  } else {
    console.log('[TEST] 10s test timer button not found, looking for radio buttons...');

    // Look for any radio button first
    const radioButtons = page.locator('input[type="radio"]');
    const radioCount = await radioButtons.count();
    console.log('[TEST] Found', radioCount, 'radio buttons');

    if (radioCount > 0) {
      // Try clicking the first radio button (1 minute should be first)
      console.log('[TEST] Clicking first radio button...');
      await radioButtons.first().click();
      await page.waitForTimeout(1000);
    } else {
      console.log('[TEST] No radio buttons found, taking screenshot for debugging...');
      await page.screenshot({ path: 'debug-advanced-settings.png' });
      throw new Error('No timer controls found on advanced settings page');
    }
  }

  // Navigate back to main page
  console.log('[TEST] Navigating back to main page...');
  await page.goto(page.url().replace('#/settings/advanced', '#/index'));
  await page.waitForURL(/.*\/index$/);

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