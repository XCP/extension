import { test, expect } from '@playwright/test';
import {
  launchExtension,
  setupWallet,
  cleanup,
} from '../helpers/test-helpers';

test.describe('Idle Timer Debug', () => {
  test('debug idle timer logs and behavior', async () => {
    const { context, page } = await launchExtension('idle-timer-debug');

    // Capture console logs from all contexts
    const logs: string[] = [];
    const allPages = await context.pages();

    // Listen to console on all pages including background
    for (const p of allPages) {
      p.on('console', msg => {
        const text = msg.text();
        console.log(`[CONSOLE ${p.url()}] ${text}`);
        if (text.includes('IdleTimer') || text.includes('Config:') || text.includes('TEST')) {
          logs.push(`${p.url()}: ${text}`);
        }
      });
    }

    // Also listen on the main popup page
    page.on('console', msg => {
      const text = msg.text();
      console.log(`[POPUP CONSOLE] ${text}`);
      if (text.includes('IdleTimer') || text.includes('Config:') || text.includes('TEST')) {
        logs.push(`popup: ${text}`);
      }
    });

    await setupWallet(page);

    // Set 5-second timeout for debugging using correct storage key
    await page.evaluate(() => {
      console.log('[TEST] Starting to set idle timer settings');
      return new Promise((resolve) => {
        // Use the correct storage key that the app uses
        const storageKey = 'local:appRecords';

        chrome.storage.local.get([storageKey], (data) => {
          console.log('[TEST] Current storage data:', data);
          const records = data[storageKey] || [];
          const settingsIndex = records.findIndex(r => r.id === 'keychain-settings');

          if (settingsIndex !== -1) {
            console.log('[TEST] Found settings record, updating...');
            records[settingsIndex].autoLockTimer = '10s';
            records[settingsIndex].autoLockTimeout = 5000; // 5 seconds for debug
            console.log('[TEST] Updated settings:', records[settingsIndex]);
          } else {
            console.log('[TEST] No settings record found, creating new one');
            records.push({
              id: 'keychain-settings',
              autoLockTimer: '10s',
              autoLockTimeout: 5000,
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
            console.log('[TEST] Settings saved successfully to', storageKey);
            resolve(true);
          });
        });
      });
    });

    // Wait for cache TTL to expire (5 seconds) then reload
    console.log('[TEST] Waiting 6 seconds for cache TTL to expire...');
    await page.waitForTimeout(6000);

    // Reload to apply settings
    await page.reload();
    await page.waitForTimeout(2000);

    // Verify we're on the index page
    await expect(page).toHaveURL(/index/);
    console.log('[TEST] On index page, waiting 7 seconds for idle timer...');

    // Wait and check every second
    for (let i = 0; i < 7; i++) {
      await page.waitForTimeout(1000);
      const currentUrl = page.url();
      console.log(`[TEST] Second ${i + 1}: URL is ${currentUrl}`);

      if (currentUrl.includes('unlock')) {
        console.log('[TEST] ✅ Redirected to unlock page!');
        break;
      }
    }

    const finalUrl = page.url();
    console.log(`[TEST] Final URL: ${finalUrl}`);
    console.log(`[TEST] Console logs captured: ${logs.length}`);
    logs.forEach(log => console.log(`  - ${log}`));

    await cleanup(context);
  });
});