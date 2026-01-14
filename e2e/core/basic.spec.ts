/**
 * Basic Extension Tests
 *
 * Tests for basic extension loading and functionality.
 */

import { test, expect } from '../fixtures';

test('extension loads', async ({ extensionPage }) => {
  await extensionPage.waitForLoadState('networkidle', { timeout: 30000 });

  await extensionPage.screenshot({ path: 'test-results/screenshots/extension-loaded.png' });

  const title = await extensionPage.title();
  expect(title).toBeTruthy();

  const hasContent = await extensionPage.locator('text=/Create Wallet|Import Wallet|Unlock|Address/i').first().isVisible({ timeout: 10000 }).catch(() => false);
  expect(hasContent).toBe(true);

  const bodyText = await extensionPage.evaluate(() => document.body.innerText);
  expect(bodyText).toBeTruthy();
  expect(bodyText.length).toBeGreaterThan(10);
});
