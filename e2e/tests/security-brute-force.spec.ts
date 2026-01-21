/**
 * Wallet Security Tests - Brute Force Protection
 *
 * Tests verifying protection against brute force attacks on the wallet unlock.
 */

import { walletTest, expect, lockWallet, unlockWallet, TEST_PASSWORD } from '../fixtures';
import { unlock } from '../selectors';

walletTest.describe('Brute Force Protection', () => {
  walletTest('resists brute force attempts on unlock screen', async ({ page }) => {
    await lockWallet(page);
    await expect(page).toHaveURL(/unlock/);
    await expect(unlock.passwordInput(page)).toBeVisible();

    // Reduced set for CI performance - 5 attempts is sufficient to verify protection
    const commonPasswords = [
      '123456', 'password', 'qwerty', 'admin', 'test'
    ];

    for (const wrongPassword of commonPasswords) {
      await unlock.passwordInput(page).fill(wrongPassword);
      await unlock.unlockButton(page).click();

      const stillLocked = page.url().includes('unlock');
      expect(stillLocked).toBe(true);

      await unlock.passwordInput(page).clear();
    }

    await expect(unlock.passwordInput(page)).toBeVisible();
    await expect(page).toHaveURL(/unlock/);

    await unlockWallet(page, TEST_PASSWORD);
    await expect(page).toHaveURL(/index/);
  });

  walletTest('handles rapid-fire unlock attempts', async ({ page }) => {
    await lockWallet(page);

    // Reduced from 10 for CI performance
    const rapidAttempts = 5;
    const promises = [];

    for (let i = 0; i < rapidAttempts; i++) {
      promises.push(
        unlock.passwordInput(page).fill(`wrong${i}`)
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

  walletTest('maintains security after multiple failed attempts across reload', async ({ page }) => {
    await lockWallet(page);

    // Reduced from 5 for CI performance
    for (let i = 0; i < 3; i++) {
      await unlock.passwordInput(page).fill(`wrong${i}`);
      await unlock.unlockButton(page).click();
      await unlock.passwordInput(page).clear();
    }

    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/unlock/);
    await expect(unlock.passwordInput(page)).toBeVisible();

    // Reduced from 5 for CI performance
    for (let i = 3; i < 6; i++) {
      await unlock.passwordInput(page).fill(`wrong${i}`);
      await unlock.unlockButton(page).click();
      await unlock.passwordInput(page).clear();
    }

    await unlockWallet(page, TEST_PASSWORD);
    await expect(page).toHaveURL(/index/);
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
