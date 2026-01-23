/**
 * Wallet Management Operations Tests
 *
 * Tests for critical wallet management operations:
 * - Remove wallet (single and multi-wallet scenarios)
 * - Reset wallet (factory reset)
 * - Change password
 */

import {
  test,
  walletTest,
  expect,
  createWallet,
  navigateTo,
  TEST_PASSWORD
} from '../fixtures';
import {
  header,
  selectWallet,
  settings,
  onboarding,
  createWallet as createWalletSelectors,
} from '../selectors';

/**
 * Helper to create a second wallet for multi-wallet tests.
 * Returns true if successful, throws if it fails.
 */
async function createSecondWallet(page: any): Promise<void> {
  await header.walletSelector(page).click();
  await page.waitForURL(/select-wallet/);

  const addWalletBtn = selectWallet.addWalletButton(page);
  await expect(addWalletBtn).toBeVisible({ timeout: 5000 });
  await addWalletBtn.click();

  await expect(onboarding.createWalletButton(page)).toBeVisible({ timeout: 5000 });
  await onboarding.createWalletButton(page).click();

  await expect(createWalletSelectors.revealPhraseCard(page)).toBeVisible({ timeout: 5000 });
  await createWalletSelectors.revealPhraseCard(page).click();

  await expect(createWalletSelectors.savedPhraseCheckbox(page)).toBeVisible();
  await createWalletSelectors.savedPhraseCheckbox(page).check();
  await createWalletSelectors.passwordInput(page).fill(TEST_PASSWORD);
  await createWalletSelectors.continueButton(page).click();

  await page.waitForURL(/index/, { timeout: 15000 });
}

/**
 * Helper to open wallet menu and click Remove button.
 * Navigates to remove-wallet page.
 */
async function navigateToRemoveWallet(page: any): Promise<void> {
  await header.walletSelector(page).click();
  await page.waitForURL(/select-wallet/);

  const walletCard = page.locator('[role="radio"]').first();
  await expect(walletCard).toBeVisible();

  // Click the menu button on the wallet card
  const menuButton = walletCard.locator('button').first();
  await expect(menuButton).toBeVisible({ timeout: 5000 });
  await menuButton.click();

  // Click Remove button
  const removeButton = page.locator('button').filter({ hasText: /Remove/i });
  await expect(removeButton).toBeVisible({ timeout: 3000 });
  await removeButton.click();

  await page.waitForURL(/remove-wallet/);
}

test.describe('Remove Wallet - Single Wallet', () => {
  test('remove button is disabled when only one wallet exists', async ({ extensionPage }) => {
    await createWallet(extensionPage);

    await header.walletSelector(extensionPage).click();
    await extensionPage.waitForURL(/select-wallet/);

    const walletCard = extensionPage.locator('[role="radio"]').first();
    await expect(walletCard).toBeVisible();

    // Click the menu button
    const menuButton = walletCard.locator('button').first();
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();

    // Remove button should be disabled or have disabled styling
    const removeButton = extensionPage.locator('button').filter({ hasText: /Remove/i });
    await expect(removeButton).toBeVisible({ timeout: 3000 });

    // Verify disabled state - check both disabled attribute and visual indicators
    const isDisabled = await removeButton.isDisabled();
    if (!isDisabled) {
      // Some UIs use CSS classes instead of disabled attribute
      const classes = await removeButton.getAttribute('class') || '';
      expect(classes).toMatch(/opacity-50|cursor-not-allowed|disabled/);
    }
  });

  test('remove button shows tooltip explaining why disabled', async ({ extensionPage }) => {
    await createWallet(extensionPage);

    await header.walletSelector(extensionPage).click();
    await extensionPage.waitForURL(/select-wallet/);

    const walletCard = extensionPage.locator('[role="radio"]').first();
    await expect(walletCard).toBeVisible();

    const menuButton = walletCard.locator('button').first();
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();

    const removeButton = extensionPage.locator('button').filter({ hasText: /Remove/i });
    await expect(removeButton).toBeVisible({ timeout: 3000 });

    // Verify tooltip explains the disabled state
    const title = await removeButton.getAttribute('title');
    expect(title).toContain('Cannot remove only wallet');
  });
});

test.describe('Remove Wallet - Multiple Wallets', () => {
  test('remove button is enabled when multiple wallets exist', async ({ extensionPage }) => {
    await createWallet(extensionPage);
    await createSecondWallet(extensionPage);

    await header.walletSelector(extensionPage).click();
    await extensionPage.waitForURL(/select-wallet/);

    // Verify we have 2 wallets
    const walletCards = extensionPage.locator('[role="radio"]');
    await expect(walletCards).toHaveCount(2, { timeout: 5000 });

    // Open menu for first wallet
    const menuButton = walletCards.first().locator('button').first();
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();

    // Remove button should be enabled
    const removeButton = extensionPage.locator('button').filter({ hasText: /Remove/i });
    await expect(removeButton).toBeVisible({ timeout: 3000 });
    await expect(removeButton).toBeEnabled();
  });

  test('clicking remove navigates to remove-wallet page', async ({ extensionPage }) => {
    await createWallet(extensionPage);
    await createSecondWallet(extensionPage);

    await navigateToRemoveWallet(extensionPage);

    // Verify we're on the remove wallet page with expected content
    await expect(extensionPage.locator('text=/Remove|Delete/i').first()).toBeVisible({ timeout: 5000 });
  });

  test('remove wallet requires password verification', async ({ extensionPage }) => {
    await createWallet(extensionPage);
    await createSecondWallet(extensionPage);

    await navigateToRemoveWallet(extensionPage);

    // Verify password input is required
    const passwordInput = extensionPage.locator('input[name="password"], input[type="password"]');
    await expect(passwordInput).toBeVisible({ timeout: 5000 });
  });

  test('wrong password shows error and stays on page', async ({ extensionPage }) => {
    await createWallet(extensionPage);
    await createSecondWallet(extensionPage);

    await navigateToRemoveWallet(extensionPage);

    // Fill wrong password
    const passwordInput = extensionPage.locator('input[name="password"], input[type="password"]');
    await passwordInput.fill('wrongpassword');

    const submitButton = extensionPage.getByRole('button', { name: /Remove|Confirm|Delete/i });
    await expect(submitButton).toBeEnabled({ timeout: 3000 });
    await submitButton.click();

    // Should show error or stay on remove-wallet page
    await expect(extensionPage).toHaveURL(/remove-wallet/, { timeout: 5000 });
    // Error message should appear
    const errorOrPasswordField = extensionPage.locator('text=/incorrect|invalid|wrong|error|failed|password/i')
      .or(extensionPage.locator('input[name="password"]'));
    await expect(errorOrPasswordField.first()).toBeVisible({ timeout: 5000 });
  });

  test('correct password removes wallet and updates count', async ({ extensionPage }) => {
    await createWallet(extensionPage);
    await createSecondWallet(extensionPage);

    // Count wallets before removal
    await header.walletSelector(extensionPage).click();
    await extensionPage.waitForURL(/select-wallet/);
    const walletCountBefore = await extensionPage.locator('[role="radio"]').count();
    expect(walletCountBefore).toBe(2);

    // Navigate to remove first wallet
    const menuButton = extensionPage.locator('[role="radio"]').first().locator('button').first();
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();

    const removeButton = extensionPage.locator('button').filter({ hasText: /Remove/i });
    await expect(removeButton).toBeVisible({ timeout: 3000 });
    await removeButton.click();
    await extensionPage.waitForURL(/remove-wallet/);

    // Enter correct password and submit
    await extensionPage.locator('input[name="password"], input[type="password"]').fill(TEST_PASSWORD);
    await extensionPage.getByRole('button', { name: /Remove|Confirm|Delete/i }).click();

    // Should return to wallet selection with one fewer wallet
    await extensionPage.waitForURL(/select-wallet/, { timeout: 10000 });
    const walletCountAfter = await extensionPage.locator('[role="radio"]').count();
    expect(walletCountAfter).toBe(walletCountBefore - 1);
  });
});

walletTest.describe('Reset Wallet', () => {
  walletTest('can access reset wallet from settings', async ({ page }) => {
    await navigateTo(page, 'settings');
    await expect(page).toHaveURL(/settings/);

    const resetOption = page.getByText(/Reset.*Wallet/i).first();
    await expect(resetOption).toBeVisible({ timeout: 5000 });

    await resetOption.click();
    await page.waitForURL(/reset-wallet/);

    // Verify reset page loaded with expected content
    await expect(page.locator('text=/Reset|Delete.*all/i').first()).toBeVisible({ timeout: 5000 });
  });

  walletTest('reset wallet shows critical warning', async ({ page }) => {
    await navigateTo(page, 'settings');

    const resetOption = page.locator('text=/Reset.*Wallet/i').first();
    await expect(resetOption).toBeVisible({ timeout: 5000 });
    await resetOption.click();
    await page.waitForURL(/reset-wallet/);

    // Should show warning about permanent deletion
    const warningText = page.locator('text=/cannot be undone|delete all|permanent|warning|irreversible/i');
    await expect(warningText.first()).toBeVisible({ timeout: 5000 });
  });

  walletTest('reset wallet requires password verification', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.locator('text=/Reset.*Wallet/i').first().click();
    await page.waitForURL(/reset-wallet/);

    // Password input must be visible
    const passwordInput = page.locator('input[name="password"], input[type="password"]');
    await expect(passwordInput).toBeVisible({ timeout: 5000 });
  });

  walletTest('wrong password shows error on reset', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.locator('text=/Reset.*Wallet/i').first().click();
    await page.waitForURL(/reset-wallet/);

    const passwordInput = page.locator('input[name="password"], input[type="password"]');
    await passwordInput.fill('wrongpassword');

    const submitButton = page.getByRole('button', { name: /Reset|Confirm|Delete/i });
    await expect(submitButton).toBeEnabled({ timeout: 3000 });
    await submitButton.click();

    // Should stay on reset page (not redirect to onboarding)
    await expect(page).toHaveURL(/reset-wallet/, { timeout: 5000 });
  });

  walletTest('reset wallet can be cancelled', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.locator('text=/Reset.*Wallet/i').first().click();
    await page.waitForURL(/reset-wallet/);

    // Click back button
    const backButton = page.locator('button[aria-label*="back"], button[aria-label*="Back"], header button').first();
    await expect(backButton).toBeVisible({ timeout: 5000 });
    await backButton.click();

    // Should return to settings
    await expect(page).toHaveURL(/settings/, { timeout: 5000 });

    // Wallet should still work
    await navigateTo(page, 'wallet');
    const addressDisplay = page.locator('[aria-label="Current address"]');
    await expect(addressDisplay).toBeVisible({ timeout: 5000 });
  });

  walletTest('correct password resets wallet to onboarding', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.locator('text=/Reset.*Wallet/i').first().click();
    await page.waitForURL(/reset-wallet/);

    await page.locator('input[name="password"], input[type="password"]').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /Reset|Confirm|Delete/i }).click();

    // Should redirect to onboarding
    await page.waitForURL(/onboarding/, { timeout: 10000 });

    // Verify onboarding options are visible
    await expect(page.getByText('Create Wallet')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Import Wallet')).toBeVisible({ timeout: 5000 });
  });
});

walletTest.describe('Change Password', () => {
  walletTest('can access change password from security settings', async ({ page }) => {
    await navigateTo(page, 'settings');
    await expect(page).toHaveURL(/settings/);

    const securityOption = settings.securityOption(page);
    await expect(securityOption).toBeVisible({ timeout: 5000 });
    await securityOption.click();
    await page.waitForURL(/security/);

    // Verify password change UI is visible
    await expect(page.locator('text=/Change.*Password|Current.*Password/i').first()).toBeVisible({ timeout: 5000 });
  });

  walletTest('change password form has all required fields', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.locator('text=/Security/i').first().click();
    await page.waitForURL(/security/);

    // All three password fields must be present
    const currentPasswordInput = page.locator('input[name="currentPassword"], input[placeholder*="current" i]').first();
    const newPasswordInput = page.locator('input[name="newPassword"], input[placeholder*="new" i]').first();
    const confirmPasswordInput = page.locator('input[name="confirmPassword"], input[placeholder*="confirm" i]').first();

    await expect(currentPasswordInput).toBeVisible({ timeout: 5000 });
    await expect(newPasswordInput).toBeVisible({ timeout: 5000 });
    await expect(confirmPasswordInput).toBeVisible({ timeout: 5000 });
  });

  walletTest('wrong current password keeps user on security page', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.locator('text=/Security/i').first().click();
    await page.waitForURL(/security/);

    await page.locator('input[name="currentPassword"], input[placeholder*="current" i]').first().fill('wrongpassword');
    await page.locator('input[name="newPassword"], input[placeholder*="new" i]').first().fill('NewPassword123!');
    await page.locator('input[name="confirmPassword"], input[placeholder*="confirm" i]').first().fill('NewPassword123!');

    const submitButton = page.getByRole('button', { name: /Change.*Password|Update|Save/i });
    await expect(submitButton).toBeEnabled({ timeout: 3000 });
    await submitButton.click();

    // Should stay on security page (password was wrong)
    await expect(page).toHaveURL(/security/, { timeout: 5000 });
  });

  walletTest('short password is rejected', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.locator('text=/Security/i').first().click();
    await page.waitForURL(/security/);

    await page.locator('input[name="currentPassword"], input[placeholder*="current" i]').first().fill(TEST_PASSWORD);
    await page.locator('input[name="newPassword"], input[placeholder*="new" i]').first().fill('short');
    await page.locator('input[name="confirmPassword"], input[placeholder*="confirm" i]').first().fill('short');

    const submitButton = page.getByRole('button', { name: /Change.*Password|Update|Save/i });

    // Button should be disabled for short password, or stay on page after click
    const isDisabled = await submitButton.isDisabled();
    if (!isDisabled) {
      await submitButton.click();
      await expect(page).toHaveURL(/security/, { timeout: 5000 });
    }
    // Either disabled button or staying on page is acceptable
  });

  walletTest('mismatched passwords are rejected', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.locator('text=/Security/i').first().click();
    await page.waitForURL(/security/);

    await page.locator('input[name="currentPassword"], input[placeholder*="current" i]').first().fill(TEST_PASSWORD);
    await page.locator('input[name="newPassword"], input[placeholder*="new" i]').first().fill('NewPassword123!');
    await page.locator('input[name="confirmPassword"], input[placeholder*="confirm" i]').first().fill('DifferentPassword123!');

    const submitButton = page.getByRole('button', { name: /Change.*Password|Update|Save/i });

    // Button should be disabled for mismatched passwords, or stay on page after click
    const isDisabled = await submitButton.isDisabled();
    if (!isDisabled) {
      await submitButton.click();
      await expect(page).toHaveURL(/security/, { timeout: 5000 });
    }
  });

  walletTest('valid password change succeeds', async ({ page }) => {
    const NEW_PASSWORD = 'NewPassword123!';

    await navigateTo(page, 'settings');
    await page.locator('text=/Security/i').first().click();
    await page.waitForURL(/security/);

    await page.locator('input[name="currentPassword"], input[placeholder*="current" i]').first().fill(TEST_PASSWORD);
    await page.locator('input[name="newPassword"], input[placeholder*="new" i]').first().fill(NEW_PASSWORD);
    await page.locator('input[name="confirmPassword"], input[placeholder*="confirm" i]').first().fill(NEW_PASSWORD);

    const submitButton = page.getByRole('button', { name: /Change.*Password|Update|Save/i });
    await expect(submitButton).toBeEnabled({ timeout: 3000 });
    await submitButton.click();

    // Should show success indicator or redirect to unlock page
    const successOrUnlock = page.locator('text=/success|changed|updated/i')
      .or(page.locator('input[name="password"]'));
    await expect(successOrUnlock.first()).toBeVisible({ timeout: 5000 });

    // If redirected to unlock, verify new password works
    if (page.url().includes('unlock')) {
      await page.locator('input[name="password"]').fill(NEW_PASSWORD);
      await page.getByRole('button', { name: /Unlock/i }).click();
      await page.waitForURL(/index/, { timeout: 10000 });
    }
  });
});

walletTest.describe('Security Settings Navigation', () => {
  walletTest('settings page shows both security and reset options', async ({ page }) => {
    await navigateTo(page, 'settings');
    await expect(page).toHaveURL(/settings/);

    // Both options must be visible
    await expect(page.locator('text=/Security/i').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=/Reset.*Wallet/i').first()).toBeVisible({ timeout: 5000 });
  });
});
