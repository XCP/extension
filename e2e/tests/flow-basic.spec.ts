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
  // Check that at least one valid app state element is visible
  await expect(async () => {
    const createCount = await onboarding.createWalletButton(extensionPage).count();
    const importCount = await onboarding.importWalletButton(extensionPage).count();
    const unlockCount = await unlock.unlockButton(extensionPage).count();
    const addressCount = await index.addressText(extensionPage).count();
    // At least one valid state should be visible
    expect(createCount + importCount + unlockCount + addressCount).toBeGreaterThan(0);
  }).toPass({ timeout: 10000 });

  const bodyText = await extensionPage.evaluate(() => document.body.innerText);
  expect(bodyText).toBeTruthy();
  expect(bodyText.length).toBeGreaterThan(10);
});
