import { test, expect } from '@playwright/test';
import { 
  launchExtension, 
  setupWallet, 
  createWallet,
  importWallet,
  importPrivateKey,
  switchWallet,
  navigateViaFooter,
  cleanup,
  TEST_PASSWORD,
  TEST_MNEMONIC,
  TEST_PRIVATE_KEY 
} from '../helpers/test-helpers';

test.describe('Wallet Management Features', () => {
  test('access wallet management from header', async () => {
    const { context, page } = await launchExtension('wallet-mgmt-header');
    await setupWallet(page);

    // Click header button to open wallet management
    const headerButton = page.locator('header button').first();
    await expect(headerButton).toBeVisible({ timeout: 5000 });
    await headerButton.click();

    // Should navigate to wallet selection page
    await page.waitForURL(/select-wallet/, { timeout: 5000 });

    // Should see current wallet and Add Wallet option
    await expect(page.getByText(/Wallet 1/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /Add.*Wallet/i })).toBeVisible({ timeout: 5000 });

    await cleanup(context);
  });

  test('add multiple wallets', async () => {
    const { context, page } = await launchExtension('multiple-wallets');
    await setupWallet(page);

    // Navigate to wallet management
    const headerButton = page.locator('header button').first();
    await expect(headerButton).toBeVisible({ timeout: 5000 });
    await headerButton.click();
    await page.waitForURL(/select-wallet/, { timeout: 5000 });

    // Click Add Wallet button
    const addButton = page.getByRole('button', { name: /Add.*Wallet/i });
    await expect(addButton).toBeVisible({ timeout: 5000 });
    await addButton.click();

    // Should see create option
    const createOption = page.getByRole('button', { name: /Create.*Wallet/i });
    await expect(createOption).toBeVisible({ timeout: 5000 });
    await createOption.click();

    // Complete wallet creation
    await page.waitForSelector('text=View 12-word Secret Phrase', { timeout: 5000 });
    await page.getByText('View 12-word Secret Phrase').click();

    const checkbox = page.getByLabel(/I have saved my secret recovery phrase/);
    await checkbox.waitFor({ state: 'visible', timeout: 5000 });
    await checkbox.check();

    const passwordInput = page.locator('input[name="password"]');
    await passwordInput.waitFor({ state: 'visible', timeout: 5000 });
    await passwordInput.fill(TEST_PASSWORD);

    await page.getByRole('button', { name: /Continue/i }).click();
    await page.waitForURL(/index/, { timeout: 15000 });

    // Verify we now have 2+ wallets
    await headerButton.click();
    await page.waitForURL(/select-wallet/, { timeout: 5000 });

    const walletEntries = page.locator('[role="radio"]');
    await expect(walletEntries).toHaveCount(2, { timeout: 5000 });

    await cleanup(context);
  });

  test('create multiple wallets', async () => {
    const { context, page } = await launchExtension('multiple-wallets-create');

    // Create first wallet
    await createWallet(page, TEST_PASSWORD);

    // Navigate to wallet management
    const headerButton = page.locator('header button').first();
    await expect(headerButton).toBeVisible({ timeout: 5000 });
    await headerButton.click();
    await page.waitForURL(/select-wallet/, { timeout: 5000 });

    // Click Add Wallet
    const addWalletButton = page.getByRole('button', { name: /Add.*Wallet/i });
    await expect(addWalletButton).toBeVisible({ timeout: 5000 });
    await addWalletButton.click();

    // Click Create Wallet option
    const createOption = page.getByRole('button', { name: /Create.*Wallet/i });
    await expect(createOption).toBeVisible({ timeout: 5000 });
    await createOption.click();

    // Complete second wallet creation
    await page.waitForSelector('text=View 12-word Secret Phrase', { timeout: 5000 });
    await page.getByText('View 12-word Secret Phrase').click();

    const checkbox = page.getByLabel(/I have saved my secret recovery phrase/);
    await checkbox.waitFor({ state: 'visible', timeout: 5000 });
    await checkbox.check();

    const passwordInput = page.locator('input[name="password"]');
    await passwordInput.waitFor({ state: 'visible', timeout: 5000 });
    await passwordInput.fill(TEST_PASSWORD);

    await page.getByRole('button', { name: /Continue/i }).click();
    await page.waitForURL(/index/, { timeout: 15000 });

    // Verify wallet list shows 2+ wallets
    await headerButton.click();
    await page.waitForURL(/select-wallet/, { timeout: 5000 });

    const walletEntries = page.locator('[role="radio"]');
    const walletCount = await walletEntries.count();
    expect(walletCount).toBeGreaterThanOrEqual(2);

    // Verify exactly one wallet is selected
    const selectedWallet = page.locator('[role="radio"][data-headlessui-state*="checked"], [role="radio"][aria-checked="true"]');
    await expect(selectedWallet).toHaveCount(1);

    // The selected wallet should be the newly created one (not "Wallet 1")
    const selectedWalletName = await selectedWallet.locator('.text-sm.font-medium').textContent();
    expect(selectedWalletName).not.toBe('Wallet 1');

    await cleanup(context);
  });

  test('wallet card shows address preview', async () => {
    const { context, page } = await launchExtension('address-preview');

    // Create wallet
    await createWallet(page, TEST_PASSWORD);

    // Navigate to wallet selection
    const headerButton = page.locator('header button').first();
    await expect(headerButton).toBeVisible({ timeout: 5000 });
    await headerButton.click();
    await page.waitForURL(/select-wallet/, { timeout: 5000 });

    // Wallet card should show address preview
    const walletEntries = page.locator('[role="radio"]');
    await expect(walletEntries.first()).toBeVisible({ timeout: 5000 });

    const addressDisplay = walletEntries.first().locator('.font-mono');
    await expect(addressDisplay).toBeVisible({ timeout: 5000 });

    const addressText = await addressDisplay.textContent();
    expect(addressText).toBeTruthy();
    expect(addressText).not.toBe('No address');

    // Address should look like a valid Bitcoin address (truncated format)
    const looksLikeAddress =
      addressText?.includes('...') && // Truncated format
      addressText?.match(/^(bc1|tb1|[13]|[mn])/); // Valid prefix
    expect(looksLikeAddress).toBeTruthy();

    await cleanup(context);
  });

  test('import wallet from mnemonic', async () => {
    const { context, page } = await launchExtension('import-mnemonic-mgmt');

    // Import wallet from onboarding
    await importWallet(page, TEST_MNEMONIC, TEST_PASSWORD);

    // Verify wallet imported successfully
    await expect(page).toHaveURL(/index/);
    await expect(page.locator('text=/Assets|Balances/').first()).toBeVisible({ timeout: 5000 });

    await cleanup(context);
  });

  test('import wallet from private key', async () => {
    const { context, page } = await launchExtension('import-privkey-mgmt');

    // Import wallet using private key
    await importPrivateKey(page, TEST_PRIVATE_KEY, TEST_PASSWORD);

    // Verify wallet imported
    await expect(page).toHaveURL(/index/);
    await expect(page.locator('text=/Assets|Balances/').first()).toBeVisible({ timeout: 5000 });

    await cleanup(context);
  });

  test('switch between wallets', async () => {
    const { context, page } = await launchExtension('switch-wallets');

    // Create first wallet
    await createWallet(page, TEST_PASSWORD);

    // Navigate to wallet management
    const headerButton = page.locator('header button').first();
    await expect(headerButton).toBeVisible({ timeout: 5000 });
    await headerButton.click();
    await page.waitForURL(/select-wallet/, { timeout: 5000 });

    // Add second wallet via import
    const addWalletButton = page.getByRole('button', { name: /Add.*Wallet/i });
    await expect(addWalletButton).toBeVisible({ timeout: 5000 });
    await addWalletButton.click();

    const importMnemonicButton = page.getByRole('button', { name: /Import Mnemonic/i });
    await expect(importMnemonicButton).toBeVisible({ timeout: 5000 });
    await importMnemonicButton.click();

    // Use a different mnemonic for the second wallet
    const secondMnemonic = 'test test test test test test test test test test test junk';
    await importWallet(page, secondMnemonic, TEST_PASSWORD);
    await page.waitForURL(/index/, { timeout: 10000 });

    // Open wallet list and verify we have 2 wallets
    await headerButton.click();
    await page.waitForURL(/select-wallet/, { timeout: 5000 });

    const walletEntries = page.locator('[role="radio"]');
    await expect(walletEntries).toHaveCount(2, { timeout: 5000 });

    // Click on first wallet (Wallet 1) to switch
    const wallet1 = page.getByText('Wallet 1');
    await expect(wallet1).toBeVisible({ timeout: 5000 });
    await wallet1.click();

    // Should navigate back to index
    await page.waitForURL(/index/, { timeout: 5000 });

    // Verify an address is visible
    await expect(page.locator('.font-mono').first()).toBeVisible({ timeout: 5000 });

    await cleanup(context);
  });

  test('wallet naming and identification', async () => {
    const { context, page } = await launchExtension('wallet-naming');
    await setupWallet(page);

    // Navigate to wallet selection
    const headerButton = page.locator('header button').first();
    await expect(headerButton).toBeVisible({ timeout: 5000 });
    await headerButton.click();
    await page.waitForURL(/select-wallet/, { timeout: 5000 });

    // Should see wallet name displayed
    await expect(page.getByText(/Wallet 1/i)).toBeVisible({ timeout: 5000 });

    await cleanup(context);
  });

  test('wallet removal option exists in menu', async () => {
    const { context, page } = await launchExtension('wallet-removal');

    // Create two wallets so removal is enabled (can't remove only wallet)
    await createWallet(page, TEST_PASSWORD);

    // Navigate to wallet management
    const headerButton = page.locator('header button').first();
    await expect(headerButton).toBeVisible({ timeout: 5000 });
    await headerButton.click();
    await page.waitForURL(/select-wallet/, { timeout: 5000 });

    // Add a second wallet
    const addWalletButton = page.getByRole('button', { name: /Add.*Wallet/i });
    await expect(addWalletButton).toBeVisible({ timeout: 5000 });
    await addWalletButton.click();

    const createOption = page.getByRole('button', { name: /Create.*Wallet/i });
    await expect(createOption).toBeVisible({ timeout: 5000 });
    await createOption.click();

    // Complete second wallet creation
    await page.waitForSelector('text=View 12-word Secret Phrase', { timeout: 5000 });
    await page.getByText('View 12-word Secret Phrase').click();
    const checkbox = page.getByLabel(/I have saved my secret recovery phrase/);
    await checkbox.waitFor({ state: 'visible', timeout: 5000 });
    await checkbox.check();
    const passwordInput = page.locator('input[name="password"]');
    await passwordInput.waitFor({ state: 'visible', timeout: 5000 });
    await passwordInput.fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /Continue/i }).click();
    await page.waitForURL(/index/, { timeout: 15000 });

    // Navigate back to wallet selection
    await headerButton.click();
    await page.waitForURL(/select-wallet/, { timeout: 5000 });

    // Click the wallet options menu (three dots button)
    const walletOptionsButton = page.locator('button[aria-label="Wallet options"]').first();
    await expect(walletOptionsButton).toBeVisible({ timeout: 5000 });
    await walletOptionsButton.click();

    // Should see "Remove" option in menu
    const removeOption = page.getByRole('button', { name: /Remove/i });
    await expect(removeOption).toBeVisible({ timeout: 5000 });

    await cleanup(context);
  });

  test('show passphrase option exists in menu', async () => {
    const { context, page } = await launchExtension('wallet-backup');
    await createWallet(page, TEST_PASSWORD);

    // Navigate to wallet selection
    const headerButton = page.locator('header button').first();
    await expect(headerButton).toBeVisible({ timeout: 5000 });
    await headerButton.click();
    await page.waitForURL(/select-wallet/, { timeout: 5000 });

    // Click the wallet options menu (three dots button)
    const walletOptionsButton = page.locator('button[aria-label="Wallet options"]').first();
    await expect(walletOptionsButton).toBeVisible({ timeout: 5000 });
    await walletOptionsButton.click();

    // Should see "Show Passphrase" option in menu
    const showPassphraseOption = page.getByRole('button', { name: /Show Passphrase/i });
    await expect(showPassphraseOption).toBeVisible({ timeout: 5000 });

    await cleanup(context);
  });

  test('address type selection in settings', async () => {
    const { context, page } = await launchExtension('address-type-selection');
    await createWallet(page, TEST_PASSWORD);

    // Navigate to settings
    await navigateViaFooter(page, 'settings');

    // Click on "Address Type" setting
    const addressTypeSetting = page.getByText('Address Type');
    await expect(addressTypeSetting).toBeVisible({ timeout: 5000 });
    await addressTypeSetting.click();

    // Should see address type options
    await expect(page.getByText('Legacy (P2PKH)')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Native SegWit (P2WPKH)')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Taproot (P2TR)')).toBeVisible({ timeout: 5000 });

    await cleanup(context);
  });
});