import { test, expect } from '@playwright/test';
import {
  launchExtension,
  setupWallet,
  cleanup,
} from '../helpers/test-helpers';

test('Debug idle timer implementation', async () => {
  const { context, page } = await launchExtension('debug-idle');

  // Capture console logs for debugging
  const logs: string[] = [];
  page.on('console', msg => {
    const text = msg.text();
    console.log(`[CONSOLE] ${text}`);
    logs.push(text);
  });

  await setupWallet(page);

  // Set 10-second timeout via storage
  await page.evaluate(() => {
    return new Promise((resolve) => {
      const storageKey = 'local:appRecords';
      chrome.storage.local.get([storageKey], (data) => {
        const records = data[storageKey] || [];
        const settingsIndex = records.findIndex((r: any) => r.id === 'keychain-settings');

        if (settingsIndex !== -1) {
          records[settingsIndex].autoLockTimer = '10s';
          records[settingsIndex].autoLockTimeout = 10000;
        } else {
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

        chrome.storage.local.set({ [storageKey]: records }, () => {
          console.log('[TEST] Settings saved with 10-second timeout');

          // Invalidate the cache by clearing it
          chrome.storage.local.remove('cache_timestamp', () => {
            console.log('[TEST] Cache invalidated');
            resolve(true);
          });
        });
      });
    });
  });

  // Wait for cache to expire (5 second TTL)
  await page.waitForTimeout(6000);

  // Reload to pick up new settings
  await page.reload();
  await page.waitForTimeout(2000);

  console.log('[TEST] Current URL after reload:', page.url());

  // Check if settings are actually loaded
  const settingsResult = await page.evaluate(() => {
    return new Promise((resolve) => {
      const storageKey = 'local:appRecords';
      chrome.storage.local.get([storageKey], (data) => {
        const records = data[storageKey] || [];
        const settings = records.find((r: any) => r.id === 'keychain-settings');
        console.log('[TEST] Current settings:', settings);
        resolve(settings);
      });
    });
  });

  console.log('[TEST] Retrieved settings:', settingsResult);

  // Force a click to trigger activity and see logs
  await page.click('body');
  await page.waitForTimeout(1000);

  // Wait and watch logs for 5 seconds
  console.log('[TEST] Watching for 5 seconds...');
  await page.waitForTimeout(5000);

  // Log all captured messages
  console.log('[TEST] All captured logs:');
  logs.forEach((log, index) => {
    console.log(`  ${index + 1}: ${log}`);
  });

  await cleanup(context);
});