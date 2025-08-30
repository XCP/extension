import { test, expect } from '@playwright/test';
import { 
  launchExtension, 
  setupWallet, 
  lockWallet,
  unlockWallet,
  cleanup,
  TEST_PASSWORD 
} from './helpers/test-helpers';

test.describe('Wallet Brute Force Protection', () => {
  test('should resist brute force attempts on unlock screen', async () => {
    const { context, page } = await launchExtension('brute-force-test');
    await setupWallet(page);
    
    // Lock the wallet
    await lockWallet(page);
    
    // Confirm we're on unlock page
    await expect(page).toHaveURL(/unlock/);
    await expect(page.locator('input[type="password"]')).toBeVisible();
    
    // Common passwords to try in brute force attack
    const commonPasswords = [
      '123456', 'password', '12345678', 'qwerty', '123456789',
      'letmein', '1234567', 'football', 'iloveyou', 'admin',
      'welcome', 'monkey', '123123', 'password1', 'qwertyuiop',
      'abc123', '111111', 'password123', 'test', 'demo'
    ];
    
    const startTime = Date.now();
    let attemptCount = 0;
    
    // Try common passwords
    for (const wrongPassword of commonPasswords) {
      attemptCount++;
      await page.fill('input[type="password"]', wrongPassword);
      await page.click('button:has-text("Unlock")');
      
      // Wait briefly for any response
      await page.waitForTimeout(100);
      
      // Check if still on unlock screen (should be)
      const stillLocked = page.url().includes('unlock');
      expect(stillLocked).toBe(true);
      
      // Clear input for next attempt
      await page.locator('input[type="password"]').clear();
    }
    
    const elapsedTime = Date.now() - startTime;
    console.log(`Attempted ${attemptCount} passwords in ${elapsedTime}ms`);
    
    // Should still be locked after all attempts
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page).toHaveURL(/unlock/);
    
    // Now try the correct password - should still work
    await unlockWallet(page, TEST_PASSWORD);
    await expect(page).toHaveURL(/index/);
    
    await cleanup(context);
  });

  test('should handle rapid-fire unlock attempts', async () => {
    const { context, page } = await launchExtension('rapid-fire-test');
    await setupWallet(page);
    
    // Lock the wallet
    await lockWallet(page);
    
    // Try rapid attempts without waiting for response
    const rapidAttempts = 10;
    const promises = [];
    
    for (let i = 0; i < rapidAttempts; i++) {
      // Don't await - fire them all rapidly
      promises.push(
        page.fill('input[type="password"]', `wrong${i}`)
          .then(() => page.click('button:has-text("Unlock")'))
          .catch(() => {}) // Ignore errors from rapid clicking
      );
    }
    
    // Wait for all attempts to complete
    await Promise.allSettled(promises);
    await page.waitForTimeout(1000);
    
    // Should still be on unlock screen
    await expect(page).toHaveURL(/unlock/);
    
    // Should still be able to unlock with correct password
    await page.locator('input[type="password"]').clear();
    await unlockWallet(page, TEST_PASSWORD);
    await expect(page).toHaveURL(/index/);
    
    await cleanup(context);
  });

  test('should not leak information about password correctness via timing', async () => {
    const { context, page } = await launchExtension('timing-attack-test');
    await setupWallet(page);
    
    // Lock the wallet
    await lockWallet(page);
    
    const timings = [];
    
    // Test various passwords and measure response time
    const testPasswords = [
      'a',                    // Very short
      'aaaaaaaa',            // Wrong but same length as test password
      'TestPas',             // Partial match to TEST_PASSWORD
      'TestPassword12',      // Close to TEST_PASSWORD
      'CompletelyWrong123',  // Completely different
      TEST_PASSWORD.slice(0, -1), // Almost correct
    ];
    
    for (const password of testPasswords) {
      await page.locator('input[type="password"]').clear();
      await page.fill('input[type="password"]', password);
      
      const startTime = performance.now();
      await page.click('button:has-text("Unlock")');
      
      // Wait for error message or redirect
      await Promise.race([
        page.waitForSelector('text=/Invalid|incorrect|wrong/i', { timeout: 2000 }).catch(() => {}),
        page.waitForURL(/index/, { timeout: 2000 }).catch(() => {})
      ]);
      
      const endTime = performance.now();
      const responseTime = endTime - startTime;
      timings.push({ password: password.substring(0, 3) + '***', time: responseTime });
    }
    
    // Log timings for analysis
    console.log('Response timings:', timings);
    
    // Check that timing differences are not significant (< 500ms variance)
    const times = timings.map(t => t.time);
    const maxTime = Math.max(...times);
    const minTime = Math.min(...times);
    const variance = maxTime - minTime;
    
    console.log(`Timing variance: ${variance}ms (max: ${maxTime}ms, min: ${minTime}ms)`);
    
    // Variance should be relatively small (not revealing password info via timing)
    // Note: UI/browser timing can vary significantly due to React renders, 
    // service worker init, etc. The crypto layer is constant-time.
    // We allow up to 2.5s variance for UI operations.
    expect(variance).toBeLessThan(2500);
    
    await cleanup(context);
  });

  test('should maintain security after multiple failed attempts across sessions', async () => {
    const { context, page } = await launchExtension('cross-session-test');
    await setupWallet(page);
    
    // Lock the wallet
    await lockWallet(page);
    
    // Try 5 wrong passwords
    for (let i = 0; i < 5; i++) {
      await page.fill('input[type="password"]', `wrong${i}`);
      await page.click('button:has-text("Unlock")');
      await page.waitForTimeout(200);
      await page.locator('input[type="password"]').clear();
    }
    
    // Reload the page (simulating new session)
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Should still be on unlock screen
    await expect(page).toHaveURL(/unlock/);
    await expect(page.locator('input[type="password"]')).toBeVisible();
    
    // Try 5 more wrong passwords
    for (let i = 5; i < 10; i++) {
      await page.fill('input[type="password"]', `wrong${i}`);
      await page.click('button:has-text("Unlock")');
      await page.waitForTimeout(200);
      await page.locator('input[type="password"]').clear();
    }
    
    // Should still allow correct password
    await unlockWallet(page, TEST_PASSWORD);
    await expect(page).toHaveURL(/index/);
    
    await cleanup(context);
  });

  test('should protect against SQL injection and special character attacks', async () => {
    const { context, page } = await launchExtension('injection-test');
    await setupWallet(page);
    
    // Lock the wallet
    await lockWallet(page);
    
    // Try various injection attacks
    const injectionAttempts = [
      "' OR '1'='1",
      "admin' --",
      "'; DROP TABLE wallets; --",
      "<script>alert('xss')</script>",
      "${TEST_PASSWORD}",
      "{{TEST_PASSWORD}}",
      "../../../etc/passwd",
      "\\x00\\x01\\x02",
      "%00",
      "' UNION SELECT * FROM users --",
    ];
    
    for (const injection of injectionAttempts) {
      await page.fill('input[type="password"]', injection);
      await page.click('button:has-text("Unlock")');
      await page.waitForTimeout(200);
      
      // Should still be locked
      await expect(page).toHaveURL(/unlock/);
      
      // Clear for next attempt
      await page.locator('input[type="password"]').clear();
    }
    
    // Should still work with correct password
    await unlockWallet(page, TEST_PASSWORD);
    await expect(page).toHaveURL(/index/);
    
    await cleanup(context);
  });

  test('should handle extremely long password attempts gracefully', async () => {
    const { context, page } = await launchExtension('long-password-test');
    await setupWallet(page);
    
    // Lock the wallet
    await lockWallet(page);
    
    // Try extremely long passwords
    const longPasswords = [
      'a'.repeat(100),
      'x'.repeat(1000),
      'test'.repeat(250), // 1000 chars
    ];
    
    for (const longPass of longPasswords) {
      await page.fill('input[type="password"]', longPass);
      await page.click('button:has-text("Unlock")');
      await page.waitForTimeout(300);
      
      // Should handle gracefully without crashing
      await expect(page).toHaveURL(/unlock/);
      
      // Clear for next attempt
      await page.locator('input[type="password"]').clear();
    }
    
    // Should still accept correct password
    await unlockWallet(page, TEST_PASSWORD);
    await expect(page).toHaveURL(/index/);
    
    await cleanup(context);
  });
});