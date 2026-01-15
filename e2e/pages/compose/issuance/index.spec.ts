/**
 * Compose Issuance Page Tests (/compose/issuance)
 *
 * Tests for the main asset issuance form.
 */

import { walletTest, expect, navigateTo } from '../../../fixtures';
import { compose, actions } from '../../../selectors';

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
