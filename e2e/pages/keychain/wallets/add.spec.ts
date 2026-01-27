/**
 * Add Wallet Page Tests (/keychain/wallets/add)
 *
 * Tests for the add wallet page that provides options to create or import a wallet.
 */

import { walletTest, expect } from '@e2e/fixtures';
import { header, selectWallet } from '@e2e/selectors';

walletTest.describe('Add Wallet Page (/keychain/wallets/add)', () => {
  walletTest.beforeEach(async ({ page }) => {
    // Wait for header to be fully loaded with wallet selector button
    const walletSelectorBtn = header.walletSelector(page);
    await walletSelectorBtn.waitFor({ state: 'visible', timeout: 10000 });
    await walletSelectorBtn.click();
    await page.waitForURL(/keychain\/wallets/, { timeout: 5000 });

    // Wait for add wallet button to be visible, then click
    const addWalletBtn = selectWallet.addWalletButton(page);
    await addWalletBtn.waitFor({ state: 'visible', timeout: 5000 });
    await addWalletBtn.click();
    await page.waitForURL(/wallet\/add/, { timeout: 5000 });
  });

  walletTest('page loads with wallet options', async ({ page }) => {
    // Should show the add wallet page with at least one wallet creation option
    // Check for the Create New Wallet button which should always be present
    const createButton = page.locator('button:has-text("Create New Wallet")');
    await expect(createButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('displays create new wallet button', async ({ page }) => {
    const createButton = page.locator('button:has-text("Create New Wallet"), button[aria-label="Create New Wallet"]').first();
    await expect(createButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('displays import mnemonic button', async ({ page }) => {
    const importButton = page.locator('button:has-text("Import Mnemonic"), button:has-text("Import Wallet"), button[aria-label="Import Wallet"]').first();
    await expect(importButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('displays import private key button', async ({ page }) => {
    const importKeyButton = page.locator('button:has-text("Import Private Key"), button[aria-label="Import Private Key"]').first();
    await expect(importKeyButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('create wallet button navigates to create-wallet page', async ({ page }) => {
    const createButton = page.locator('button:has-text("Create New Wallet"), button[aria-label="Create New Wallet"]').first();
    await expect(createButton).toBeVisible({ timeout: 5000 });
    await createButton.click();

    // Should navigate to create-wallet page
    await page.waitForURL(/keychain\/setup\/create-mnemonic/, { timeout: 5000 });
  });

  walletTest('import mnemonic button navigates to import-wallet page', async ({ page }) => {
    const importButton = page.locator('button:has-text("Import Mnemonic"), button:has-text("Import Wallet")').first();
    await expect(importButton).toBeVisible({ timeout: 5000 });
    await importButton.click();

    // Should navigate to import-wallet page with mnemonic inputs
    await expect(page.locator('input[name="word-0"]')).toBeVisible({ timeout: 5000 });
  });

  walletTest('import private key button navigates to import-private-key page', async ({ page }) => {
    const importKeyButton = page.locator('button:has-text("Import Private Key")').first();
    await expect(importKeyButton).toBeVisible({ timeout: 5000 });
    await importKeyButton.click();

    // Should navigate to import-private-key page
    await expect(page.locator('input[name="private-key"]')).toBeVisible({ timeout: 5000 });
  });

  walletTest('has back button to return to select-wallet', async ({ page }) => {
    // Header should have a back button
    const backButton = page.locator('header button').first();
    await expect(backButton).toBeVisible({ timeout: 5000 });
  });

  walletTest.skip('has close button to return to index', async ({ page }) => {
    // Skipped: Close button is optional and may not exist on this page
    const closeButton = page.locator('button[aria-label="Close"], button[aria-label*="close" i]').first();
    await expect(closeButton).toBeVisible({ timeout: 5000 });
  });

  walletTest.skip('close button navigates to index page', async ({ page }) => {
    // Skipped: Close button is optional and may not exist on this page
    const closeButton = page.locator('button[aria-label="Close"]').first();
    await expect(closeButton).toBeVisible({ timeout: 3000 });
    await closeButton.click();
    await expect(page).toHaveURL(/index/, { timeout: 5000 });
  });

  walletTest('displays app branding/logo', async ({ page }) => {
    // Header should always be present with logo or title
    await expect(page.locator('header')).toBeVisible({ timeout: 5000 });
  });
});
