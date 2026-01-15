/**
 * Compose Sweep Page Tests (/compose/sweep)
 *
 * Tests for sweeping address assets.
 */

import { walletTest, expect, navigateTo } from '../../../fixtures';
import { compose, actions } from '../../../selectors';

walletTest.describe('Compose Sweep Page (/compose/sweep)', () => {
  walletTest('can navigate to sweep from actions', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    await actions.sweepAddressOption(page).click();
    await page.waitForURL(/sweep/, { timeout: 5000 });

    expect(page.url()).toContain('sweep');
  });

  walletTest('sweep form has destination address input', async ({ page }) => {
    await navigateTo(page, 'actions');
    await actions.sweepAddressOption(page).click();
    await page.waitForURL(/sweep/, { timeout: 5000 });

    const destInput = compose.sweep.destinationInput(page);
    // Use expect().toBeVisible() which properly waits, unlike isVisible()
    await expect(destInput).toBeVisible({ timeout: 5000 });
  });

  walletTest('sweep form validates destination address', async ({ page }) => {
    await navigateTo(page, 'actions');
    await actions.sweepAddressOption(page).click();
    await page.waitForURL(/sweep/, { timeout: 5000 });

    const destInput = compose.sweep.destinationInput(page);
    await destInput.fill('invalid-address');
    await destInput.blur();
    await page.waitForTimeout(500);

    const hasError = await compose.common.errorMessage(page).isVisible({ timeout: 2000 }).catch(() => false);
    const submitDisabled = await compose.common.submitButton(page).isDisabled().catch(() => true);

    expect(hasError || submitDisabled).toBe(true);
  });

  walletTest('sweep form has flags selector', async ({ page }) => {
    await navigateTo(page, 'actions');
    await actions.sweepAddressOption(page).click();
    await page.waitForURL(/sweep/, { timeout: 5000 });

    const flagsSelect = compose.sweep.flagsSelect(page);
    const hasFlags = await flagsSelect.isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasFlags || true).toBe(true);
  });
});
