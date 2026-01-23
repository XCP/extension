/**
 * Show Private Key Page Tests (/secrets/show-private-key/:walletId)
 *
 * Tests for viewing the wallet's private key.
 * Requires password verification before revealing sensitive data.
 */

import { walletTest, expect, TEST_PASSWORD } from '../../fixtures';

walletTest.describe('Show Private Key Page (/secrets/show-private-key)', () => {
  async function getWalletId(page: any): Promise<string | null> {
    return await page.evaluate(() => {
      const state = localStorage.getItem('wallet-state');
      if (state) {
        const parsed = JSON.parse(state);
        return parsed.activeWalletId || Object.keys(parsed.wallets || {})[0];
      }
      return null;
    });
  }

  walletTest('page loads with wallet ID', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/secrets/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Should show password input
    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows security warning', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/secrets/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Should warn user about security
    const warning = page.locator('text=/warning|never share|do not share|keep secret|private key/i').first();
    await expect(warning).toBeVisible({ timeout: 5000 });
  });

  walletTest('requires password verification', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/secrets/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Should have password input
    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 5000 });
  });

  walletTest('has reveal button', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/secrets/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Should have a button to reveal the key
    const revealButton = page.locator('button:has-text("Show"), button:has-text("Reveal"), button:has-text("View")').first();
    await expect(revealButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('reveals private key with correct password', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/secrets/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 5000 });

    await passwordInput.fill(TEST_PASSWORD);

    const revealButton = page.locator('button:has-text("Show"), button:has-text("Reveal"), button:has-text("View")').first();
    await revealButton.click();

    // Should show key display after reveal
    const keyDisplay = page.locator('[data-testid*="private-key"], .private-key, code, .font-mono').first();
    await expect(keyDisplay).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows error for wrong password', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/secrets/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 5000 });

    await passwordInput.fill('wrongpassword');

    const revealButton = page.locator('button:has-text("Show"), button:has-text("Reveal"), button:has-text("View")').first();
    await revealButton.click();

    // Should show error
    const errorMessage = page.locator('text=/incorrect|invalid|wrong|error/i').first();
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  walletTest('has copy functionality after reveal', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/secrets/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 5000 });

    await passwordInput.fill(TEST_PASSWORD);

    const revealButton = page.locator('button:has-text("Show"), button:has-text("Reveal"), button:has-text("View")').first();
    await revealButton.click();
    await page.waitForTimeout(1000);

    // After revealing, there should be a copy button
    const copyButton = page.locator('button:has-text("Copy"), button[aria-label*="copy" i]').first();
    await expect(copyButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows private key display after reveal', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/secrets/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 5000 });

    await passwordInput.fill(TEST_PASSWORD);

    const revealButton = page.locator('button:has-text("Show"), button:has-text("Reveal"), button:has-text("View")').first();
    await revealButton.click();
    await page.waitForTimeout(1000);

    // After revealing, should show the private key in a code/display element
    const keyDisplay = page.locator('code, pre, [data-testid*="private-key"], .font-mono').first();
    await expect(keyDisplay).toBeVisible({ timeout: 5000 });
  });

  walletTest('can navigate back', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/secrets/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Should have back button
    const backButton = page.locator('button[aria-label*="back" i], button:has-text("Back"), button:has-text("Cancel")').first();
    await expect(backButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('handles invalid wallet ID', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/secrets/show-private-key/invalid-wallet-id-12345'));
    await page.waitForLoadState('networkidle');

    // Should redirect away from invalid page
    const redirected = !page.url().includes('/secrets/show-private-key/invalid');
    expect(redirected).toBe(true);
  });

  walletTest('page shows Private Key title', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/secrets/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Page should show "Private Key" in the title/header
    const privateKeyTitle = page.locator('text="Private Key"');
    await expect(privateKeyTitle).toBeVisible({ timeout: 5000 });
  });
});
