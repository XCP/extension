/**
 * Show Private Key Page Tests (/wallet/show-private-key/:walletId)
 *
 * Tests for viewing the wallet's private key.
 * Requires password verification before revealing sensitive data.
 */

import { walletTest, expect, TEST_PASSWORD } from '../../fixtures';
import { secrets, common, unlock, errors } from '../../selectors';

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

    await page.goto(page.url().replace(/\/index.*/, `/wallet/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Should show password input
    await expect(unlock.passwordInput(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows security warning', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Should warn user about security
    await expect(secrets.warningMessage(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('requires password verification', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Should have password input
    await expect(unlock.passwordInput(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('has reveal button', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Should have a button to reveal the key
    await expect(secrets.revealButton(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('reveals private key with correct password', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    await expect(unlock.passwordInput(page)).toBeVisible({ timeout: 5000 });

    await unlock.passwordInput(page).fill(TEST_PASSWORD);

    await secrets.revealButton(page).click();

    // Should show key display after reveal
    await expect(secrets.privateKeyDisplay(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows error for wrong password', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    await expect(unlock.passwordInput(page)).toBeVisible({ timeout: 5000 });

    await unlock.passwordInput(page).fill('wrongpassword');

    await secrets.revealButton(page).click();

    // Should show error
    await expect(errors.genericError(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('has copy functionality after reveal', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    await expect(unlock.passwordInput(page)).toBeVisible({ timeout: 5000 });

    await unlock.passwordInput(page).fill(TEST_PASSWORD);

    await secrets.revealButton(page).click();

    // After revealing, there should be a copy button - wait for it to appear
    await expect(secrets.copyButton(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows private key display after reveal', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    await expect(unlock.passwordInput(page)).toBeVisible({ timeout: 5000 });

    await unlock.passwordInput(page).fill(TEST_PASSWORD);

    await secrets.revealButton(page).click();

    // After revealing, should show the private key in a code/display element
    await expect(secrets.privateKeyDisplay(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('can navigate back', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Should have back button
    await expect(common.headerBackButton(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('handles invalid wallet ID', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/wallet/show-private-key/invalid-wallet-id-12345'));
    await page.waitForLoadState('networkidle');

    // Page checks wallet existence on load and shows "Wallet not found." error
    // (from source: line 37)
    await expect(common.errorAlert(page)).toBeVisible({ timeout: 5000 });
    await expect(common.errorAlert(page)).toContainText(/Wallet not found/i);
  });

  walletTest('page shows Private Key title', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Page should show "Private Key" in the title/header
    await expect(secrets.showPrivateKeyTitle(page)).toBeVisible({ timeout: 5000 });
  });

  // ============================================================================
  // Warning Message Tests
  // ============================================================================

  walletTest('warning message has red styling', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Warning box should have red border
    const warningBox = page.locator('.border-red-500, .bg-red-50').first();
    await expect(warningBox).toBeVisible({ timeout: 5000 });
  });

  walletTest('warning shows "Never share" text', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Should show warning text about not sharing
    const warningText = page.locator('text=/Never share your private key/i');
    await expect(warningText.first()).toBeVisible({ timeout: 5000 });
  });

  walletTest('warning shows exclamation triangle icon', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Should show warning icon
    const warningIcon = page.locator('.text-red-500 svg, svg.text-red-500').first();
    await expect(warningIcon).toBeVisible({ timeout: 5000 });
  });

  // ============================================================================
  // Password Validation Tests
  // ============================================================================

  walletTest('shows error for empty password', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Click reveal without entering password
    await secrets.revealButton(page).click();

    // Should show error about required password
    const errorMessage = page.locator('text=/Password is required/i');
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows error for short password', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Enter short password
    await unlock.passwordInput(page).fill('short');
    await secrets.revealButton(page).click();

    // Should show error about minimum length
    const errorMessage = page.locator('text=/at least 8 characters/i');
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows "Incorrect password" for wrong password', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Enter wrong password
    await unlock.passwordInput(page).fill('wrongpassword123');
    await secrets.revealButton(page).click();

    // Should show incorrect password error
    const errorMessage = page.locator('text=/Incorrect password/i');
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  // ============================================================================
  // After Reveal Tests
  // ============================================================================

  walletTest('reveals WIF format title after reveal', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    await unlock.passwordInput(page).fill(TEST_PASSWORD);
    await secrets.revealButton(page).click();

    // Should show WIF title after reveal
    const wifTitle = page.locator('text=/Your Private Key.*WIF/i');
    await expect(wifTitle).toBeVisible({ timeout: 5000 });
  });

  walletTest('private key display is clickable to copy', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    await unlock.passwordInput(page).fill(TEST_PASSWORD);
    await secrets.revealButton(page).click();

    // Private key display should have role="button" for copy
    const keyDisplay = page.locator('[role="button"][aria-label*="Copy"]');
    await expect(keyDisplay).toBeVisible({ timeout: 5000 });
  });

  walletTest('private key starts with valid WIF prefix', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    await unlock.passwordInput(page).fill(TEST_PASSWORD);
    await secrets.revealButton(page).click();

    // Wait for private key display
    await expect(secrets.privateKeyDisplay(page)).toBeVisible({ timeout: 5000 });

    // Get the private key text
    const keyText = await secrets.privateKeyDisplay(page).textContent();

    // WIF keys start with 5, K, or L (mainnet) or c (testnet)
    expect(keyText).toMatch(/^[5KLc]/);
  });

  walletTest('copy button shows "Copied!" feedback after click', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    await unlock.passwordInput(page).fill(TEST_PASSWORD);
    await secrets.revealButton(page).click();

    await expect(secrets.copyButton(page)).toBeVisible({ timeout: 5000 });

    // Click copy button
    await secrets.copyButton(page).click();

    // Should show "Copied!" text
    const copiedText = page.locator('text="Copied!"');
    await expect(copiedText).toBeVisible({ timeout: 3000 });
  });

  walletTest('shows security notice after reveal', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    await unlock.passwordInput(page).fill(TEST_PASSWORD);
    await secrets.revealButton(page).click();

    // Should show security notice after reveal
    const securityNotice = page.locator('text=/Security Notice/i');
    await expect(securityNotice).toBeVisible({ timeout: 5000 });
  });

  walletTest('security notice warns about theft', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    await unlock.passwordInput(page).fill(TEST_PASSWORD);
    await secrets.revealButton(page).click();

    // Security notice should mention stealing
    const theftWarning = page.locator('text=/steal your bitcoin/i');
    await expect(theftWarning).toBeVisible({ timeout: 5000 });
  });

  // ============================================================================
  // Navigation Tests
  // ============================================================================

  walletTest('back button navigates back', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    // Start from select-wallet page to have navigation history
    await page.goto(page.url().replace(/\/index.*/, '/wallet/select'));
    await page.waitForLoadState('networkidle');

    // Navigate to show-private-key
    await page.goto(page.url().replace(/\/wallet/select.*/, `/wallet/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Click back button
    await common.headerBackButton(page).click();

    // Should navigate back (URL should change)
    await expect(page).not.toHaveURL(/wallet/show-private-key/, { timeout: 5000 });
  });

  // ============================================================================
  // Button State Tests
  // ============================================================================

  walletTest('reveal button has red color', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Reveal button should have red styling
    const revealButton = secrets.revealButton(page);
    await expect(revealButton).toBeVisible({ timeout: 5000 });

    const hasRedClass = await revealButton.evaluate((el) => {
      return el.className.includes('red') || el.className.includes('bg-red');
    });
    expect(hasRedClass).toBe(true);
  });

  walletTest('password input has placeholder text', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    const passwordInput = unlock.passwordInput(page);
    await expect(passwordInput).toBeVisible({ timeout: 5000 });

    const placeholder = await passwordInput.getAttribute('placeholder');
    expect(placeholder).toMatch(/Enter your password/i);
  });
});
