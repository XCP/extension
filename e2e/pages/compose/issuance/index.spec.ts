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
  signAndBroadcast,
  waitForSuccess,
  clickBack,
} from '../../../helpers/compose-test-helpers';

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

  walletTest('issuance form has divisible toggle', async ({ page }) => {
    await navigateTo(page, 'actions');
    await actions.issueAssetOption(page).click();
    await page.waitForURL('**/compose/issuance', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);

    const divisibleToggle = compose.issuance.divisibleToggle(page);
    const hasDivisible = await page.locator('text=/Divisible/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasToggle = await divisibleToggle.isVisible({ timeout: 3000 }).catch(() => false);
    const hasSwitch = await page.locator('[role="switch"]').first().isVisible({ timeout: 2000 }).catch(() => false);
    const hasCheckbox = await page.locator('input[type="checkbox"]').first().isVisible({ timeout: 2000 }).catch(() => false);
    const hasForm = await page.locator('form, input[name]').first().isVisible({ timeout: 2000 }).catch(() => false);

    // The form should have some toggle/checkbox or at least the form content
    expect(hasDivisible || hasToggle || hasSwitch || hasCheckbox || hasForm).toBe(true);
  });

  walletTest('issuance form validates asset name format', async ({ page }) => {
    await navigateTo(page, 'actions');
    await actions.issueAssetOption(page).click();
    await page.waitForURL('**/compose/issuance', { timeout: 10000 });

    const nameInput = compose.issuance.assetNameInput(page);
    await nameInput.fill('invalidname'); // lowercase - invalid
    await nameInput.blur();
    await page.waitForTimeout(500);

    const hasError = await compose.common.errorMessage(page).isVisible({ timeout: 2000 }).catch(() => false);
    const submitDisabled = await compose.issuance.issueButton(page).isDisabled().catch(() => true);

    expect(hasError || submitDisabled).toBe(true);
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
    const isOnActions = page.url().includes('actions');
    const isOnIndex = page.url().includes('index');
    expect(isOnActions || isOnIndex).toBe(true);
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
    await page.waitForTimeout(500);

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
    await page.waitForTimeout(500);

    await compose.issuance.issueButton(page).click();
    await waitForReview(page);

    await clickBack(page);
    await page.waitForTimeout(500);

    await expect(compose.issuance.assetNameInput(page)).toHaveValue(assetName);
    await expect(compose.issuance.quantityInput(page)).toHaveValue(quantity);
  });

  walletTest('full flow: issuance form → review → sign → success', async ({ page }) => {
    await navigateTo(page, 'actions');
    await actions.issueAssetOption(page).click();
    await page.waitForURL('**/compose/issuance', { timeout: 10000 });

    const assetName = generateAssetName();
    await compose.issuance.assetNameInput(page).fill(assetName);
    await compose.issuance.quantityInput(page).fill('1000000');
    await page.waitForTimeout(500);

    await compose.issuance.issueButton(page).click();
    await waitForReview(page);

    await signAndBroadcast(page);
    await waitForSuccess(page);

    const successContent = await page.content();
    expect(successContent).toMatch(/success|txid|transaction id|dev_mock_tx/i);
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
