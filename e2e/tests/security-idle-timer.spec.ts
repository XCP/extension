/**
 * Idle Timer Tests
 *
 * Tests for the auto-lock idle timer functionality.
 */

import {
  walletTest,
  expect,
  navigateTo
} from '../fixtures';
import { settings } from '../selectors';

walletTest('idle timer triggers auto-lock', async ({ page }) => {
  await page.goto(page.url().replace('#/index', '#/settings/advanced'));
  await page.waitForURL(/.*\/settings\/advanced$/);

  const oneMinuteOption = settings.oneMinuteOption(page);
  const hasOneMinuteOption = await oneMinuteOption.isVisible();

  if (!hasOneMinuteOption) {
    throw new Error('1 Minute option not found');
  }

  await oneMinuteOption.click();

  await page.goto(page.url().replace('#/settings/advanced', '#/index'));
  await page.waitForURL(/.*\/index$/);

  await page.reload();

  // Wait 65 seconds for the 1-minute timer to trigger
  await page.waitForTimeout(65000);

  const url = page.url();

  if (url.includes('unlock')) {
    await expect(page).toHaveURL(/unlock/);
  } else {
    throw new Error(`Idle timer failed to trigger. Final URL: ${url}`);
  }
});
