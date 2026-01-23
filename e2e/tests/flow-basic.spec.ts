/**
 * Basic Extension Tests
 *
 * Tests for basic extension loading and functionality.
 */

import { test, expect } from '../fixtures';
import { onboarding, unlock, index } from '../selectors';

test('extension loads', async ({ extensionPage }) => {
  await extensionPage.waitForLoadState('networkidle', { timeout: 30000 });

  await extensionPage.screenshot({ path: 'test-results/screenshots/extension-loaded.png' });

  const title = await extensionPage.title();
  expect(title).toBeTruthy();

  // Extension should show one of these states: onboarding, unlock, or wallet index
  // Use web-first assertions with .or() for legitimate alternative states
  const createWalletButton = onboarding.createWalletButton(extensionPage);
  const importWalletButton = onboarding.importWalletButton(extensionPage);
  const unlockButton = unlock.unlockButton(extensionPage);
  const addressText = index.addressText(extensionPage);

  // At least one of these should be visible - they represent valid app states
  await expect(
    createWalletButton
      .or(importWalletButton)
      .or(unlockButton)
      .or(addressText)
  ).toBeVisible({ timeout: 10000 });

  const bodyText = await extensionPage.evaluate(() => document.body.innerText);
  expect(bodyText).toBeTruthy();
  expect(bodyText.length).toBeGreaterThan(10);
});
