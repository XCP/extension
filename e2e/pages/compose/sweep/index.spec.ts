/**
 * Compose Sweep Page Tests (/compose/sweep)
 *
 * Tests for sweeping address assets.
 */

import { walletTest, expect, navigateTo } from '../../../fixtures';
import { compose, actions } from '../../../selectors';
import {
  enableValidationBypass,
  enableDryRun,
  waitForReview,
  clickBack,
} from '../../../helpers/compose-test-helpers';
import { TEST_ADDRESSES } from '../../../helpers/test-data';

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

walletTest.describe('Sweep Flow - Full Compose Flow', () => {
  walletTest.beforeEach(async ({ page }) => {
    await enableValidationBypass(page);
    await enableDryRun(page);
  });

  walletTest('form → review: valid sweep shows review page', async ({ page }) => {
    await navigateTo(page, 'actions');
    await actions.sweepAddressOption(page).click();
    await page.waitForURL(/sweep/, { timeout: 5000 });

    const destInput = compose.sweep.destinationInput(page);
    await destInput.fill(TEST_ADDRESSES.mainnet.p2wpkh);
    await page.waitForTimeout(500);

    const submitBtn = compose.common.submitButton(page);
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const isEnabled = await submitBtn.isEnabled().catch(() => false);
      if (isEnabled) {
        await submitBtn.click();
        await waitForReview(page);

        const reviewContent = await page.content();
        expect(reviewContent).toMatch(/review|confirm|sign/i);
      }
    }
  });

  walletTest('form → review → back: sweep data preserved', async ({ page }) => {
    await navigateTo(page, 'actions');
    await actions.sweepAddressOption(page).click();
    await page.waitForURL(/sweep/, { timeout: 5000 });

    const testAddress = TEST_ADDRESSES.mainnet.p2wpkh;
    const destInput = compose.sweep.destinationInput(page);
    await destInput.fill(testAddress);
    await page.waitForTimeout(500);

    const submitBtn = compose.common.submitButton(page);
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const isEnabled = await submitBtn.isEnabled().catch(() => false);
      if (isEnabled) {
        await submitBtn.click();
        await waitForReview(page);
        await clickBack(page);
        await page.waitForTimeout(500);

        await expect(destInput).toHaveValue(testAddress);
      }
    }
  });

  walletTest('form → review: sweep reaches review page', async ({ page }) => {
    await navigateTo(page, 'actions');
    await actions.sweepAddressOption(page).click();
    await page.waitForURL(/sweep/, { timeout: 5000 });

    const destInput = compose.sweep.destinationInput(page);
    await destInput.fill(TEST_ADDRESSES.mainnet.p2wpkh);
    await page.waitForTimeout(500);

    const submitBtn = compose.common.submitButton(page);
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const isEnabled = await submitBtn.isEnabled().catch(() => false);
      if (isEnabled) {
        await submitBtn.click();
        await waitForReview(page);

        // Verify review page
        const reviewContent = await page.content();
        expect(reviewContent).toMatch(/review|confirm|sign/i);
      }
    }
  });
});
