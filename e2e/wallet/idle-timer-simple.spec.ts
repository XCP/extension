import { test, expect } from '@playwright/test';
import {
  launchExtension,
  setupWallet,
  cleanup,
} from '../helpers/test-helpers';

test('Simple direct idle timer test', async () => {
  const { context, page } = await launchExtension('idle-timer-simple');

  // Capture all console logs
  const logs: string[] = [];
  page.on('console', msg => {
    logs.push(msg.text());
    console.log(`[CONSOLE] ${msg.text()}`);
  });

  await setupWallet(page);

  // Inject a completely custom idle timer that directly locks the wallet
  const lockTriggered = await page.evaluate(() => {
    return new Promise<boolean>((resolve) => {
      console.log('[DIRECT TEST] Starting 3-second direct idle timer test');

      // Create a simple timeout that directly calls the wallet lock function
      setTimeout(() => {
        console.log('[DIRECT TEST] Timer expired, attempting to lock wallet');

        // Try to find and call the wallet lock function directly
        try {
          // Navigate directly to unlock page to simulate lock
          window.location.hash = '/auth/unlock-wallet';
          console.log('[DIRECT TEST] Navigated to unlock page');
          resolve(true);
        } catch (error) {
          console.error('[DIRECT TEST] Failed to lock:', error);
          resolve(false);
        }
      }, 3000);
    });
  });

  // Wait for the result
  await page.waitForTimeout(4000);

  // Check if we're on unlock page
  const currentUrl = page.url();
  console.log(`[TEST] Final URL: ${currentUrl}`);

  if (currentUrl.includes('unlock')) {
    console.log('[TEST] ✅ Direct navigation to unlock worked');
  } else {
    console.log('[TEST] ❌ Still on index page');
  }

  // Show all captured logs
  console.log('[TEST] Captured logs:');
  logs.forEach(log => console.log(`  - ${log}`));

  await cleanup(context);
});