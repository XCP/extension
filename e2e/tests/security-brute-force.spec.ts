/**
 * Wallet Security Tests - Brute Force Protection
 *
 * Tests verifying protection against brute force attacks on the wallet unlock.
 */

import { walletTest, expect, lockWallet, unlockWallet, TEST_PASSWORD } from '../fixtures';
import { unlock } from '../selectors';

walletTest.describe('Brute Force Protection', () => {
  walletTest('rate-limits brute force attempts on unlock screen', async ({ page }) => {
    await lockWallet(page);
    await expect(page).toHaveURL(/unlock/);
    await expect(unlock.passwordInput(page)).toBeVisible();

    // Five failures fill the rate-limit window (5 per minute)
    // All passwords must be >= 8 chars (MIN_PASSWORD_LENGTH) to enable the unlock button
    const commonPasswords = [
      '12345678', 'password', 'qwerty12', 'administrator', 'testtest'
    ];

    for (const wrongPassword of commonPasswords) {
      await unlock.passwordInput(page).fill(wrongPassword);
      await unlock.unlockButton(page).click();

      const stillLocked = page.url().includes('unlock');
      expect(stillLocked).toBe(true);

      await unlock.passwordInput(page).clear();
    }

    // Even the correct password is rejected while the window is full
    await unlock.passwordInput(page).fill(TEST_PASSWORD);
    await unlock.unlockButton(page).click();

    await expect(page).toHaveURL(/unlock/);
    await expect(unlock.errorMessage(page)).toContainText(/Too many password attempts/i);
  });

  walletTest('handles rapid-fire unlock attempts', async ({ page }) => {
    await lockWallet(page);

    // Three attempts stays under the 5-per-minute rate limit so the final
    // unlock with the correct password is not throttled
    const rapidAttempts = 3;
    const promises = [];

    for (let i = 0; i < rapidAttempts; i++) {
      promises.push(
        unlock.passwordInput(page).fill(`wrongpwd${i}`)
          .then(() => unlock.unlockButton(page).click())
          .catch(() => {})
      );
    }

    await Promise.allSettled(promises);

    await expect(page).toHaveURL(/unlock/);

    await unlock.passwordInput(page).clear();
    await unlockWallet(page, TEST_PASSWORD);
    await expect(page).toHaveURL(/index/);
  });

  walletTest('rate-limit window persists across reload', async ({ page }) => {
    await lockWallet(page);

    for (let i = 0; i < 3; i++) {
      await unlock.passwordInput(page).fill(`wrongpwd${i}`);
      await unlock.unlockButton(page).click();
      await unlock.passwordInput(page).clear();
    }

    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/unlock/);
    await expect(unlock.passwordInput(page)).toBeVisible();

    // Two more failures reach the limit only if the window survived the
    // reload (the counter lives in session storage, not worker memory)
    for (let i = 3; i < 5; i++) {
      await unlock.passwordInput(page).fill(`wrongpwd${i}`);
      await unlock.unlockButton(page).click();
      await unlock.passwordInput(page).clear();
    }

    await unlock.passwordInput(page).fill(TEST_PASSWORD);
    await unlock.unlockButton(page).click();

    await expect(page).toHaveURL(/unlock/);
    await expect(unlock.errorMessage(page)).toContainText(/Too many password attempts/i);
  });

  walletTest('protects against SQL injection and special characters', async ({ page }) => {
    await lockWallet(page);

    // Reduced set for CI performance - representative samples
    const injectionAttempts = [
      "' OR '1'='1",
      "<script>alert('xss')</script>",
      "../../../etc/passwd",
    ];

    for (const injection of injectionAttempts) {
      await unlock.passwordInput(page).fill(injection);
      await unlock.unlockButton(page).click();

      await expect(page).toHaveURL(/unlock/);

      await unlock.passwordInput(page).clear();
    }

    await unlockWallet(page, TEST_PASSWORD);
    await expect(page).toHaveURL(/index/);
  });

  walletTest('handles extremely long password attempts gracefully', async ({ page }) => {
    await lockWallet(page);

    // Reduced set for CI performance
    const longPasswords = [
      'a'.repeat(100),
      'x'.repeat(500),
    ];

    for (const longPass of longPasswords) {
      await unlock.passwordInput(page).fill(longPass);
      await unlock.unlockButton(page).click();

      await expect(page).toHaveURL(/unlock/);

      await unlock.passwordInput(page).clear();
    }

    await unlockWallet(page, TEST_PASSWORD);
    await expect(page).toHaveURL(/index/);
  });
});
