/**
 * Compose Sweep Page Tests (/compose/sweep)
 *
 * Tests for sweeping address assets.
 * Component: src/pages/compose/sweep/index.tsx
 *
 * The page shows:
 * - Title "Sweep"
 * - Destination address input
 * - Flags selector
 * - Fee Rate selector
 */

import { walletTest, expect, navigateTo } from '../../../fixtures';
import { compose, actions } from '../../../selectors';
import { enableValidationBypass } from '../../../compose-test-helpers';

walletTest.describe('Compose Sweep Page (/compose/sweep)', () => {
  walletTest.beforeEach(async ({ page }) => {
    await enableValidationBypass(page);
    await navigateTo(page, 'actions');
    await actions.sweepAddressOption(page).click();
    await page.waitForURL(/sweep/, { timeout: 5000 });
  });

  walletTest('page loads with Sweep title', async ({ page }) => {
    // The header should show "Sweep"
    const titleText = page.getByRole('heading', { name: 'Sweep' });
    await expect(titleText).toBeVisible({ timeout: 10000 });
  });

  walletTest('has destination address input', async ({ page }) => {
    const destInput = compose.sweep.destinationInput(page);
    await expect(destInput).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows Fee Rate selector', async ({ page }) => {
    // Fee Rate label should be visible
    const feeRateLabel = page.locator('label:has-text("Fee Rate")');
    await expect(feeRateLabel).toBeVisible({ timeout: 10000 });
  });

  walletTest('has Sweep button', async ({ page }) => {
    // Submit button exists - Sweep page uses "Sweep" not "Continue"
    const submitButton = page.locator('button[type="submit"]:has-text("Sweep")');
    await expect(submitButton).toBeVisible({ timeout: 10000 });
  });

  walletTest('validates invalid destination address', async ({ page }) => {
    const destInput = compose.sweep.destinationInput(page);
    await destInput.fill('invalid-address');
    await destInput.blur();

    // Invalid address should disable submit button
    const submitButton = compose.common.submitButton(page);
    await expect(submitButton).toBeDisabled({ timeout: 5000 });
  });
});
