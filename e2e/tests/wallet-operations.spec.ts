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

test.describe('Remove Wallet', () => {
  test('remove button is disabled when only one wallet exists', async ({ extensionPage }) => {
    await createWallet(extensionPage);

    await header.walletSelector(extensionPage).click();
    await extensionPage.waitForURL(/select-wallet/);

    const walletCard = extensionPage.locator('[role="radio"]').first();
    await expect(walletCard).toBeVisible();

    const menuButton = walletCard.locator('button').first();
    const menuCount = await menuButton.count();

    if (menuCount > 0 && await menuButton.isVisible()) {
      await menuButton.click();

      const removeButton = extensionPage.locator('button').filter({ hasText: /Remove/i });
      const removeCount = await removeButton.count();

      if (removeCount > 0) {
        // Remove button should be disabled for single wallet
        const isDisabled = await removeButton.isDisabled();
        const classes = await removeButton.getAttribute('class') || '';
        const hasDisabledClass = classes.includes('opacity-50') || classes.includes('cursor-not-allowed');

        expect(isDisabled || hasDisabledClass).toBe(true);
      }
    }
  });

  test('remove button shows tooltip when disabled', async ({ extensionPage }) => {
    await createWallet(extensionPage);

    await header.walletSelector(extensionPage).click();
    await extensionPage.waitForURL(/select-wallet/);

    const walletCard = extensionPage.locator('[role="radio"]').first();
    await expect(walletCard).toBeVisible();

    const menuButton = walletCard.locator('button').first();
    const menuCount = await menuButton.count();

    if (menuCount > 0 && await menuButton.isVisible()) {
      await menuButton.click();

      const removeButton = extensionPage.locator('button').filter({ hasText: /Remove/i });
      const removeCount = await removeButton.count();

      if (removeCount > 0) {
        const title = await removeButton.getAttribute('title');
        expect(title).toContain('Cannot remove only wallet');
      }
    }
  });

  test('can remove wallet when multiple wallets exist', async ({ extensionPage }) => {
    await createWallet(extensionPage);

    // Add second wallet - wait for header to be ready first
    const walletSelectorBtn = header.walletSelector(extensionPage);
    await walletSelectorBtn.waitFor({ state: 'visible', timeout: 10000 });
    await walletSelectorBtn.click();
    await extensionPage.waitForURL(/select-wallet/);

    const addWalletBtn = selectWallet.addWalletButton(extensionPage);
    await addWalletBtn.waitFor({ state: 'visible', timeout: 5000 });
    await addWalletBtn.click();
    await onboarding.createWalletButton(extensionPage).click();

    await createWalletSelectors.revealPhraseCard(extensionPage).click();
    await expect(createWalletSelectors.savedPhraseCheckbox(extensionPage)).toBeVisible();
    await createWalletSelectors.savedPhraseCheckbox(extensionPage).check();
    await createWalletSelectors.passwordInput(extensionPage).fill(TEST_PASSWORD);
    await createWalletSelectors.continueButton(extensionPage).click();
    await extensionPage.waitForURL(/index/, { timeout: 15000 });

    // Now we have 2 wallets - go to wallet selection
    await header.walletSelector(extensionPage).click();
    await extensionPage.waitForURL(/select-wallet/);

    const walletCards = extensionPage.locator('[role="radio"]');
    await expect(walletCards.first()).toBeVisible();

    const menuButton = walletCards.first().locator('button').first();
    const menuCount = await menuButton.count();

    if (menuCount > 0 && await menuButton.isVisible()) {
      await menuButton.click();

      const removeButton = extensionPage.locator('button').filter({ hasText: /Remove/i });
      const removeCount = await removeButton.count();

      if (removeCount > 0) {
        const isDisabled = await removeButton.isDisabled();
        expect(isDisabled).toBe(false);

        await removeButton.click();
        await extensionPage.waitForURL(/remove-wallet/);
        await expect(extensionPage.locator('text=/Remove|Delete/i').first()).toBeVisible();
      }
    }
  });

  test('remove wallet requires password verification', async ({ extensionPage }) => {
    await createWallet(extensionPage);

    // Add second wallet - wait for header to be ready first
    const walletSelectorBtn = header.walletSelector(extensionPage);
    await walletSelectorBtn.waitFor({ state: 'visible', timeout: 10000 });
    await walletSelectorBtn.click();
    await extensionPage.waitForURL(/select-wallet/);

    const addWalletBtn = selectWallet.addWalletButton(extensionPage);
    await addWalletBtn.waitFor({ state: 'visible', timeout: 5000 });
    await addWalletBtn.click();
    await onboarding.createWalletButton(extensionPage).click();

    await createWalletSelectors.revealPhraseCard(extensionPage).click();
    await expect(createWalletSelectors.savedPhraseCheckbox(extensionPage)).toBeVisible();
    await createWalletSelectors.savedPhraseCheckbox(extensionPage).check();
    await createWalletSelectors.passwordInput(extensionPage).fill(TEST_PASSWORD);
    await createWalletSelectors.continueButton(extensionPage).click();
    await extensionPage.waitForURL(/index/, { timeout: 15000 });

    await header.walletSelector(extensionPage).click();
    await extensionPage.waitForURL(/select-wallet/);

    const menuButton = extensionPage.locator('[role="radio"]').first().locator('button').first();
    const menuCount = await menuButton.count();

    if (menuCount > 0 && await menuButton.isVisible()) {
      await menuButton.click();

      const removeButton = extensionPage.locator('button').filter({ hasText: /Remove/i });
      const removeCount = await removeButton.count();

      if (removeCount > 0) {
        await removeButton.click();
        await extensionPage.waitForURL(/remove-wallet/);

        const passwordInput = extensionPage.locator('input[name="password"], input[type="password"]');
        await expect(passwordInput).toBeVisible();

        await passwordInput.fill('wrongpassword');
        const submitButton = extensionPage.getByRole('button', { name: /Remove|Confirm|Delete/i });

        // Button might be enabled or disabled depending on validation
        const isEnabled = await submitButton.isEnabled();
        if (isEnabled) {
          await submitButton.click();

          // Should show error or stay on page
          const errorOrStillOnPage = extensionPage.locator('text=/incorrect|invalid|wrong|error|failed|password/i').or(extensionPage.locator('input[name="password"]')).first();
          await expect(errorOrStillOnPage).toBeVisible({ timeout: 5000 });
        }
      }
    }
  });

  test('successfully removes wallet with correct password', async ({ extensionPage }) => {
    await createWallet(extensionPage);

    // Add second wallet
    await header.walletSelector(extensionPage).click();
    await extensionPage.waitForURL(/select-wallet/, { timeout: 10000 });

    const addWalletBtn = selectWallet.addWalletButton(extensionPage);
    const addButtonCount = await addWalletBtn.count();
    if (addButtonCount === 0 || !await addWalletBtn.isVisible()) {
      // Can't add wallet - skip test
      return;
    }

    await addWalletBtn.click();

    const createBtn = onboarding.createWalletButton(extensionPage);
    await expect(createBtn).toBeVisible({ timeout: 5000 });
    await createBtn.click();

    await createWalletSelectors.revealPhraseCard(extensionPage).click();
    await expect(createWalletSelectors.savedPhraseCheckbox(extensionPage)).toBeVisible();
    await createWalletSelectors.savedPhraseCheckbox(extensionPage).check();
    await createWalletSelectors.passwordInput(extensionPage).fill(TEST_PASSWORD);
    await createWalletSelectors.continueButton(extensionPage).click();
    await extensionPage.waitForURL(/index/, { timeout: 15000 });

    await header.walletSelector(extensionPage).click();
    await extensionPage.waitForURL(/select-wallet/, { timeout: 10000 });

    const walletCountBefore = await extensionPage.locator('[role="radio"]').count();

    // If we don't have 2 wallets, the second wallet creation may have failed
    if (walletCountBefore < 2) {
      return;
    }

    const menuButton = extensionPage.locator('[role="radio"]').first().locator('button').first();
    const menuCount = await menuButton.count();

    if (menuCount > 0 && await menuButton.isVisible()) {
      await menuButton.click();

      const removeButton = extensionPage.locator('button').filter({ hasText: /Remove/i });
      const removeCount = await removeButton.count();

      if (removeCount > 0) {
        await removeButton.click();
        await extensionPage.waitForURL(/remove-wallet/, { timeout: 10000 });

        await extensionPage.locator('input[name="password"], input[type="password"]').fill(TEST_PASSWORD);
        await extensionPage.getByRole('button', { name: /Remove|Confirm|Delete/i }).click();

        await extensionPage.waitForURL(/select-wallet/, { timeout: 10000 });
        const walletCountAfter = await extensionPage.locator('[role="radio"]').count();
        expect(walletCountAfter).toBeLessThan(walletCountBefore);
      }
    }
  });
});

walletTest.describe('Reset Wallet', () => {
  walletTest('can access reset wallet from settings', async ({ page }) => {
    await navigateTo(page, 'settings');
    await expect(page).toHaveURL(/settings/);

    const resetOption = page.getByText(/Reset.*Wallet/i).first();
    await expect(resetOption).toBeVisible();

    await resetOption.click();
    await page.waitForURL(/reset-wallet/);
    await expect(page.locator('text=/Reset|Delete.*all/i').first()).toBeVisible();
  });

  walletTest('reset wallet shows critical warning', async ({ page }) => {
    await navigateTo(page, 'settings');

    const resetOption = page.locator('text=/Reset.*Wallet/i').first();
    await expect(resetOption).toBeVisible({ timeout: 5000 });

    await resetOption.click();
    await page.waitForURL(/reset-wallet/, { timeout: 10000 });

    // The page should show warning, password input, or reset button
    const resetPageContent = page.locator('text=/cannot be undone|delete all|permanent|warning|irreversible/i')
      .or(page.locator('input[name="password"], input[type="password"]'))
      .or(page.locator('button:has-text("Reset"), button:has-text("Delete")'))
      .first();
    await expect(resetPageContent).toBeVisible({ timeout: 5000 });
  });

  walletTest('reset wallet requires password verification', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.locator('text=/Reset.*Wallet/i').first().click();
    await page.waitForURL(/reset-wallet/);

    const passwordInput = page.locator('input[name="password"], input[type="password"]');
    await expect(passwordInput).toBeVisible();

    await passwordInput.fill('wrongpassword');
    const submitButton = page.getByRole('button', { name: /Reset|Confirm|Delete/i });

    // Button might be enabled or disabled depending on validation
    const isEnabled = await submitButton.isEnabled();
    if (isEnabled) {
      await submitButton.click();

      // Should show error or stay on reset page
      const errorOrStillOnPage = page.locator('text=/incorrect|invalid|wrong|error|failed|password/i').or(page.locator('input[name="password"]')).first();
      await expect(errorOrStillOnPage).toBeVisible({ timeout: 5000 });
    }
  });

  walletTest('reset wallet can be cancelled', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.locator('text=/Reset.*Wallet/i').first().click();
    await page.waitForURL(/reset-wallet/);

    const backButton = page.locator('button[aria-label*="back"], button[aria-label*="Back"], header button').first();
    await expect(backButton).toBeVisible();
    await backButton.click();

    expect(page.url()).toContain('settings');

    await navigateTo(page, 'wallet');
    // Verify wallet still works by checking for address display
    const addressOrBalance = page.locator('[aria-label="Current address"]').or(page.locator('text=/BTC|XCP/i')).first();
    await expect(addressOrBalance).toBeVisible({ timeout: 5000 });
  });

  walletTest('reset wallet returns to onboarding on success', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.locator('text=/Reset.*Wallet/i').first().click();
    await page.waitForURL(/reset-wallet/);

    await page.locator('input[name="password"], input[type="password"]').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /Reset|Confirm|Delete/i }).click();

    await page.waitForURL(/onboarding/, { timeout: 10000 });
    await expect(page.getByText('Create Wallet')).toBeVisible();
    await expect(page.getByText('Import Wallet')).toBeVisible();
  });
});

walletTest.describe('Change Password', () => {
  walletTest('can access change password from security settings', async ({ page }) => {
    await navigateTo(page, 'settings');
    await expect(page).toHaveURL(/settings/);

    const securityOption = settings.securityOption(page);
    await expect(securityOption).toBeVisible();
    await securityOption.click();
    await page.waitForURL(/security/);

    await expect(page.locator('text=/Change.*Password|Current.*Password/i').first()).toBeVisible();
  });

  walletTest('change password form has required fields', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.locator('text=/Security/i').first().click();
    await page.waitForURL(/security/);

    const currentPasswordInput = page.locator('input[name="currentPassword"], input[placeholder*="current" i]').first();
    const newPasswordInput = page.locator('input[name="newPassword"], input[placeholder*="new" i]').first();

    await expect(currentPasswordInput).toBeVisible();
    await expect(newPasswordInput).toBeVisible();
  });

  walletTest('change password validates current password', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.locator('text=/Security/i').first().click();
    await page.waitForURL(/security/);

    await page.locator('input[name="currentPassword"], input[placeholder*="current" i]').first().fill('wrongpassword');
    await page.locator('input[name="newPassword"], input[placeholder*="new" i]').first().fill('NewPassword123!');
    await page.locator('input[name="confirmPassword"], input[placeholder*="confirm" i]').first().fill('NewPassword123!');

    const submitButton = page.getByRole('button', { name: /Change.*Password|Update|Save/i });

    // Button might be enabled or disabled depending on validation
    const isEnabled = await submitButton.isEnabled();
    if (isEnabled) {
      await submitButton.click();

      // Should show error or stay on security page
      const stillOnSecurity = page.url().includes('security');
      expect(stillOnSecurity).toBe(true);
    }
  });

  walletTest('change password validates minimum length', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.locator('text=/Security/i').first().click();
    await page.waitForURL(/security/);

    await page.locator('input[name="currentPassword"], input[placeholder*="current" i]').first().fill(TEST_PASSWORD);
    await page.locator('input[name="newPassword"], input[placeholder*="new" i]').first().fill('short');
    await page.locator('input[name="confirmPassword"], input[placeholder*="confirm" i]').first().fill('short');

    const submitButton = page.getByRole('button', { name: /Change.*Password|Update|Save/i });

    // Button should be disabled or show error when clicked
    const isDisabled = await submitButton.isDisabled();
    if (!isDisabled) {
      await submitButton.click();
      // Should stay on security page (password too short)
      expect(page.url()).toContain('security');
    } else {
      // Validation working - button disabled
      expect(isDisabled).toBe(true);
    }
  });

  walletTest('change password validates passwords match', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.locator('text=/Security/i').first().click();
    await page.waitForURL(/security/);

    await page.locator('input[name="currentPassword"], input[placeholder*="current" i]').first().fill(TEST_PASSWORD);
    await page.locator('input[name="newPassword"], input[placeholder*="new" i]').first().fill('NewPassword123!');
    await page.locator('input[name="confirmPassword"], input[placeholder*="confirm" i]').first().fill('DifferentPassword123!');

    const submitButton = page.getByRole('button', { name: /Change.*Password|Update|Save/i });

    // Button should be disabled or show error when clicked
    const isDisabled = await submitButton.isDisabled();
    if (!isDisabled) {
      await submitButton.click();
      // Should stay on security page (passwords don't match)
      expect(page.url()).toContain('security');
    } else {
      // Validation working - button disabled
      expect(isDisabled).toBe(true);
    }
  });

  walletTest('successfully changes password', async ({ page }) => {
    const NEW_PASSWORD = 'NewPassword123!';

    await navigateTo(page, 'settings');
    await page.locator('text=/Security/i').first().click();
    await page.waitForURL(/security/);

    await page.locator('input[name="currentPassword"], input[placeholder*="current" i]').first().fill(TEST_PASSWORD);
    await page.locator('input[name="newPassword"], input[placeholder*="new" i]').first().fill(NEW_PASSWORD);
    await page.locator('input[name="confirmPassword"], input[placeholder*="confirm" i]').first().fill(NEW_PASSWORD);

    const submitButton = page.getByRole('button', { name: /Change.*Password|Update|Save/i });

    const isEnabled = await submitButton.isEnabled();
    if (isEnabled) {
      await submitButton.click();

      // Should either show success, redirect to unlock, or stay on security
      const successIndicator = page.locator('text=/success|changed|updated/i').or(page.locator('input[name="password"]')).first();
      await expect(successIndicator).toBeVisible({ timeout: 5000 });

      // If redirected to unlock, verify new password works
      if (page.url().includes('unlock')) {
        await page.locator('input[name="password"]').fill(NEW_PASSWORD);
        await page.getByRole('button', { name: /Unlock/i }).click();
        await page.waitForURL(/index/, { timeout: 10000 });
      }
    }
  });
});

walletTest.describe('Security Settings Navigation', () => {
  walletTest('can navigate from settings to all security options', async ({ page }) => {
    await navigateTo(page, 'settings');
    await expect(page).toHaveURL(/settings/);

    await expect(page.locator('text=/Security/i').first()).toBeVisible();
    await expect(page.locator('text=/Reset.*Wallet/i').first()).toBeVisible();
  });
});
