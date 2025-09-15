import { test, expect } from '@playwright/test';
import {
  launchExtension,
  setupWallet,
  unlockWallet,
  cleanup,
  TEST_PASSWORD
} from '../helpers/test-helpers';

test.describe('Idle Timer Auto-Lock', () => {
  test('should auto-lock wallet after idle timeout', async () => {
    const { context, page } = await launchExtension('idle-timer-test');
    await setupWallet(page);

    // Set auto-lock timer to 10 seconds via storage API
    await page.evaluate(() => {
      return new Promise((resolve) => {
        chrome.storage.local.get(['records'], (data) => {
          const records = data.records || [];
          const settingsIndex = records.findIndex((r: any) => r.id === 'keychain-settings');

          if (settingsIndex !== -1) {
            records[settingsIndex].autoLockTimer = '10s';
            records[settingsIndex].autoLockTimeout = 10000;
          } else {
            // Create settings record if it doesn't exist
            records.push({
              id: 'keychain-settings',
              autoLockTimer: '10s',
              autoLockTimeout: 10000,
              showHelpText: false,
              analyticsAllowed: true,
              allowUnconfirmedTxs: true,
              enableMPMA: false,
              enableAdvancedBroadcasts: false,
              enableAdvancedBetting: false,
              transactionDryRun: false,
              pinnedAssets: [],
              counterpartyApiBase: 'https://api.counterparty.io:4000',
              defaultOrderExpiration: 8064,
              connectedWebsites: []
            });
          }

          chrome.storage.local.set({ records }, () => {
            console.log('Idle timer set to 10 seconds');
            resolve(true);
          });
        });
      });
    });

    // Reload page to apply settings
    await page.reload();
    await page.waitForTimeout(1000);

    // Verify wallet is on index page (unlocked)
    await expect(page).toHaveURL(/index/);

    // Wait for idle timeout (10 seconds + small buffer)
    console.log('Waiting 11 seconds for idle timer to trigger...');
    await page.waitForTimeout(11000);

    // Check if redirected to unlock page
    await expect(page).toHaveURL(/unlock/);
    await expect(page.locator('input[name="password"]')).toBeVisible();

    await cleanup(context);
  });

  test('should reset idle timer on user activity', async () => {
    const { context, page } = await launchExtension('idle-timer-reset');
    await setupWallet(page);

    // Set auto-lock timer to 10 seconds
    await page.evaluate(() => {
      return new Promise((resolve) => {
        chrome.storage.local.get(['records'], (data) => {
          const records = data.records || [];
          const settingsIndex = records.findIndex((r: any) => r.id === 'keychain-settings');

          if (settingsIndex !== -1) {
            records[settingsIndex].autoLockTimer = '10s';
            records[settingsIndex].autoLockTimeout = 10000;
          }

          chrome.storage.local.set({ records }, () => {
            resolve(true);
          });
        });
      });
    });

    // Reload to apply settings
    await page.reload();
    await page.waitForTimeout(1000);

    // Verify on index page
    await expect(page).toHaveURL(/index/);

    // Keep active for 15 seconds by triggering events every 5 seconds
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(5000);
      // Trigger mouse movement to reset timer
      await page.mouse.move(100 + i * 10, 100 + i * 10);
      console.log(`Activity ${i + 1}: Timer should reset`);
    }

    // Should still be on index page after 15 seconds of activity
    await expect(page).toHaveURL(/index/);

    // Now wait without activity
    console.log('Waiting 11 seconds without activity...');
    await page.waitForTimeout(11000);

    // Should be locked now
    await expect(page).toHaveURL(/unlock/);

    await cleanup(context);
  });
});