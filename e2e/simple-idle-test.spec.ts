import { test, expect } from '@playwright/test';
import { launchExtension, cleanup } from './helpers/test-helpers';

test('Simple idle timer functionality test', async () => {
  const { context, page } = await launchExtension('simple-idle');

  // Inject a simple idle timer test
  await page.evaluate(() => {
    let timerStarted = false;
    let timeoutId: NodeJS.Timeout;

    // Simple idle timer implementation
    function startIdleTimer() {
      console.log('[SIMPLE] Starting idle timer for 3 seconds');
      timerStarted = true;

      // Clear any existing timer
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Set a 3-second timer
      timeoutId = setTimeout(() => {
        console.log('[SIMPLE] IDLE TRIGGERED! Timer worked!');

        // Change page title to indicate success
        document.title = 'IDLE TIMER WORKED';
      }, 3000);
    }

    // Reset timer on activity
    function resetTimer() {
      if (timerStarted) {
        console.log('[SIMPLE] Resetting timer due to activity');
        startIdleTimer();
      }
    }

    // Start the timer
    startIdleTimer();

    // Add event listeners
    ['mousedown', 'mousemove', 'keydown'].forEach(eventType => {
      document.addEventListener(eventType, resetTimer);
    });

    console.log('[SIMPLE] Simple idle timer setup complete');
  });

  // Wait for 4 seconds (longer than the 3-second timeout)
  await page.waitForTimeout(4000);

  // Check if the timer worked by checking the document title
  const title = await page.title();
  console.log('[TEST] Final title:', title);

  expect(title).toBe('IDLE TIMER WORKED');

  await cleanup(context);
});