/**
 * Wallet Security Tests - Brute Force Protection
 *
 * Tests verifying protection against brute force attacks on the wallet unlock.
 */

import { walletTest, expect, lockWallet, unlockWallet, TEST_PASSWORD } from '../../fixtures';

walletTest.describe('Brute Force Protection', () => {
  walletTest('resists brute force attempts on unlock screen', async ({ page }) => {
    await lockWallet(page);
    await expect(page).toHaveURL(/unlock/);
    await expect(page.locator('input[type="password"]')).toBeVisible();

    const commonPasswords = [
      '123456', 'password', '12345678', 'qwerty', '123456789',
      'letmein', '1234567', 'football', 'iloveyou', 'admin',
      'welcome', 'monkey', '123123', 'password1', 'qwertyuiop',
      'abc123', '111111', 'password123', 'test', 'demo'
    ];

    for (const wrongPassword of commonPasswords) {
      await page.fill('input[type="password"]', wrongPassword);
      await page.click('button:has-text("Unlock")');

      const stillLocked = page.url().includes('unlock');
      expect(stillLocked).toBe(true);

      await page.locator('input[type="password"]').clear();
    }

    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page).toHaveURL(/unlock/);

    await unlockWallet(page, TEST_PASSWORD);
    await expect(page).toHaveURL(/index/);
  });

  walletTest('handles rapid-fire unlock attempts', async ({ page }) => {
    await lockWallet(page);

    const rapidAttempts = 10;
    const promises = [];

    for (let i = 0; i < rapidAttempts; i++) {
      promises.push(
        page.fill('input[type="password"]', `wrong${i}`)
          .then(() => page.click('button:has-text("Unlock")'))
          .catch(() => {})
      );
    }

    await Promise.allSettled(promises);

    await expect(page).toHaveURL(/unlock/);

    await page.locator('input[type="password"]').clear();
    await unlockWallet(page, TEST_PASSWORD);
    await expect(page).toHaveURL(/index/);
  });

  walletTest('maintains security after multiple failed attempts across reload', async ({ page }) => {
    await lockWallet(page);

    for (let i = 0; i < 5; i++) {
      await page.fill('input[type="password"]', `wrong${i}`);
      await page.click('button:has-text("Unlock")');
      await page.locator('input[type="password"]').clear();
    }

    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/unlock/);
    await expect(page.locator('input[type="password"]')).toBeVisible();

    for (let i = 5; i < 10; i++) {
      await page.fill('input[type="password"]', `wrong${i}`);
      await page.click('button:has-text("Unlock")');
      await page.locator('input[type="password"]').clear();
    }

    await unlockWallet(page, TEST_PASSWORD);
    await expect(page).toHaveURL(/index/);
  });

  walletTest('protects against SQL injection and special characters', async ({ page }) => {
    await lockWallet(page);

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

      await expect(page).toHaveURL(/unlock/);

      await page.locator('input[type="password"]').clear();
    }

    await unlockWallet(page, TEST_PASSWORD);
    await expect(page).toHaveURL(/index/);
  });

  walletTest('handles extremely long password attempts gracefully', async ({ page }) => {
    await lockWallet(page);

    const longPasswords = [
      'a'.repeat(100),
      'x'.repeat(1000),
      'test'.repeat(250),
    ];

    for (const longPass of longPasswords) {
      await page.fill('input[type="password"]', longPass);
      await page.click('button:has-text("Unlock")');

      await expect(page).toHaveURL(/unlock/);

      await page.locator('input[type="password"]').clear();
    }

    await unlockWallet(page, TEST_PASSWORD);
    await expect(page).toHaveURL(/index/);
  });
});
