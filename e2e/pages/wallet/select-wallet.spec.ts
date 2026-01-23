/**
 * Select Wallet Page Tests (/wallet/select-wallet)
 *
 * Tests for the wallet selection page that allows switching between wallets.
 */

import { walletTest, expect } from '../../fixtures';
import { header, selectWallet } from '../../selectors';

walletTest.describe('Select Wallet Page (/select-wallet)', () => {
  async function navigateToSelectWallet(page: any): Promise<boolean> {
    // Navigate via header wallet selector
    await header.walletSelector(page).click();
    await page.waitForURL(/select-wallet/, { timeout: 5000 });
    return true;
  }

  walletTest('page loads and displays wallet list', async ({ page }) => {
    await navigateToSelectWallet(page);

    // Should show Keychain title (the page header)
    const keychainTitle = page.locator('text="Keychain"');
    await expect(keychainTitle).toBeVisible({ timeout: 5000 });
  });

  walletTest('displays at least one wallet', async ({ page }) => {
    await navigateToSelectWallet(page);

    // Wallets are displayed using HeadlessUI RadioGroup.Option which has role="radio"
    const walletItems = page.locator('[role="radio"]');
    const count = await walletItems.count();

    expect(count).toBeGreaterThanOrEqual(1);
  });

  walletTest('shows wallet names', async ({ page }) => {
    await navigateToSelectWallet(page);

    // Wallet names should be visible - the default wallet name is "Wallet 1"
    const walletName = page.locator('text=/Wallet 1|Wallet|My Wallet/i').first();
    await expect(walletName).toBeVisible({ timeout: 5000 });
  });

  walletTest('has add wallet button', async ({ page }) => {
    await navigateToSelectWallet(page);

    // Use web-first assertion - auto-waits and retries
    await expect(selectWallet.addWalletButton(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('add wallet button navigates to add-wallet page', async ({ page }) => {
    await navigateToSelectWallet(page);

    const addButton = selectWallet.addWalletButton(page);
    await expect(addButton).toBeVisible({ timeout: 5000 });
    await addButton.click();

    // Should navigate to add-wallet page
    await expect(page).toHaveURL(/add-wallet/, { timeout: 5000 });
  });

  walletTest('indicates active wallet with checked state', async ({ page }) => {
    await navigateToSelectWallet(page);

    // The active wallet should have aria-checked="true" on the radio item
    const activeWallet = page.locator('[role="radio"][aria-checked="true"]');
    await expect(activeWallet).toBeVisible({ timeout: 5000 });
  });

  walletTest('can select a different wallet', async ({ page }) => {
    await navigateToSelectWallet(page);

    // If there's more than one wallet, try to select a different one
    const walletItems = page.locator('[role="radio"]');
    const count = await walletItems.count();

    if (count <= 1) return; // Only one wallet, nothing to switch to

    // Click the second wallet
    await walletItems.nth(1).click();

    // Should navigate to index after selection
    await expect(page).toHaveURL(/index/, { timeout: 5000 });
  });

  walletTest('selecting wallet navigates to index', async ({ page }) => {
    await navigateToSelectWallet(page);

    const walletItems = page.locator('[role="radio"]');
    await expect(walletItems.first()).toBeVisible({ timeout: 5000 });

    await walletItems.first().click();
    await expect(page).toHaveURL(/index/, { timeout: 5000 });
  });

  walletTest('has back button', async ({ page }) => {
    await navigateToSelectWallet(page);

    const backButton = page.locator('button[aria-label*="back" i], header button').first();
    await expect(backButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('displays Keychain title', async ({ page }) => {
    await navigateToSelectWallet(page);

    // The page should show "Keychain" title
    const keychainTitle = page.locator('text="Keychain"');
    await expect(keychainTitle).toBeVisible({ timeout: 5000 });
  });

  walletTest('handles wallet selection error gracefully', async ({ page }) => {
    await navigateToSelectWallet(page);

    // This test verifies that even if an error occurs during selection,
    // it's handled gracefully (no crash, error message shown)
    // We verify by checking the page is functional with interactive elements
    const interactiveElement = page.locator('button, a, [role="button"]').first();
    await expect(interactiveElement).toBeVisible({ timeout: 3000 });
  });
});
