/**
 * Basic Extension Tests
 *
 * Tests for basic extension loading and functionality.
 */

import { test, expect } from '../fixtures';
import { onboarding, unlock } from '../selectors';

test('extension loads', async ({ extensionPage }) => {
  await extensionPage.waitForLoadState('networkidle', { timeout: 30000 });

  await extensionPage.screenshot({ path: 'test-results/screenshots/extension-loaded.png' });

  const title = await extensionPage.title();
  expect(title).toBeTruthy();

  // Check for onboarding or unlock content using selectors
  const hasCreateWallet = await onboarding.createWalletButton(extensionPage).isVisible({ timeout: 5000 }).catch(() => false);
  const hasImportWallet = await onboarding.importWalletButton(extensionPage).isVisible({ timeout: 2000 }).catch(() => false);
  const hasUnlock = await unlock.unlockButton(extensionPage).isVisible({ timeout: 2000 }).catch(() => false);
  const hasAddress = await extensionPage.locator('.font-mono').first().isVisible({ timeout: 2000 }).catch(() => false);

  expect(hasCreateWallet || hasImportWallet || hasUnlock || hasAddress).toBe(true);

  const bodyText = await extensionPage.evaluate(() => document.body.innerText);
  expect(bodyText).toBeTruthy();
  expect(bodyText.length).toBeGreaterThan(10);
});
