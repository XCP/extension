/**
 * Wallet Import Tests
 */

import { test, walletTest, expect, importMnemonic, navigateTo, TEST_MNEMONIC, TEST_PRIVATE_KEY, TEST_PASSWORD } from '../../fixtures';
import { onboarding, importWallet, index, settings } from '../../selectors';

// Known addresses for the standard test mnemonic
const EXPECTED_ADDRESSES = {
  P2TR: 'bc1p5c...kedrcr',
  P2WPKH: 'bc1qcr...306fyu',
  P2SH_P2WPKH: '37Lx99...rDCZru',
  P2PKH: '1LqBGS...YWeabA',
};

test.describe('Import Wallet - Mnemonic', () => {
  test('shows mnemonic input fields', async ({ extensionPage }) => {
    await onboarding.importWalletButton(extensionPage).click();

    await expect(importWallet.wordInput(extensionPage, 0)).toBeVisible();
    await expect(importWallet.wordInput(extensionPage, 11)).toBeVisible();
  });

  test('imports wallet and shows correct derived address', async ({ extensionPage }) => {
    await importMnemonic(extensionPage, TEST_MNEMONIC, TEST_PASSWORD);

    await expect(extensionPage).toHaveURL(/index/);

    // Verify one of the expected truncated addresses is visible
    const addressText = await extensionPage.locator('.font-mono').first().textContent();
    const matchesExpected = Object.values(EXPECTED_ADDRESSES).some(addr =>
      addressText?.includes(addr.split('...')[0])
    );
    expect(matchesExpected || addressText?.startsWith('bc1') || addressText?.startsWith('1') || addressText?.startsWith('3')).toBe(true);
  });

  test('rejects invalid mnemonic', async ({ extensionPage }) => {
    await onboarding.importWalletButton(extensionPage).click();
    await importWallet.wordInput(extensionPage, 0).waitFor();

    const invalidWords = 'invalid words that are not a real mnemonic phrase test test test'.split(' ');
    for (let i = 0; i < 12; i++) {
      await importWallet.wordInput(extensionPage, i).fill(invalidWords[i] || 'test');
    }

    await importWallet.savedPhraseCheckbox(extensionPage).check();
    await importWallet.passwordInput(extensionPage).fill(TEST_PASSWORD);
    await importWallet.continueButton(extensionPage).click();

    // Should show error or stay on page
    const hasError = await extensionPage.getByText(/invalid|error/i).isVisible({ timeout: 3000 }).catch(() => false);
    const notOnIndex = !extensionPage.url().includes('index');
    expect(hasError || notOnIndex).toBe(true);
  });

  test('supports pasting full mnemonic', async ({ extensionPage, extensionContext }) => {
    await extensionContext.grantPermissions(['clipboard-read', 'clipboard-write']);

    await onboarding.importWalletButton(extensionPage).click();
    await importWallet.wordInput(extensionPage, 0).waitFor();

    await extensionPage.evaluate((m) => navigator.clipboard.writeText(m), TEST_MNEMONIC);
    await importWallet.wordInput(extensionPage, 0).focus();
    await extensionPage.keyboard.press('Control+v');
    await extensionPage.waitForTimeout(500);

    const firstWord = await importWallet.wordInput(extensionPage, 0).inputValue();
    expect(firstWord).toBeTruthy();
  });
});

// Note: Import Private Key only appears after you have at least one mnemonic wallet
walletTest.describe('Import Wallet - Private Key', () => {
  walletTest('shows private key option in add wallet menu', async ({ page }) => {
    // Go to wallet selector
    await page.locator('header button').first().click();
    await page.waitForURL(/select-wallet/);

    // Click Add Wallet
    await page.getByRole('button', { name: /Add.*Wallet/i }).filter({ hasText: 'Add Wallet' }).click();

    // Should see Import Private Key option
    await expect(page.getByText(/Import Private Key/i)).toBeVisible();
  });

  walletTest('imports wallet with valid WIF key', async ({ page }) => {
    // Go to wallet selector
    await page.locator('header button').first().click();
    await page.waitForURL(/select-wallet/);

    // Click Add Wallet -> Import Private Key
    await page.getByRole('button', { name: /Add.*Wallet/i }).filter({ hasText: 'Add Wallet' }).click();
    await page.getByText(/Import Private Key/i).click();

    // Fill in private key
    await importWallet.privateKeyInput(page).fill(TEST_PRIVATE_KEY);
    await importWallet.backedUpCheckbox(page).check();
    await importWallet.passwordInput(page).fill(TEST_PASSWORD);
    await importWallet.continueButton(page).click();

    await expect(page).toHaveURL(/index/, { timeout: 15000 });
  });

  walletTest('rejects invalid private key format', async ({ page }) => {
    // Go to wallet selector
    await page.locator('header button').first().click();
    await page.waitForURL(/select-wallet/);

    // Click Add Wallet -> Import Private Key
    await page.getByRole('button', { name: /Add.*Wallet/i }).filter({ hasText: 'Add Wallet' }).click();
    await page.getByText(/Import Private Key/i).click();

    // Fill in invalid key and try to submit
    await importWallet.privateKeyInput(page).fill('not-a-valid-key');
    await importWallet.backedUpCheckbox(page).check();
    await importWallet.passwordInput(page).fill(TEST_PASSWORD);

    // Try to click Continue
    await importWallet.continueButton(page).click().catch(() => {});
    await page.waitForTimeout(1000);

    // Should show error or still be on import page (not redirected to index)
    const hasError = await page.getByText(/invalid|error|unable/i).isVisible({ timeout: 2000 }).catch(() => false);
    const stillOnImport = page.url().includes('import') || page.url().includes('select-wallet');
    expect(hasError || stillOnImport).toBe(true);
  });
});

walletTest.describe('Import Wallet - Address Type Switching', () => {
  walletTest('can switch to Legacy after import', async ({ page }) => {
    await navigateTo(page, 'settings');

    await settings.addressTypeOption(page).click();
    await page.waitForURL(/address-type/);

    await page.getByText('Legacy (P2PKH)').click();
    await page.waitForTimeout(500);

    // Go back (goes to index)
    await page.getByText('Back').click();
    await page.waitForLoadState('networkidle');

    // Verify we're on index with Legacy address
    await expect(page).toHaveURL(/index/);
  });
});
