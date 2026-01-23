/**
 * Remove Wallet Page Tests (/wallet/remove-wallet/:walletId)
 *
 * Tests for the remove wallet page that allows deleting a wallet with password confirmation.
 */

import { walletTest, expect, navigateTo, TEST_PASSWORD } from '../../fixtures';
import { common, createWallet } from '../../selectors';

walletTest.describe('Remove Wallet Page (/remove-wallet)', () => {
  // Navigate to remove-wallet page through the UI (via select-wallet page wallet menu)
  // Returns false if Remove button is disabled (only one wallet exists)
  async function navigateToRemoveWallet(page: any): Promise<boolean> {
    // Navigate to select-wallet page
    const currentUrl = page.url();
    const hashIndex = currentUrl.indexOf('#');
    const baseUrl = hashIndex !== -1 ? currentUrl.substring(0, hashIndex + 1) : currentUrl + '#';
    await page.goto(`${baseUrl}/select-wallet`);
    await page.waitForLoadState('networkidle');

    // Open wallet menu (the three dots button for wallet options)
    const walletMenu = page.locator('[aria-label="Wallet options"]');
    await expect(walletMenu.first()).toBeVisible({ timeout: 5000 });
    await walletMenu.first().click();

    // Wait for menu to appear and check if Remove button is disabled (only one wallet)
    const removeOption = page.locator('button').filter({ hasText: /^Remove\s/ });
    await expect(removeOption.or(page.getByRole('menu')).first()).toBeVisible({ timeout: 3000 });

    const removeCount = await removeOption.count();
    if (removeCount === 0) {
      return false;
    }

    const isDisabled = await removeOption.isDisabled();
    if (isDisabled) {
      // Close the menu by clicking elsewhere
      await page.keyboard.press('Escape');
      return false;
    }

    await removeOption.click();
    await page.waitForLoadState('networkidle');

    // Verify we're on the remove-wallet page
    await expect(page).toHaveURL(/remove-wallet/, { timeout: 5000 });
    return true;
  }

  walletTest('page loads with warning or password input', async ({ page }) => {
    const canNavigate = await navigateToRemoveWallet(page);
    walletTest.skip(!canNavigate, 'Cannot remove only wallet - Remove button is disabled');

    // Should show remove wallet page with warning or password input
    const warning = page.locator('text=/Warning|Remove|Delete/i').first();
    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();

    await expect(warning.or(passwordInput).first()).toBeVisible({ timeout: 5000 });
  });

  walletTest('displays security warning', async ({ page }) => {
    const canNavigate = await navigateToRemoveWallet(page);
    walletTest.skip(!canNavigate, 'Cannot remove only wallet - Remove button is disabled');

    // Should show warning about backing up before removing
    await expect(
      page.locator('text=/Warning|backup|backed up|mnemonic|private key/i').first()
    ).toBeVisible({ timeout: 5000 });
  });

  walletTest('requires password verification', async ({ page }) => {
    const canNavigate = await navigateToRemoveWallet(page);
    walletTest.skip(!canNavigate, 'Cannot remove only wallet - Remove button is disabled');

    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 5000 });
  });

  walletTest('has remove button', async ({ page }) => {
    const canNavigate = await navigateToRemoveWallet(page);
    walletTest.skip(!canNavigate, 'Cannot remove only wallet - Remove button is disabled');

    const removeButton = page.locator('button:has-text("Remove"), button[type="submit"]').first();
    await expect(removeButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows error for wrong password', async ({ page }) => {
    const canNavigate = await navigateToRemoveWallet(page);
    walletTest.skip(!canNavigate, 'Cannot remove only wallet - Remove button is disabled');

    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 5000 });

    await passwordInput.fill('wrongpassword123');

    const removeButton = page.locator('button:has-text("Remove"), button[type="submit"]').first();
    await removeButton.click();

    // Should show error and stay on page
    const errorText = page.locator('text=/incorrect|invalid|wrong|does not match|error/i').first();

    // Wait for error to appear (wrong password should trigger validation error)
    await expect(errorText).toBeVisible({ timeout: 5000 });

    // Should still be on remove-wallet page
    expect(page.url()).toContain('remove-wallet');
  });

  walletTest('has back button', async ({ page }) => {
    const canNavigate = await navigateToRemoveWallet(page);
    walletTest.skip(!canNavigate, 'Cannot remove only wallet - Remove button is disabled');

    await expect(common.headerBackButton(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('handles invalid wallet ID', async ({ page }) => {
    const currentUrl = page.url();
    const hashIndex = currentUrl.indexOf('#');
    const baseUrl = hashIndex !== -1 ? currentUrl.substring(0, hashIndex + 1) : currentUrl + '#';
    await page.goto(`${baseUrl}/remove-wallet/invalid-wallet-id-12345`);
    await page.waitForLoadState('networkidle');

    // Should show error or redirect - check which behavior occurred
    const wasRedirected = !page.url().includes('/remove-wallet');

    if (wasRedirected) {
      // Redirected away from invalid wallet ID - test passes
      expect(wasRedirected).toBe(true);
    } else {
      // Still on page, should show error message
      const errorText = page.locator('text=/not found|error|invalid/i').first();
      await expect(errorText).toBeVisible({ timeout: 5000 });
    }
  });

  walletTest('warning box has danger styling', async ({ page }) => {
    const canNavigate = await navigateToRemoveWallet(page);
    walletTest.skip(!canNavigate, 'Cannot remove only wallet - Remove button is disabled');

    // The warning box should have red/danger styling
    const warningBox = page.locator('.bg-red-50, [class*="red"], [class*="danger"], [class*="warning"]').first();
    await expect(warningBox).toBeVisible({ timeout: 5000 });
  });

  walletTest('displays wallet type in warning', async ({ page }) => {
    const canNavigate = await navigateToRemoveWallet(page);
    walletTest.skip(!canNavigate, 'Cannot remove only wallet - Remove button is disabled');

    // Warning should mention the wallet type (mnemonic or private key)
    await expect(
      page.locator('text=/mnemonic|private key/i').first()
    ).toBeVisible({ timeout: 5000 });
  });
});

// Multi-wallet tests - create a second wallet so we can test removal
walletTest.describe('Remove Wallet - Full Flow', () => {
  // Helper to create a second wallet via UI
  async function createSecondWallet(page: any): Promise<void> {
    // Navigate to add-wallet page
    const currentUrl = page.url();
    const hashIndex = currentUrl.indexOf('#');
    const baseUrl = hashIndex !== -1 ? currentUrl.substring(0, hashIndex + 1) : currentUrl + '#';
    await page.goto(`${baseUrl}/add-wallet`);
    await page.waitForLoadState('networkidle');

    // Click Create Wallet option
    const createWalletOption = page.locator('button:has-text("Create Wallet"), a:has-text("Create Wallet")').first();
    await expect(createWalletOption).toBeVisible({ timeout: 5000 });
    await createWalletOption.click();

    await page.waitForURL(/create-wallet/, { timeout: 5000 });

    // Wait for and click the reveal phrase card
    const revealCard = createWallet.revealPhraseCard(page);
    await expect(revealCard).toBeVisible({ timeout: 5000 });
    await revealCard.click();

    // Wait for checkbox to become enabled (phrase is revealed)
    await expect(createWallet.savedPhraseCheckbox(page)).toBeEnabled({ timeout: 5000 });
    await createWallet.savedPhraseCheckbox(page).check();

    // Wait for password input to appear and fill it
    await expect(createWallet.passwordInput(page)).toBeVisible({ timeout: 5000 });
    await createWallet.passwordInput(page).fill(TEST_PASSWORD);

    // Wait for continue button to be enabled and click it
    await expect(createWallet.continueButton(page)).toBeEnabled({ timeout: 5000 });
    await createWallet.continueButton(page).click();

    // Wait for wallet to be created and redirected to index
    await page.waitForURL(/index/, { timeout: 15000 });
  }

  // Helper to get wallet count from select-wallet page
  async function getWalletCount(page: any): Promise<number> {
    const currentUrl = page.url();
    const hashIndex = currentUrl.indexOf('#');
    const baseUrl = hashIndex !== -1 ? currentUrl.substring(0, hashIndex + 1) : currentUrl + '#';
    await page.goto(`${baseUrl}/select-wallet`);
    await page.waitForLoadState('networkidle');

    // Count wallet items (each wallet has options button)
    const walletOptions = page.locator('[aria-label="Wallet options"]');
    return await walletOptions.count();
  }

  walletTest('successfully removes a wallet with correct password', async ({ page }) => {
    // First, record initial wallet count
    const initialCount = await getWalletCount(page);

    // Create a second wallet so we can remove one
    await createSecondWallet(page);

    // Verify we now have more wallets
    const countAfterCreate = await getWalletCount(page);
    expect(countAfterCreate).toBeGreaterThan(initialCount);

    // Open wallet menu for the LAST wallet (the one we just created)
    const walletMenus = page.locator('[aria-label="Wallet options"]');
    const menuCount = await walletMenus.count();
    await walletMenus.nth(menuCount - 1).click();

    // Wait for menu to appear, then click Remove option
    const removeOption = page.locator('button').filter({ hasText: /^Remove\s/ });
    await expect(removeOption).toBeVisible({ timeout: 5000 });
    await removeOption.click();

    // Should be on remove-wallet page
    await expect(page).toHaveURL(/remove-wallet/, { timeout: 5000 });

    // Enter correct password
    const passwordInput = page.locator('input[name="password"]');
    await expect(passwordInput).toBeVisible({ timeout: 5000 });
    await passwordInput.fill(TEST_PASSWORD);

    // Click remove button (red button with "Remove" in text)
    const removeButton = page.locator('button[type="submit"]').filter({ hasText: /Remove/ });
    await expect(removeButton).toBeVisible({ timeout: 3000 });
    await removeButton.click();

    // Should redirect to select-wallet page after successful removal
    await expect(page).toHaveURL(/select-wallet/, { timeout: 10000 });

    // Verify wallet count decreased
    const finalCount = await getWalletCount(page);
    expect(finalCount).toBe(countAfterCreate - 1);
  });

  walletTest('removal is cancelled when clicking back', async ({ page }) => {
    // Create a second wallet
    await createSecondWallet(page);

    // Get wallet count
    const countBefore = await getWalletCount(page);

    // Open wallet menu for the LAST wallet (the one we just created)
    const walletMenus = page.locator('[aria-label="Wallet options"]');
    const menuCount = await walletMenus.count();
    await walletMenus.nth(menuCount - 1).click();

    const removeOption = page.locator('button').filter({ hasText: /^Remove\s/ });
    await expect(removeOption).toBeVisible({ timeout: 5000 });
    await removeOption.click();

    // Should be on remove-wallet page
    await expect(page).toHaveURL(/remove-wallet/, { timeout: 5000 });

    // Click back button instead of confirming
    await common.headerBackButton(page).click();

    // Wait for navigation away from remove-wallet
    await expect(page).not.toHaveURL(/remove-wallet/, { timeout: 5000 });

    // Verify wallet count is unchanged
    const countAfter = await getWalletCount(page);
    expect(countAfter).toBe(countBefore);
  });
});
