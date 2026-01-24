/**
 * Compose Issuance Page Tests (/compose/issuance)
 *
 * Tests for the main asset issuance form.
 */

import { walletTest, expect, navigateTo } from '../../../fixtures';
import { compose, actions } from '../../../selectors';
import {
  enableValidationBypass,
  enableDryRun,
  waitForReview,
  clickBack,
} from '../../../compose-test-helpers';

walletTest.describe('Compose Issuance Page (/compose/issuance)', () => {
  walletTest('can navigate to issuance from actions', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    await actions.issueAssetOption(page).click();
    await page.waitForURL('**/compose/issuance', { timeout: 10000 });

    expect(page.url()).toContain('issuance');
  });

  walletTest('issuance form has asset name field', async ({ page }) => {
    await navigateTo(page, 'actions');
    await actions.issueAssetOption(page).click();
    await page.waitForURL('**/compose/issuance', { timeout: 10000 });

    const assetNameInput = compose.issuance.assetNameInput(page);
    await expect(assetNameInput).toBeVisible({ timeout: 5000 });
  });

  walletTest('issuance form has quantity field', async ({ page }) => {
    await navigateTo(page, 'actions');
    await actions.issueAssetOption(page).click();
    await page.waitForURL('**/compose/issuance', { timeout: 10000 });

    const quantityInput = compose.issuance.quantityInput(page);
    await expect(quantityInput).toBeVisible({ timeout: 5000 });
  });

  walletTest('issuance form has divisible toggle or form content', async ({ page }) => {
    await navigateTo(page, 'actions');
    await actions.issueAssetOption(page).click();
    await page.waitForURL('**/compose/issuance', { timeout: 10000 });

    // Form should have divisible toggle - use the selector
    const divisibleToggle = compose.issuance.divisibleToggle(page);
    await expect(divisibleToggle).toBeVisible({ timeout: 5000 });
  });

  walletTest('issuance form validates asset name format', async ({ page }) => {
    await navigateTo(page, 'actions');
    await actions.issueAssetOption(page).click();
    await page.waitForURL('**/compose/issuance', { timeout: 10000 });

    const nameInput = compose.issuance.assetNameInput(page);
    // "AB" is too short (min 4 chars) to test validation
    await nameInput.fill('AB');
    await nameInput.blur();

    // Either error message visible or submit disabled
    const errorMessage = compose.common.errorMessage(page);
    const submitButton = compose.issuance.issueButton(page);

    // Submit button should be disabled with invalid name (min 4 chars)
    await expect(submitButton).toBeDisabled({ timeout: 5000 });
  });

  walletTest('issuance form accepts valid asset name', async ({ page }) => {
    await navigateTo(page, 'actions');
    await actions.issueAssetOption(page).click();
    await page.waitForURL('**/compose/issuance', { timeout: 10000 });

    const nameInput = compose.issuance.assetNameInput(page);
    await nameInput.fill('TESTASSET');

    const quantityInput = compose.issuance.quantityInput(page);
    await quantityInput.fill('1000000');

    await expect(nameInput).toHaveValue('TESTASSET');
    await expect(quantityInput).toHaveValue('1000000');
  });

  walletTest('can navigate back from issuance form', async ({ page }) => {
    await navigateTo(page, 'actions');
    await actions.issueAssetOption(page).click();
    await page.waitForURL('**/compose/issuance', { timeout: 10000 });

    const backButton = compose.common.headerBackButton(page);
    await backButton.click();

    // Should go back to actions or index
    await expect(page).toHaveURL(/actions|index/);
  });
});

walletTest.describe('Issuance Flow - Full Compose Flow', () => {
  // Generate unique asset name for each test run
  const generateAssetName = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 10; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  walletTest.beforeEach(async ({ page }) => {
    await enableValidationBypass(page);
    await enableDryRun(page);
  });

  walletTest('form → review: valid issuance shows review page', async ({ page }) => {
    await navigateTo(page, 'actions');
    await actions.issueAssetOption(page).click();
    await page.waitForURL('**/compose/issuance', { timeout: 10000 });

    const assetName = generateAssetName();
    await compose.issuance.assetNameInput(page).fill(assetName);
    await compose.issuance.quantityInput(page).fill('1000000');

    const submitBtn = compose.issuance.issueButton(page);
    await expect(submitBtn).toBeEnabled({ timeout: 5000 });
    await submitBtn.click();

    await waitForReview(page);

    const reviewContent = await page.content();
    expect(reviewContent).toMatch(/review|confirm|sign/i);
  });

  walletTest('form → review → back: issuance data preserved', async ({ page }) => {
    await navigateTo(page, 'actions');
    await actions.issueAssetOption(page).click();
    await page.waitForURL('**/compose/issuance', { timeout: 10000 });

    const assetName = generateAssetName();
    const quantity = '5000000';

    await compose.issuance.assetNameInput(page).fill(assetName);
    await compose.issuance.quantityInput(page).fill(quantity);

    await compose.issuance.issueButton(page).click();
    await waitForReview(page);

    await clickBack(page);

    await expect(compose.issuance.assetNameInput(page)).toHaveValue(assetName);
    await expect(compose.issuance.quantityInput(page)).toHaveValue(quantity);
  });

  walletTest('review page shows asset name', async ({ page }) => {
    await navigateTo(page, 'actions');
    await actions.issueAssetOption(page).click();
    await page.waitForURL('**/compose/issuance', { timeout: 10000 });

    const assetName = generateAssetName();
    await compose.issuance.assetNameInput(page).fill(assetName);
    await compose.issuance.quantityInput(page).fill('1000000');

    await compose.issuance.issueButton(page).click();
    await waitForReview(page);

    const pageContent = await page.content();
    expect(pageContent).toContain(assetName);
  });
});
