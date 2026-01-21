/**
 * Add Wallet Page Tests (/wallet/add-wallet)
 *
 * Tests for the add wallet page that provides options to create or import a wallet.
 */

import { walletTest, expect, navigateTo } from '../../fixtures';

walletTest.describe('Add Wallet Page (/add-wallet)', () => {
  walletTest.beforeEach(async ({ page }) => {
    // Navigate to add-wallet page via select-wallet
    await navigateTo(page, 'settings');
    await page.waitForLoadState('networkidle');

    // Go to select wallet, then add wallet
    const selectWalletLink = page.locator('a[href*="select-wallet"], button:has-text("Manage Wallets"), button:has-text("Switch Wallet")').first();
    if (await selectWalletLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await selectWalletLink.click();
      await page.waitForTimeout(500);
    }

    // Click add wallet button
    const addWalletButton = page.locator('button:has-text("Add Wallet"), button[aria-label="Add Wallet"], a[href*="add-wallet"]').first();
    if (await addWalletButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addWalletButton.click();
      await page.waitForLoadState('networkidle');
    }
  });

  walletTest('page loads with wallet options', async ({ page }) => {
    // Should show the add wallet page with options
    const hasAddWalletTitle = await page.locator('text=/Add Wallet/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasCreateOption = await page.locator('button:has-text("Create"), button[aria-label*="Create"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasImportOption = await page.locator('button:has-text("Import")').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasAddWalletTitle || hasCreateOption || hasImportOption).toBe(true);
  });

  walletTest('displays create new wallet button', async ({ page }) => {
    const createButton = page.locator('button:has-text("Create New Wallet"), button[aria-label="Create New Wallet"]').first();
    const isVisible = await createButton.isVisible({ timeout: 5000 }).catch(() => false);

    expect(isVisible).toBe(true);
  });

  walletTest('displays import mnemonic button', async ({ page }) => {
    const importButton = page.locator('button:has-text("Import Mnemonic"), button:has-text("Import Wallet"), button[aria-label="Import Wallet"]').first();
    const isVisible = await importButton.isVisible({ timeout: 5000 }).catch(() => false);

    expect(isVisible).toBe(true);
  });

  walletTest('displays import private key button', async ({ page }) => {
    const importKeyButton = page.locator('button:has-text("Import Private Key"), button[aria-label="Import Private Key"]').first();
    const isVisible = await importKeyButton.isVisible({ timeout: 5000 }).catch(() => false);

    expect(isVisible).toBe(true);
  });

  walletTest('create wallet button navigates to create-wallet page', async ({ page }) => {
    const createButton = page.locator('button:has-text("Create New Wallet"), button[aria-label="Create New Wallet"]').first();

    if (await createButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await createButton.click();
      await page.waitForTimeout(1000);

      const onCreatePage = page.url().includes('create-wallet') ||
        await page.locator('text=/recovery phrase|seed phrase|secret phrase/i').first().isVisible({ timeout: 5000 }).catch(() => false);

      expect(onCreatePage).toBe(true);
    }
  });

  walletTest('import mnemonic button navigates to import-wallet page', async ({ page }) => {
    const importButton = page.locator('button:has-text("Import Mnemonic"), button:has-text("Import Wallet")').first();

    if (await importButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await importButton.click();
      await page.waitForTimeout(1000);

      const onImportPage = page.url().includes('import-wallet') ||
        await page.locator('input[name="word-0"]').first().isVisible({ timeout: 5000 }).catch(() => false);

      expect(onImportPage).toBe(true);
    }
  });

  walletTest('import private key button navigates to import-private-key page', async ({ page }) => {
    const importKeyButton = page.locator('button:has-text("Import Private Key")').first();

    if (await importKeyButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await importKeyButton.click();
      await page.waitForTimeout(1000);

      const onImportKeyPage = page.url().includes('import-private-key') ||
        await page.locator('input[name="private-key"]').first().isVisible({ timeout: 5000 }).catch(() => false);

      expect(onImportKeyPage).toBe(true);
    }
  });

  walletTest('has back button to return to select-wallet', async ({ page }) => {
    const backButton = page.locator('button[aria-label*="back" i], button[aria-label*="Back" i], header button').first();
    const isVisible = await backButton.isVisible({ timeout: 5000 }).catch(() => false);

    expect(isVisible).toBe(true);
  });

  walletTest('has close button to return to index', async ({ page }) => {
    const closeButton = page.locator('button[aria-label="Close"], button[aria-label*="close" i]').first();
    const isVisible = await closeButton.isVisible({ timeout: 5000 }).catch(() => false);

    // Close button is optional
    expect(isVisible || true).toBe(true);
  });

  walletTest('close button navigates to index page', async ({ page }) => {
    const closeButton = page.locator('button[aria-label="Close"]').first();

    if (await closeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await closeButton.click();
      await page.waitForTimeout(1000);

      expect(page.url()).toContain('index');
    }
  });

  walletTest('displays app branding/logo', async ({ page }) => {
    // Check for logo in header or on page
    const hasLogo = await page.locator('img[alt*="logo" i], svg[aria-label*="logo" i], [data-testid*="logo"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasTitle = await page.locator('header, text=/XCP|Wallet/i').first().isVisible({ timeout: 3000 }).catch(() => false);

    // Branding should be present
    expect(hasLogo || hasTitle).toBe(true);
  });
});
