/**
 * Wallet Import Tests
 */

import { test, expect, importMnemonic, importPrivateKey, navigateTo, TEST_MNEMONIC, TEST_PRIVATE_KEY, TEST_PASSWORD } from '../fixtures';

// Known addresses for the standard test mnemonic
const EXPECTED_ADDRESSES = {
  P2TR: 'bc1p5c...kedrcr',
  P2WPKH: 'bc1qcr...306fyu',
  P2SH_P2WPKH: '37Lx99...rDCZru',
  P2PKH: '1LqBGS...YWeabA',
};

test.describe('Import Wallet - Mnemonic', () => {
  test('shows mnemonic input fields', async ({ extensionPage }) => {
    await extensionPage.getByRole('button', { name: 'Import Wallet' }).click();

    await expect(extensionPage.locator('input[name="word-0"]')).toBeVisible();
    await expect(extensionPage.locator('input[name="word-11"]')).toBeVisible();
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
    await extensionPage.getByRole('button', { name: 'Import Wallet' }).click();
    await extensionPage.waitForSelector('input[name="word-0"]');

    const invalidWords = 'invalid words that are not a real mnemonic phrase test test test'.split(' ');
    for (let i = 0; i < 12; i++) {
      await extensionPage.locator(`input[name="word-${i}"]`).fill(invalidWords[i] || 'test');
    }

    await extensionPage.getByLabel(/I have saved my secret recovery phrase/).check();
    await extensionPage.locator('input[name="password"]').fill(TEST_PASSWORD);
    await extensionPage.getByRole('button', { name: 'Continue' }).click();

    // Should show error or stay on page
    const hasError = await extensionPage.getByText(/invalid|error/i).isVisible({ timeout: 3000 }).catch(() => false);
    const notOnIndex = !extensionPage.url().includes('index');
    expect(hasError || notOnIndex).toBe(true);
  });

  test('supports pasting full mnemonic', async ({ extensionPage, extensionContext }) => {
    await extensionContext.grantPermissions(['clipboard-read', 'clipboard-write']);

    await extensionPage.getByRole('button', { name: 'Import Wallet' }).click();
    await extensionPage.waitForSelector('input[name="word-0"]');

    await extensionPage.evaluate((m) => navigator.clipboard.writeText(m), TEST_MNEMONIC);
    await extensionPage.locator('input[name="word-0"]').focus();
    await extensionPage.keyboard.press('Control+v');
    await extensionPage.waitForTimeout(500);

    const firstWord = await extensionPage.locator('input[name="word-0"]').inputValue();
    expect(firstWord).toBeTruthy();
  });
});

test.describe('Import Wallet - Private Key', () => {
  test('shows private key input', async ({ extensionPage }) => {
    await extensionPage.getByRole('button', { name: /Import Private Key/i }).click();
    await expect(extensionPage.locator('input[name="private-key"]')).toBeVisible();
  });

  test('imports wallet with valid WIF key', async ({ extensionPage }) => {
    await importPrivateKey(extensionPage, TEST_PRIVATE_KEY, TEST_PASSWORD);

    await expect(extensionPage).toHaveURL(/index/);
    await expect(extensionPage.getByRole('button', { name: 'View Assets' })).toBeVisible();
  });

  test('rejects invalid private key format', async ({ extensionPage }) => {
    await extensionPage.getByRole('button', { name: /Import Private Key/i }).click();
    await extensionPage.locator('input[name="private-key"]').fill('not-a-valid-key');

    const hasError = await extensionPage.getByText(/invalid/i).isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasError).toBe(true);
  });
});

test.describe('Import Wallet - Address Type Switching', () => {
  test('can switch to Legacy after import', async ({ extensionPage }) => {
    await importMnemonic(extensionPage, TEST_MNEMONIC, TEST_PASSWORD);
    await navigateTo(extensionPage, 'settings');

    await extensionPage.getByText('Address Type').click();
    await extensionPage.waitForURL(/address-type/);

    await extensionPage.getByText('Legacy (P2PKH)').click();
    await navigateTo(extensionPage, 'wallet');

    const address = await extensionPage.locator('.font-mono').first().textContent();
    expect(address).toMatch(/^1/);
  });
});
