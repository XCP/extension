/**
 * Quick verification of UX fixes
 */

import { test } from '@playwright/test';
import { launchExtension, createWallet, cleanup, TEST_PASSWORD } from '../helpers/test-helpers';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const screenshotsDir = path.join(__dirname, '../../test-results/ux-fixes');

test.describe('Verify UX Fixes', () => {
  test('Capture screenshots of fixed pages', async () => {
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    const { context, page, extensionId } = await launchExtension('ux-fixes');

    try {
      await createWallet(page, TEST_PASSWORD);
      await page.waitForTimeout(2000);

      const baseUrl = `chrome-extension://${extensionId}/popup.html#`;

      // 1. Address History (should show empty state, not error)
      console.log('Testing Address History empty state...');
      await page.goto(`${baseUrl}/address-history`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(screenshotsDir, '01-address-history.png'), fullPage: true });

      // 2. Verify Message (new input order)
      console.log('Testing Verify Message new order...');
      await page.goto(`${baseUrl}/actions/verify-message`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(screenshotsDir, '02-verify-message.png'), fullPage: true });

      // 3. Advanced Settings (with info icons)
      console.log('Testing Advanced Settings info icons...');
      await page.goto(`${baseUrl}/settings/advanced`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(screenshotsDir, '03-advanced-settings.png'), fullPage: true });

      // Hover over an info icon to show tooltip
      const infoIcon = page.locator('button[aria-label*="Info"]').first();
      if (await infoIcon.isVisible()) {
        await infoIcon.hover();
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(screenshotsDir, '04-advanced-settings-tooltip.png'), fullPage: true });
      }

      console.log('\n✓ All UX fix screenshots captured');

    } finally {
      await cleanup(context);
    }
  });
});
