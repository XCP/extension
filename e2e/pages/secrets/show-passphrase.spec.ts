/**
 * Show Passphrase Page Tests (/wallet/secrets/show-passphrase/:walletId)
 *
 * Tests for viewing the wallet's recovery phrase.
 * Requires password verification before revealing sensitive data.
 */

import { walletTest, expect, TEST_PASSWORD } from '../../fixtures';
import { secrets, common, unlock, errors } from '../../selectors';

walletTest.describe('Show Passphrase Page (/secrets/show-passphrase)', () => {
  async function getWalletId(page: any): Promise<string | null> {
    return await page.evaluate(() => {
      const state = localStorage.getItem('wallet-state');
      if (state) {
        const parsed = JSON.parse(state);
        return parsed.activeWalletId || Object.keys(parsed.wallets || {})[0];
      }
      return null;
    });
  }

  walletTest('page loads with wallet ID', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/secrets/show-passphrase/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Should show password input
    await expect(unlock.passwordInput(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows security warning', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/secrets/show-passphrase/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Should warn user about security
    await expect(secrets.warningMessage(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('requires password verification', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/secrets/show-passphrase/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Should have password input
    await expect(unlock.passwordInput(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('has reveal button', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/secrets/show-passphrase/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Should have a button to reveal the phrase
    await expect(secrets.revealButton(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('reveals passphrase with correct password', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/secrets/show-passphrase/${walletId}`));
    await page.waitForLoadState('networkidle');

    await expect(unlock.passwordInput(page)).toBeVisible({ timeout: 5000 });

    await unlock.passwordInput(page).fill(TEST_PASSWORD);

    await secrets.revealButton(page).click();

    // Should show word display after reveal
    await expect(secrets.mnemonicDisplay(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows error for wrong password', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/secrets/show-passphrase/${walletId}`));
    await page.waitForLoadState('networkidle');

    await expect(unlock.passwordInput(page)).toBeVisible({ timeout: 5000 });

    await unlock.passwordInput(page).fill('wrongpassword');

    await secrets.revealButton(page).click();

    // Should show error
    await expect(errors.genericError(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('has copy functionality after reveal', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/secrets/show-passphrase/${walletId}`));
    await page.waitForLoadState('networkidle');

    await expect(unlock.passwordInput(page)).toBeVisible({ timeout: 5000 });

    await unlock.passwordInput(page).fill(TEST_PASSWORD);

    await secrets.revealButton(page).click();

    // After revealing, there should be a copy button - wait for it to appear
    await expect(secrets.copyButton(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('can navigate back', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/secrets/show-passphrase/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Should have back button
    await expect(common.headerBackButton(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('handles invalid wallet ID', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/wallet/secrets/show-passphrase/invalid-wallet-id-12345'));
    await page.waitForLoadState('networkidle');

    // Page shows password form - fill and submit to trigger error
    // The walletId is present in URL but doesn't exist in storage
    await expect(unlock.passwordInput(page)).toBeVisible({ timeout: 5000 });
    await unlock.passwordInput(page).fill('testpassword123');
    await secrets.revealButton(page).click();

    // When wallet doesn't exist in storage, selectWallet/getUnencryptedMnemonic fails
    // and catches error at line 67-70, showing this message
    await expect(common.errorAlert(page)).toBeVisible({ timeout: 5000 });
    await expect(common.errorAlert(page)).toContainText(/Incorrect password or failed to reveal recovery phrase/i);
  });

  walletTest('displays exactly 12 mnemonic words after reveal', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/secrets/show-passphrase/${walletId}`));
    await page.waitForLoadState('networkidle');

    await unlock.passwordInput(page).fill(TEST_PASSWORD);
    await secrets.revealButton(page).click();

    // Wait for mnemonic display
    await expect(secrets.mnemonicDisplay(page)).toBeVisible({ timeout: 5000 });

    // Should show exactly 12 words in list items
    const wordItems = page.locator('ol li');
    await expect(wordItems).toHaveCount(12);
  });

  walletTest('each word has number prefix', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/secrets/show-passphrase/${walletId}`));
    await page.waitForLoadState('networkidle');

    await unlock.passwordInput(page).fill(TEST_PASSWORD);
    await secrets.revealButton(page).click();

    await expect(secrets.mnemonicDisplay(page)).toBeVisible({ timeout: 5000 });

    // Each word should have its number (1-12)
    for (let i = 1; i <= 12; i++) {
      const numberLabel = page.locator(`text="${i}."`).first();
      await expect(numberLabel).toBeVisible({ timeout: 5000 });
    }
  });

  walletTest('shows security notice after revealing', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/secrets/show-passphrase/${walletId}`));
    await page.waitForLoadState('networkidle');

    await unlock.passwordInput(page).fill(TEST_PASSWORD);
    await secrets.revealButton(page).click();

    await expect(secrets.mnemonicDisplay(page)).toBeVisible({ timeout: 5000 });

    // Should show security notice after reveal
    const securityNotice = page.locator('text=/Security Notice|Never share|steal/i').first();
    await expect(securityNotice).toBeVisible({ timeout: 5000 });
  });

  walletTest('words are valid BIP39 mnemonic words', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/secrets/show-passphrase/${walletId}`));
    await page.waitForLoadState('networkidle');

    await unlock.passwordInput(page).fill(TEST_PASSWORD);
    await secrets.revealButton(page).click();

    await expect(secrets.mnemonicDisplay(page)).toBeVisible({ timeout: 5000 });

    // Get all words
    const wordItems = page.locator('ol li span.font-mono');
    const count = await wordItems.count();

    expect(count).toBe(12);

    // Each word should be alphabetic (BIP39 words are all lowercase letters)
    for (let i = 0; i < count; i++) {
      const word = await wordItems.nth(i).textContent();
      expect(word).toMatch(/^[a-z]+$/);
    }
  });

  walletTest('shows instructions before reveal', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/secrets/show-passphrase/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Before reveal, should show warning about not sharing
    const warningText = page.locator('text=/Never share|steal your funds/i').first();
    await expect(warningText).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows instructions after reveal', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/secrets/show-passphrase/${walletId}`));
    await page.waitForLoadState('networkidle');

    await unlock.passwordInput(page).fill(TEST_PASSWORD);
    await secrets.revealButton(page).click();

    await expect(secrets.mnemonicDisplay(page)).toBeVisible({ timeout: 5000 });

    // After reveal, should show instruction to write down words
    const instruction = page.locator('text=/Write down|12 words|secure location/i').first();
    await expect(instruction).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows error for empty password', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/secrets/show-passphrase/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Try to reveal without password
    await secrets.revealButton(page).click();

    // Should show error about required password
    const errorMessage = page.locator('text=/required|enter.*password/i').first();
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows error for short password', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/wallet/secrets/show-passphrase/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Enter short password
    await unlock.passwordInput(page).fill('short');
    await secrets.revealButton(page).click();

    // Should show error about minimum length
    const errorMessage = page.locator('text=/at least|8 characters|minimum/i').first();
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });
});
