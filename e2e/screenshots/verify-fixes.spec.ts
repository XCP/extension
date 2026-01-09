/**
 * Quick verification that the bug fixes work
 */

import { test, expect } from '@playwright/test';
import { launchExtension, createWallet, cleanup, TEST_PASSWORD } from '../helpers/test-helpers';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const screenshotsDir = path.join(__dirname, '../../test-results/verify-fixes');

test.describe('Verify Bug Fixes', () => {
  test('Sign Message, Verify Message, and Consolidate pages should load without crashing', async () => {
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    const { context, page, extensionId } = await launchExtension('verify-fixes');

    try {
      await createWallet(page, TEST_PASSWORD);
      await page.waitForTimeout(2000);

      const baseUrl = `chrome-extension://${extensionId}/popup.html#`;

      // Test Sign Message page
      console.log('Testing Sign Message...');
      await page.goto(`${baseUrl}/actions/sign-message`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);

      // Check if error boundary triggered
      const signMessageError = await page.locator('text=Something went wrong').count();
      await page.screenshot({ path: path.join(screenshotsDir, 'sign-message.png'), fullPage: true });

      if (signMessageError > 0) {
        console.log('  ✗ Sign Message still crashing');
      } else {
        console.log('  ✓ Sign Message loads correctly');
      }

      // Test Verify Message page
      console.log('Testing Verify Message...');
      await page.goto(`${baseUrl}/actions/verify-message`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);

      const verifyMessageError = await page.locator('text=Something went wrong').count();
      await page.screenshot({ path: path.join(screenshotsDir, 'verify-message.png'), fullPage: true });

      if (verifyMessageError > 0) {
        console.log('  ✗ Verify Message still crashing');
      } else {
        console.log('  ✓ Verify Message loads correctly');
      }

      // Test Consolidate page
      console.log('Testing Consolidate...');
      await page.goto(`${baseUrl}/consolidate`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);

      const consolidateError = await page.locator('text=Something went wrong').count();
      await page.screenshot({ path: path.join(screenshotsDir, 'consolidate.png'), fullPage: true });

      if (consolidateError > 0) {
        console.log('  ✗ Consolidate still crashing');
      } else {
        console.log('  ✓ Consolidate loads correctly');
      }

      // Assert all pages load without error
      expect(signMessageError).toBe(0);
      expect(verifyMessageError).toBe(0);
      expect(consolidateError).toBe(0);

    } finally {
      await cleanup(context);
    }
  });
});
