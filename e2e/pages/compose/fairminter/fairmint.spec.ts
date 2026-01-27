/**
 * Compose Fairmint Page Tests (/compose/fairmint)
 *
 * Tests for participating in a fairminter (minting from a fair launch).
 * Component: src/pages/compose/fairminter/fairmint/index.tsx
 *
 * Note: This page requires selecting a fairminter from a dropdown.
 * Fee Rate and Continue button only appear after a fairminter is selected.
 * Tests check the initial page structure before fairminter selection.
 */

import { walletTest, expect } from '@e2e/fixtures';

walletTest.describe('Compose Fairmint Page (/compose/fairmint)', () => {
  walletTest.beforeEach(async ({ page }) => {
    // Navigate directly to fairmint page
    // Route is /compose/fairmint/:asset? (not /compose/fairminter/fairmint)
    await page.goto(page.url().replace(/\/index.*/, '/compose/fairmint'));
    await page.waitForLoadState('networkidle');
  });

  walletTest('page loads with Fairmint title', async ({ page }) => {
    // The header should show "Fairmint"
    const titleText = page.locator('text="Fairmint"');
    await expect(titleText).toBeVisible({ timeout: 10000 });
  });

  walletTest('shows Fairminter Asset selector', async ({ page }) => {
    // The fairminter selection label should be visible
    const fairminterLabel = page.locator('label:has-text("Fairminter Asset")');
    await expect(fairminterLabel).toBeVisible({ timeout: 10000 });
  });

  walletTest('has back button', async ({ page }) => {
    // Back button should exist for navigation
    const backButton = page.locator('button[aria-label*="back" i], button:has-text("Back")').first();
    await expect(backButton).toBeVisible({ timeout: 10000 });
  });
});
