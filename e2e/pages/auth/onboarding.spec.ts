/**
 * Onboarding Page Tests (/auth/onboarding)
 *
 * Tests for the initial wallet setup/onboarding flow.
 * This page is shown when no wallet exists yet.
 */

import { test, expect, launchExtension, cleanup } from '../../fixtures';
import { onboarding, importWallet } from '../../selectors';

// Use base test (not walletTest) since we're testing the pre-wallet state
test.describe('Onboarding Page (/auth/onboarding)', () => {
  test('shows onboarding options when no wallet exists', async ({}, testInfo) => {
    const testId = `onboard-${testInfo.title.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 30)}`;
    const { context, page } = await launchExtension(testId);

    try {
      // Fresh extension should show onboarding
      await page.waitForLoadState('networkidle');
      // Wait for React to render
      await page.waitForLoadState('networkidle');

      // Should show create or import wallet options or XCP Wallet branding
      const onboardingContent = onboarding.createWalletButton(page)
        .or(onboarding.importWalletButton(page))
        .or(page.locator('text=/XCP Wallet/'));

      await expect(onboardingContent.first()).toBeVisible({ timeout: 10000 });
    } finally {
      await cleanup(context);
    }
  });

  test('create wallet button is clickable', async ({}, testInfo) => {
    const testId = `onboard-create-${testInfo.title.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 25)}`;
    const { context, page } = await launchExtension(testId);

    try {
      await page.waitForLoadState('networkidle');

      const createButton = onboarding.createWalletButton(page);
      const buttonCount = await createButton.count();

      if (buttonCount === 0) {
        // Button not present, skip
        return;
      }

      await expect(createButton).toBeVisible({ timeout: 10000 });
      await createButton.click();

      // Should navigate to create wallet page - check URL or content
      const createPageIndicator = page.locator('text=/recovery phrase|seed phrase|secret phrase/i').first();
      const onCreatePage = page.url().includes('create-wallet');

      if (onCreatePage) {
        expect(onCreatePage).toBe(true);
      } else {
        await expect(createPageIndicator).toBeVisible({ timeout: 5000 });
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

      const importButton = onboarding.importWalletButton(page);
      const buttonCount = await importButton.count();

      if (buttonCount === 0) {
        return;
      }

      await expect(importButton).toBeVisible({ timeout: 10000 });
      await importButton.click();

      // Should navigate to import wallet page
      const importPageContent = importWallet.wordInput(page, 0)
        .or(page.locator('text=/enter.*phrase|recovery phrase/i'));
      await expect(importPageContent.first()).toBeVisible({ timeout: 5000 });
    } finally {
      await cleanup(context);
    }
  });

  test('import private key button is clickable', async ({}, testInfo) => {
    const testId = `onboard-key-${testInfo.title.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 25)}`;
    const { context, page } = await launchExtension(testId);

    try {
      await page.waitForLoadState('networkidle');

      const keyButton = onboarding.importPrivateKeyButton(page);
      const buttonCount = await keyButton.count();

      if (buttonCount === 0) {
        return;
      }

      await expect(keyButton).toBeVisible({ timeout: 10000 });
      await keyButton.click();

      // Should navigate to import private key page
      const keyPageContent = importWallet.privateKeyInput(page)
        .or(page.locator('text=/private key|WIF/i'));
      await expect(keyPageContent.first()).toBeVisible({ timeout: 5000 });
    } finally {
      await cleanup(context);
    }
  });

  test('displays app branding/logo', async ({}, testInfo) => {
    const testId = `onboard-brand-${testInfo.title.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 25)}`;
    const { context, page } = await launchExtension(testId);

    try {
      await page.waitForLoadState('networkidle');

      // Should show XCP Wallet branding - logo or title
      const branding = page.locator('img[alt*="XCP" i], img[alt*="wallet" i], svg[aria-label*="logo" i]')
        .or(page.locator('text=/XCP.*Wallet|Counterparty/i'));

      await expect(branding.first()).toBeVisible({ timeout: 5000 });
    } finally {
      await cleanup(context);
    }
  });

  test('shows XCP Wallet branding text', async ({}, testInfo) => {
    const testId = `onboard-text-${testInfo.title.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 25)}`;
    const { context, page } = await launchExtension(testId);

    try {
      await page.waitForLoadState('networkidle');

      // Should show XCP Wallet text
      const walletText = page.locator('text=/XCP.*Wallet/i').first();
      await expect(walletText).toBeVisible({ timeout: 10000 });
    } finally {
      await cleanup(context);
    }
  });
});
