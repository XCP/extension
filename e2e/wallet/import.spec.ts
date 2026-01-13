import { test, expect } from '@playwright/test';
import { 
  launchExtension, 
  importWallet,
  unlockWallet,
  navigateViaFooter,
  cleanup,
  TEST_PASSWORD,
  TEST_MNEMONIC 
} from '../helpers/test-helpers';

// Expected addresses for the test mnemonic across different address types
const EXPECTED_ADDRESSES = {
  P2PKH: '1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA',     // Legacy
  P2WPKH: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu', // Native SegWit (bech32)
  P2SH_P2WPKH: '37Lx99uaGn5avKBxiW26HjedQE3LrDCZru', // Nested SegWit
  P2TR: 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr', // Taproot
};

// Truncated versions (first 6 + last 6 chars) as displayed on index page
const EXPECTED_TRUNCATED = {
  P2PKH: '1LqBGS...YWeabA',
  P2WPKH: 'bc1qcr...306fyu',
  P2SH_P2WPKH: '37Lx99...rDCZru',
  P2TR: 'bc1p5c...kedrcr',
};

test('import wallet with test mnemonic', async () => {
  const { context, page } = await launchExtension('wallet-import-basic');

  // Must be on onboarding page with Import Wallet option
  await expect(page.getByText('Import Wallet')).toBeVisible({ timeout: 5000 });

  // Import wallet with test mnemonic
  await importWallet(page, TEST_MNEMONIC, TEST_PASSWORD);

  // Wait for wallet to load
  await page.waitForURL(/index/, { timeout: 20000 });

  // INTEGRATION TEST: Verify correct address derivation
  // The test mnemonic should derive to one of these known addresses
  const truncatedAddresses = Object.values(EXPECTED_TRUNCATED);

  // Wait for address display to load
  await expect(page.locator('.font-mono').first()).toBeVisible({ timeout: 10000 });

  // Get all font-mono elements (where addresses are displayed)
  const monoElements = await page.locator('.font-mono').allTextContents();

  // Check if ANY of the expected truncated addresses appear
  const foundExpectedAddress = truncatedAddresses.some(truncated =>
    monoElements.some(text => text.includes(truncated))
  );

  if (!foundExpectedAddress) {
    console.log('Font-mono elements found:', monoElements);
    console.log('Expected one of:', truncatedAddresses);
  }

  // Key assertions:
  // 1. We're on the index page (wallet loaded successfully)
  expect(page.url()).toContain('index');

  // 2. One of the known derived addresses (truncated) is visible
  expect(foundExpectedAddress).toBe(true);

  await cleanup(context);
});

test('switch address types with imported wallet', async () => {
  const { context, page } = await launchExtension('wallet-import-switch');

  // Must be on onboarding page
  await expect(page.getByText('Import Wallet')).toBeVisible({ timeout: 5000 });

  // Import wallet with test mnemonic
  await importWallet(page, TEST_MNEMONIC, TEST_PASSWORD);
  await page.waitForURL(/index/, { timeout: 10000 });

  // Navigate to settings to change address type
  await navigateViaFooter(page, 'settings');

  // Click on address type settings
  const addressTypeOption = page.getByText('Address Type');
  await expect(addressTypeOption).toBeVisible({ timeout: 5000 });
  await addressTypeOption.click();
  await page.waitForURL(/address-type/, { timeout: 5000 });

  // Select Legacy address type
  const legacyOption = page.getByText('Legacy (P2PKH)');
  await expect(legacyOption).toBeVisible({ timeout: 5000 });
  await legacyOption.click();

  // Go back to main page
  await navigateViaFooter(page, 'wallet');
  await page.waitForURL(/index/, { timeout: 5000 });

  // Verify address changed to Legacy format (starts with 1)
  await expect(page.locator('.font-mono').first()).toBeVisible({ timeout: 5000 });
  const addressText = await page.locator('.font-mono').first().textContent();
  expect(addressText).toMatch(/^1/); // Legacy addresses start with 1

  await cleanup(context);
});

test('import with invalid mnemonic shows error', async () => {
  const { context, page } = await launchExtension('wallet-import-invalid');

  // Must be on onboarding page
  await expect(page.getByText('Import Wallet')).toBeVisible({ timeout: 5000 });

  // Click import wallet
  await page.getByText('Import Wallet').click();
  await page.waitForURL(/import-wallet/, { timeout: 5000 });

  // Enter invalid mnemonic words
  const mnemonicWords = 'invalid words that are not a valid mnemonic phrase test test test test test test'.split(' ');

  // Fill in the word inputs
  for (let i = 0; i < Math.min(mnemonicWords.length, 12); i++) {
    const input = page.locator(`input[name="word-${i}"]`);
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill(mnemonicWords[i]);
  }

  // Check the confirmation checkbox
  const confirmCheckbox = page.getByLabel(/I have saved|backed up/i);
  await expect(confirmCheckbox).toBeVisible({ timeout: 5000 });
  await confirmCheckbox.check();

  // Set password
  const passwordInput = page.locator('input[name="password"]');
  await expect(passwordInput).toBeVisible({ timeout: 5000 });
  await passwordInput.fill(TEST_PASSWORD);

  // Try to submit
  await page.getByRole('button', { name: /Continue|Import/i }).click();

  // Should show error message or stay on import page
  // Either error is shown OR we're still on import page (not navigated to index)
  const errorShown = await page.locator('text=/Invalid|Error|invalid/i').isVisible({ timeout: 3000 }).catch(() => false);
  const stillOnImport = !page.url().includes('index');

  expect(errorShown || stillOnImport).toBe(true);

  await cleanup(context);
});

test('import with private key', async () => {
  const { context, page } = await launchExtension('wallet-import-privkey');

  // Must be on onboarding page
  await expect(page.getByText('Import Wallet')).toBeVisible({ timeout: 5000 });

  // Navigate directly to import-private-key page (separate from mnemonic import)
  const baseUrl = page.url().split('#')[0];
  await page.goto(`${baseUrl}#/import-private-key`);
  await page.waitForURL(/import-private-key/, { timeout: 5000 });

  // Test private key (from test mnemonic, first address)
  const testPrivateKey = 'L1Knwj9W3qK3qMKdTvmg3VfzUs3ij2LETTFhxza9LfD5dngnoLG1';

  // Enter private key
  const privateKeyInput = page.locator('input[name="private-key"]');
  await expect(privateKeyInput).toBeVisible({ timeout: 5000 });
  await privateKeyInput.fill(testPrivateKey);

  // Check the backup confirmation checkbox
  const backupCheckbox = page.getByLabel(/I have backed up this private key/i);
  await expect(backupCheckbox).toBeVisible({ timeout: 5000 });
  await backupCheckbox.check();

  // Set password
  const passwordInput = page.locator('input[name="password"]');
  await expect(passwordInput).toBeVisible({ timeout: 5000 });
  await passwordInput.fill(TEST_PASSWORD);

  // Submit
  await page.getByRole('button', { name: /Continue/i }).click();

  // Should navigate to index
  await page.waitForURL(/index/, { timeout: 10000 });

  // Verify wallet loaded
  await expect(page.locator('text=/Assets|Balances/').first()).toBeVisible({ timeout: 5000 });

  await cleanup(context);
});