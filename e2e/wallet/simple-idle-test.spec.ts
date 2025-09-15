import { test, expect } from '@playwright/test';
import {
  launchExtension,
  setupWallet,
  cleanup,
} from '../helpers/test-helpers';

test('Simple idle timer test', async () => {
  const { context, page } = await launchExtension('simple-idle');

  await setupWallet(page);

  // Set 10-second timeout via storage
  console.log('[TEST] Setting 10-second timeout in storage...');
  const storageResult = await page.evaluate(() => {
    return new Promise((resolve) => {
      const storageKey = 'local:appRecords';
      chrome.storage.local.get([storageKey], (data) => {
        const records = data[storageKey] || [];
        const settingsIndex = records.findIndex((r: any) => r.id === 'keychain-settings');

        if (settingsIndex !== -1) {
          console.log('[TEST] Found existing settings, updating...');
          records[settingsIndex].autoLockTimer = '10s';
          records[settingsIndex].autoLockTimeout = 10000;
        } else {
          console.log('[TEST] Creating new settings...');
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
          console.log('[TEST] Storage updated with timeout:', records[settingsIndex >= 0 ? settingsIndex : records.length - 1].autoLockTimeout);
          resolve({ success: true, timeout: records[settingsIndex >= 0 ? settingsIndex : records.length - 1].autoLockTimeout });
        });
      });
    });
  });
  console.log('[TEST] Storage result:', storageResult);

  // Wait for cache to expire
  await page.waitForTimeout(6000);

  // Reload to pick up new settings
  await page.reload();
  await page.waitForTimeout(2000);

  // Debug: Check if idle timer config is correct
  const debugInfo = await page.evaluate(() => {
    return (window as any).idleTimerDebug;
  });
  console.log('[TEST] Idle timer debug info:', debugInfo);

  console.log('[TEST] Starting 12-second wait for idle timer...');
  const startTime = Date.now();

  // Wait 12 seconds without any activity
  await page.waitForTimeout(12000);

  const url = page.url();
  console.log(`[TEST] After 12 seconds, URL is: ${url}`);
  console.log(`[TEST] Elapsed time: ${Date.now() - startTime}ms`);

  // Check if we're now on unlock page
  const isOnUnlockPage = url.includes('unlock');
  console.log(`[TEST] Is on unlock page: ${isOnUnlockPage}`);

  if (isOnUnlockPage) {
    console.log('[TEST] ✅ Idle timer worked!');
    await expect(page).toHaveURL(/unlock/);
  } else {
    console.log('[TEST] ❌ Idle timer did not trigger');
    // Let's wait a bit more to see if it's just delayed
    await page.waitForTimeout(5000);
    const finalUrl = page.url();
    console.log(`[TEST] Final URL after additional wait: ${finalUrl}`);

    if (finalUrl.includes('unlock')) {
      console.log('[TEST] ✅ Idle timer worked after additional wait!');
      await expect(page).toHaveURL(/unlock/);
    } else {
      throw new Error(`Idle timer failed to trigger. Final URL: ${finalUrl}`);
    }
  }

  await cleanup(context);
});