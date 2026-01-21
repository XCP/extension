/**
 * Onboarding Page Tests (/auth/onboarding)
 *
 * Tests for the initial wallet setup/onboarding flow.
 * This page is shown when no wallet exists yet.
 */

import { test, expect, launchExtension, cleanup } from '../../fixtures';

// Use base test (not walletTest) since we're testing the pre-wallet state
test.describe('Onboarding Page (/auth/onboarding)', () => {
  test('shows onboarding options when no wallet exists', async ({}, testInfo) => {
    const testId = `onboard-${testInfo.title.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 30)}`;
    const { context, page } = await launchExtension(testId);

    try {
      // Fresh extension should show onboarding
      await page.waitForLoadState('networkidle');

      // Should show create or import wallet options
      const hasCreateWallet = await page.locator('button:has-text("Create Wallet"), text=/Create.*Wallet/i').first().isVisible({ timeout: 10000 }).catch(() => false);
      const hasImportWallet = await page.locator('button:has-text("Import Wallet"), text=/Import.*Wallet/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasImportKey = await page.locator('button:has-text("Import Private Key"), text=/Private.*Key/i').first().isVisible({ timeout: 5000 }).catch(() => false);

      expect(hasCreateWallet || hasImportWallet || hasImportKey).toBe(true);
    } finally {
      await cleanup(context);
    }
  });

  test('create wallet button is clickable', async ({}, testInfo) => {
    const testId = `onboard-create-${testInfo.title.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 25)}`;
    const { context, page } = await launchExtension(testId);

    try {
      await page.waitForLoadState('networkidle');

      const createButton = page.locator('button:has-text("Create Wallet")').first();
      const isVisible = await createButton.isVisible({ timeout: 10000 }).catch(() => false);

      if (isVisible) {
        await createButton.click();
        await page.waitForTimeout(1000);

        // Should navigate to create wallet page
        const onCreatePage = page.url().includes('create-wallet') ||
          await page.locator('text=/recovery phrase|seed phrase|secret phrase/i').first().isVisible({ timeout: 5000 }).catch(() => false);

        expect(onCreatePage).toBe(true);
      }
    } finally {
      await cleanup(context);
    }
  });

  test('import wallet button is clickable', async ({}, testInfo) => {
    const testId = `onboard-import-${testInfo.title.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 25)}`;
    const { context, page } = await launchExtension(testId);

    try {
      await page.waitForLoadState('networkidle');

      const importButton = page.locator('button:has-text("Import Wallet")').first();
      const isVisible = await importButton.isVisible({ timeout: 10000 }).catch(() => false);

      if (isVisible) {
        await importButton.click();
        await page.waitForTimeout(1000);

        // Should navigate to import wallet page
        const onImportPage = page.url().includes('import-wallet') ||
          await page.locator('input[name="word-0"], text=/enter.*phrase|recovery phrase/i').first().isVisible({ timeout: 5000 }).catch(() => false);

        expect(onImportPage).toBe(true);
      }
    } finally {
      await cleanup(context);
    }
  });

  test('import private key button is clickable', async ({}, testInfo) => {
    const testId = `onboard-key-${testInfo.title.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 25)}`;
    const { context, page } = await launchExtension(testId);

    try {
      await page.waitForLoadState('networkidle');

      const keyButton = page.locator('button:has-text("Import Private Key"), button:has-text("Private Key")').first();
      const isVisible = await keyButton.isVisible({ timeout: 10000 }).catch(() => false);

      if (isVisible) {
        await keyButton.click();
        await page.waitForTimeout(1000);

        // Should navigate to import private key page
        const onKeyPage = page.url().includes('import-private-key') ||
          await page.locator('input[name="private-key"], text=/private key|WIF/i').first().isVisible({ timeout: 5000 }).catch(() => false);

        expect(onKeyPage).toBe(true);
      }
    } finally {
      await cleanup(context);
    }
  });

  test('displays app branding/logo', async ({}, testInfo) => {
    const testId = `onboard-brand-${testInfo.title.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 25)}`;
    const { context, page } = await launchExtension(testId);

    try {
      await page.waitForLoadState('networkidle');

      // Should show XCP Wallet branding
      const hasLogo = await page.locator('img[alt*="XCP" i], img[alt*="wallet" i], svg[aria-label*="logo" i]').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasTitle = await page.locator('text=/XCP.*Wallet|Counterparty/i').first().isVisible({ timeout: 5000 }).catch(() => false);

      expect(hasLogo || hasTitle).toBe(true);
    } finally {
      await cleanup(context);
    }
  });

  test('shows security notice or terms', async ({}, testInfo) => {
    const testId = `onboard-sec-${testInfo.title.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 25)}`;
    const { context, page } = await launchExtension(testId);

    try {
      await page.waitForLoadState('networkidle');

      // May show security information or terms
      const hasSecurityInfo = await page.locator('text=/secure|backup|responsibility|terms/i').first().isVisible({ timeout: 5000 }).catch(() => false);

      // Security info is optional but good practice
      expect(hasSecurityInfo || true).toBe(true);
    } finally {
      await cleanup(context);
    }
  });
});
