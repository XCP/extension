import { test, expect } from '@playwright/test';
import {
  launchExtension,
  setupWallet,
  cleanup,
} from '../helpers/test-helpers';

test('Direct idle timer injection test', async () => {
  const { context, page } = await launchExtension('idle-direct');

  // Capture console logs
  const logs: string[] = [];
  page.on('console', msg => {
    const text = msg.text();
    console.log(`[CONSOLE] ${text}`);
    logs.push(text);
  });

  await setupWallet(page);

  // Inject a direct idle timer that bypasses all the complex storage/settings system
  await page.evaluate(() => {
    console.log('[DIRECT] Injecting direct idle timer implementation');

    // Create a simple 5-second idle timer
    let timeoutId: NodeJS.Timeout;
    let isIdle = false;

    function startTimer() {
      console.log('[DIRECT] Starting 5-second timer');
      clearTimeout(timeoutId);

      timeoutId = setTimeout(() => {
        console.log('[DIRECT] Timer expired! Triggering lock');
        isIdle = true;

        // Direct navigation to unlock page
        window.location.hash = '/auth/unlock-wallet';
        console.log('[DIRECT] Navigated to unlock page');
      }, 5000);
    }

    function resetTimer() {
      if (!isIdle) {
        console.log('[DIRECT] Activity detected, resetting timer');
        startTimer();
      }
    }

    // Start the timer
    startTimer();

    // Add event listeners
    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, resetTimer, { passive: true });
    });

    console.log('[DIRECT] Direct idle timer setup complete');
  });

  // Wait for the timer to trigger (5 seconds + buffer)
  console.log('[TEST] Waiting 6 seconds for direct timer to trigger...');
  await page.waitForTimeout(6000);

  // Check if we're on unlock page
  const finalUrl = page.url();
  console.log(`[TEST] Final URL: ${finalUrl}`);

  // Should be on unlock page
  if (finalUrl.includes('unlock')) {
    console.log('[TEST] ✅ Direct idle timer worked!');
    await expect(page).toHaveURL(/unlock/);
  } else {
    console.log('[TEST] ❌ Direct idle timer failed');
    console.log(`[TEST] Expected URL to include 'unlock', got: ${finalUrl}`);

    // Log all captured console messages for debugging
    console.log('[TEST] Captured logs:');
    logs.forEach(log => console.log(`  - ${log}`));

    // Force fail with useful error message
    throw new Error(`Direct idle timer failed. URL: ${finalUrl}. Check console logs above.`);
  }

  await cleanup(context);
});

// Test the existing implementation to compare
test('Compare with existing implementation', async () => {
  const { context, page } = await launchExtension('idle-compare');

  // Capture logs for comparison
  page.on('console', msg => {
    console.log(`[EXISTING] ${msg.text()}`);
  });

  await setupWallet(page);

  // Set 5-second timeout via storage
  await page.evaluate(() => {
    return new Promise((resolve) => {
      const storageKey = 'local:appRecords';
      chrome.storage.local.get([storageKey], (data) => {
        const records = data[storageKey] || [];
        const settingsIndex = records.findIndex((r: any) => r.id === 'keychain-settings');

        if (settingsIndex !== -1) {
          records[settingsIndex].autoLockTimer = '10s';
          records[settingsIndex].autoLockTimeout = 5000;
        } else {
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
          console.log('[EXISTING] Settings saved with 5-second timeout');
          resolve(true);
        });
      });
    });
  });

  // Wait for cache to expire and reload
  await page.waitForTimeout(6000);
  await page.reload();
  await page.waitForTimeout(2000);

  // Now wait for idle timer
  console.log('[TEST] Waiting 7 seconds for existing implementation...');
  await page.waitForTimeout(7000);

  const finalUrl = page.url();
  console.log(`[EXISTING] Final URL: ${finalUrl}`);

  await cleanup(context);
});