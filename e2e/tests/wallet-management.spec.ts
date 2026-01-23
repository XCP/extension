/**
 * Wallet Management Tests
 *
 * Multi-wallet support, wallet switching, address type selection.
 */

import {
  test,
  walletTest,
  expect,
  createWallet,
  importMnemonic,
  importPrivateKey,
  navigateTo,
  TEST_PASSWORD,
  TEST_MNEMONIC,
  TEST_PRIVATE_KEY
} from '../fixtures';
import { header, settings, viewAddress, importWallet, createWallet as createWalletSelectors, selectWallet, onboarding } from '../selectors';

test.describe('Wallet Selection', () => {
  test('header button opens wallet selection', async ({ extensionPage }) => {
    await createWallet(extensionPage);

    const headerButton = header.walletSelector(extensionPage);
    await headerButton.click();

    await expect(extensionPage).toHaveURL(/select-wallet/);
    await expect(extensionPage.getByText(/Wallet 1/i)).toBeVisible();
    await expect(selectWallet.addWalletButton(extensionPage)).toBeVisible();
  });

  test('wallet card shows address preview', async ({ extensionPage }) => {
    await createWallet(extensionPage);

    await header.walletSelector(extensionPage).click();
    await extensionPage.waitForURL(/select-wallet/);

    const walletCard = extensionPage.locator('[role="radio"]').first();
    const addressDisplay = walletCard.locator('.font-mono');

    await expect(addressDisplay).toBeVisible();
    const address = await addressDisplay.textContent();
    expect(address).toMatch(/\.\.\./); // Truncated format
  });
});

test.describe('Multi-Wallet Support', () => {
  test('can create second wallet', async ({ extensionPage }) => {
    await createWallet(extensionPage);

    // Navigate to wallet management
    await header.walletSelector(extensionPage).click();
    await extensionPage.waitForURL(/select-wallet/);

    // Add second wallet
    await selectWallet.addWalletButton(extensionPage).click();
    await onboarding.createWalletButton(extensionPage).click();

    // Complete second wallet creation
    await createWalletSelectors.revealPhraseCard(extensionPage).click();
    await createWalletSelectors.savedPhraseCheckbox(extensionPage).check();
    await createWalletSelectors.passwordInput(extensionPage).fill(TEST_PASSWORD);
    await createWalletSelectors.continueButton(extensionPage).click();

    await extensionPage.waitForURL(/index/, { timeout: 15000 });

    // Verify 2 wallets exist
    await header.walletSelector(extensionPage).click();
    await extensionPage.waitForURL(/select-wallet/);
    await expect(extensionPage.locator('[role="radio"]')).toHaveCount(2);
  });

  test('can import wallet via mnemonic', async ({ extensionPage }) => {
    await createWallet(extensionPage);

    await header.walletSelector(extensionPage).click();
    await extensionPage.waitForURL(/select-wallet/);

    await selectWallet.addWalletButton(extensionPage).click();
    await onboarding.importWalletButton(extensionPage).click();

    // Fill mnemonic
    const words = TEST_MNEMONIC.split(' ');
    for (let i = 0; i < 12; i++) {
      await importWallet.wordInput(extensionPage, i).fill(words[i]);
    }

    await importWallet.savedPhraseCheckbox(extensionPage).check();
    await importWallet.passwordInput(extensionPage).fill(TEST_PASSWORD);
    await importWallet.continueButton(extensionPage).click();

    await expect(extensionPage).toHaveURL(/index/, { timeout: 15000 });
  });

  test('can import wallet via private key', async ({ extensionPage }) => {
    await createWallet(extensionPage);

    await header.walletSelector(extensionPage).click();
    await extensionPage.waitForURL(/select-wallet/);

    await selectWallet.addWalletButton(extensionPage).click();
    await onboarding.importPrivateKeyButton(extensionPage).click();

    await importWallet.privateKeyInput(extensionPage).fill(TEST_PRIVATE_KEY);
    await importWallet.backedUpCheckbox(extensionPage).check();
    await importWallet.passwordInput(extensionPage).fill(TEST_PASSWORD);
    await importWallet.continueButton(extensionPage).click();

    await expect(extensionPage).toHaveURL(/index/, { timeout: 10000 });

    // Verify 2 wallets exist
    await header.walletSelector(extensionPage).click();
    await expect(extensionPage.locator('[role="radio"]')).toHaveCount(2);
  });

  test('can switch between wallets', async ({ extensionPage }) => {
    await createWallet(extensionPage);

    // Add second wallet
    await header.walletSelector(extensionPage).click();
    await extensionPage.waitForURL(/select-wallet/);

    await selectWallet.addWalletButton(extensionPage).click();
    await onboarding.createWalletButton(extensionPage).click();

    await createWalletSelectors.revealPhraseCard(extensionPage).click();
    await createWalletSelectors.savedPhraseCheckbox(extensionPage).check();
    await createWalletSelectors.passwordInput(extensionPage).fill(TEST_PASSWORD);
    await createWalletSelectors.continueButton(extensionPage).click();
    await extensionPage.waitForURL(/index/, { timeout: 15000 });

    // Switch to Wallet 1
    await header.walletSelector(extensionPage).click();
    await extensionPage.waitForURL(/select-wallet/);
    await extensionPage.getByText('Wallet 1').click();

    await expect(extensionPage).toHaveURL(/index/);
  });
});

walletTest.describe('Wallet Menu Options', () => {
  walletTest('shows wallet options menu', async ({ page }) => {
    await header.walletSelector(page).click();
    await page.waitForURL(/select-wallet/);

    const optionsButton = page.locator('button[aria-label="Wallet options"]').first();
    await optionsButton.click();

    await expect(page.getByText('Show Passphrase')).toBeVisible();
  });

  walletTest('wallet options menu shows remove option', async ({ page }) => {
    await header.walletSelector(page).click();
    await page.waitForURL(/select-wallet/);

    const optionsButton = page.locator('button[aria-label="Wallet options"]').first();
    await optionsButton.click();

    // Remove option should be visible in menu
    const removeOption = page.getByText(/Remove Wallet/i);
    await expect(removeOption).toBeVisible({ timeout: 3000 });
  });
});

walletTest.describe('Address Type Selection', () => {
  walletTest('shows address type options in settings', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.getByText('Address Type').click();

    await expect(page.getByText('Legacy (P2PKH)')).toBeVisible();
    await expect(page.getByText('Nested SegWit (P2SH-P2WPKH)')).toBeVisible();
    await expect(page.getByText('Native SegWit (P2WPKH)')).toBeVisible();
    await expect(page.getByText('Taproot (P2TR)')).toBeVisible();
  });

  walletTest('can switch address type', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.getByText('Address Type').click();
    await page.waitForURL(/address-type/);

    // Verify address type options are shown
    await expect(page.getByText('Legacy (P2PKH)')).toBeVisible();
    await expect(page.getByText('Taproot (P2TR)')).toBeVisible();

    // Switch to Legacy
    await page.getByText('Legacy (P2PKH)').click();
    

    // Go back using back button (goes to index page)
    await page.getByText('Back').click();
    await page.waitForLoadState('networkidle');

    // Should be on index page with Legacy address (starts with 1)
    await expect(page).toHaveURL(/index/);
    // Check for truncated Legacy address format (e.g., "1CE4Aw...BHLYxP") or Address 1 label
    const addressContent = page.locator('text=/1[A-Za-z0-9]{3,}\\.\\.\\.[A-Za-z0-9]+/')
      .or(page.locator('text=Address 1')).first();
    await expect(addressContent).toBeVisible({ timeout: 5000 });
  });
});
