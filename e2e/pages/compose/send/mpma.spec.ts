/**
 * Compose Send MPMA Page Tests (/compose/send/mpma)
 *
 * Tests for Multi-Party Multi-Asset (MPMA) send functionality.
 * Component: src/pages/compose/send/mpma/index.tsx
 *
 * The MPMA page shows:
 * - Title "MPMA Send"
 * - CSV upload section with "Upload CSV File" label
 * - "Upload CSV" button
 * - Text area for pasting CSV data
 */

import { walletTest, expect } from '../../../fixtures';

walletTest.describe('Compose Send MPMA Page (/compose/send/mpma)', () => {
  walletTest.beforeEach(async ({ page }) => {
    // Navigate directly to MPMA page
    await page.goto(page.url().replace(/\/index.*/, '/compose/send/mpma'));
    await page.waitForLoadState('networkidle');
  });

  walletTest('page loads with MPMA Send title', async ({ page }) => {
    // The header should show "MPMA Send"
    const titleText = page.locator('text="MPMA Send"');
    await expect(titleText).toBeVisible({ timeout: 10000 });
  });

  walletTest('shows Upload CSV File label', async ({ page }) => {
    // Should show the CSV upload label
    const uploadLabel = page.locator('label:has-text("Upload CSV File")');
    await expect(uploadLabel).toBeVisible({ timeout: 10000 });
  });

  walletTest('shows Upload CSV button', async ({ page }) => {
    // Should show the upload button
    const uploadButton = page.locator('button:has-text("Upload CSV")');
    await expect(uploadButton).toBeVisible({ timeout: 10000 });
  });

  walletTest('shows text area for pasting CSV data', async ({ page }) => {
    // Should show textarea with placeholder
    const textarea = page.locator('textarea[placeholder*="Paste CSV"]');
    await expect(textarea).toBeVisible({ timeout: 10000 });
  });

  walletTest('shows format help text', async ({ page }) => {
    // Should show the format description
    const formatText = page.locator('text=/Address.*Asset.*Quantity/');
    await expect(formatText).toBeVisible({ timeout: 10000 });
  });

  walletTest('Continue button is disabled without data', async ({ page }) => {
    // Submit button should be disabled when no CSV data is loaded
    const submitButton = page.locator('button[type="submit"]:has-text("Continue")');
    await expect(submitButton).toBeDisabled({ timeout: 10000 });
  });
});
