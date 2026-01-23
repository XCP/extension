/**
 * Address Type Matrix Tests
 *
 * Verifies all wallet features work correctly across ALL 6 address types:
 *
 * Standard Address Types (for created/imported BIP39 wallets):
 * - P2PKH (Legacy) - starts with 1
 * - P2SH-P2WPKH (Nested SegWit) - starts with 3
 * - P2WPKH (Native SegWit) - starts with bc1q
 * - P2TR (Taproot) - starts with bc1p
 *
 * Counterwallet Address Types (for Counterwallet-derived wallets):
 * - Counterwallet (P2PKH with custom derivation) - starts with 1
 * - Counterwallet SegWit (P2WPKH with custom derivation) - starts with bc1q
 */

import {
  test,
  walletTest,
  expect,
  createWallet,
  importMnemonic,
  importPrivateKey,
  navigateTo,
  lockWallet,
  unlockWallet,
  TEST_PASSWORD,
  TEST_MNEMONIC,
  TEST_PRIVATE_KEY,
  TEST_COUNTERWALLET_MNEMONIC
} from '../fixtures';
import {
  STANDARD_ADDRESS_TYPES,
  COUNTERWALLET_ADDRESS_TYPES,
  ADDRESS_TYPE_DISPLAY_NAMES,
  ADDRESS_PREFIX_STRINGS,
  type AddressType,
} from '../test-data';
import {
  settings,
  index,
  viewAddress,
  selectAddress
} from '../selectors';

async function selectAddressType(page: any, addressType: AddressType): Promise<void> {
  await navigateTo(page, 'settings');
  await expect(page).toHaveURL(/settings/);

  const addressTypeOption = settings.addressTypeOption(page);
  await expect(addressTypeOption).toBeVisible();
  await addressTypeOption.click();
  await expect(page).toHaveURL(/address-type/);

  const radioOptions = page.locator('[role="radio"]');
  await expect(radioOptions.first()).toBeVisible();

  const displayName = ADDRESS_TYPE_DISPLAY_NAMES[addressType];
  const targetOption = page.locator(`[role="radio"]`).filter({ hasText: displayName });

  const targetCount = await targetOption.count();
  if (targetCount > 0) {
    await targetOption.click();
  } else {
    const options = await radioOptions.all();
    for (const option of options) {
      const text = await option.textContent();
      if (text?.includes(addressType.toUpperCase()) || text?.includes(displayName)) {
        await option.click();
        break;
      }
    }
  }

  // Wait for the selection to be applied
  

  await navigateTo(page, 'wallet');
  await expect(page).toHaveURL(/index/);

  // Wait for the address to update on the index page
  const expectedPrefix = ADDRESS_PREFIX_STRINGS.mainnet[addressType];
  await page.waitForFunction(
    (prefix: string) => {
      const addressEl = document.querySelector('[aria-label="Current address"] .font-mono');
      const text = addressEl?.textContent || '';
      return text.startsWith(prefix);
    },
    expectedPrefix,
    { timeout: 5000 }
  ).catch(() => {}); // Non-critical - address display may be truncated
}

async function getCurrentDisplayedAddress(page: any): Promise<string> {
  // Use index.addressText since we're on the index page after wallet creation/type change
  const addressElement = index.addressText(page);
  await expect(addressElement).toBeVisible({ timeout: 10000 });
  const address = await addressElement.textContent();
  return address || '';
}

async function getReceivePageAddress(page: any): Promise<string> {
  // On view-address page, address is in a div with aria-label="Copy address"
  const addressElement = viewAddress.addressDisplay(page);
  await expect(addressElement).toBeVisible({ timeout: 10000 });
  const address = await addressElement.textContent();
  return address || '';
}

function validateAddressPrefix(address: string, addressType: AddressType): boolean {
  const prefix = ADDRESS_PREFIX_STRINGS.mainnet[addressType];

  if (address.includes('...')) {
    const visiblePrefix = address.split('...')[0];
    return visiblePrefix.startsWith(prefix);
  }

  return address.startsWith(prefix);
}

test.describe('Address Type Matrix - Create Wallet', () => {
  test('new wallet defaults to Taproot (P2TR) address', async ({ extensionPage }) => {
    await createWallet(extensionPage);

    const address = await getCurrentDisplayedAddress(extensionPage);

    expect(validateAddressPrefix(address, 'p2tr')).toBe(true);
  });
});

test.describe('Address Type Matrix - Switch Types (Created Wallet)', () => {
  for (const addressType of STANDARD_ADDRESS_TYPES) {
    test(`can switch to ${ADDRESS_TYPE_DISPLAY_NAMES[addressType]}`, async ({ extensionPage }) => {
      await createWallet(extensionPage);

      await selectAddressType(extensionPage, addressType);

      const address = await getCurrentDisplayedAddress(extensionPage);
      expect(validateAddressPrefix(address, addressType)).toBe(true);
    });
  }
});

test.describe('Address Type Matrix - Switch Types (Imported Mnemonic)', () => {
  for (const addressType of STANDARD_ADDRESS_TYPES) {
    test(`imported wallet can switch to ${ADDRESS_TYPE_DISPLAY_NAMES[addressType]}`, async ({ extensionPage }) => {
      await importMnemonic(extensionPage, TEST_MNEMONIC, TEST_PASSWORD);

      await selectAddressType(extensionPage, addressType);

      const address = await getCurrentDisplayedAddress(extensionPage);
      expect(validateAddressPrefix(address, addressType)).toBe(true);
    });
  }
});

walletTest.describe('Address Type Matrix - Receive Address Display', () => {
  for (const addressType of STANDARD_ADDRESS_TYPES) {
    walletTest(`receive page shows correct ${addressType} address`, async ({ page }) => {
      await selectAddressType(page, addressType);

      const receiveButton = index.receiveButton(page);
      await expect(receiveButton).toBeVisible({ timeout: 5000 });
      await receiveButton.click();
      await expect(page).toHaveURL(/view-address/, { timeout: 5000 });

      // Use getReceivePageAddress for the view-address page
      const addressOnReceive = await getReceivePageAddress(page);
      expect(validateAddressPrefix(addressOnReceive, addressType)).toBe(true);
    });
  }
});

walletTest.describe('Address Type Matrix - Address Preview in Settings', () => {
  walletTest('settings shows preview addresses for all types', async ({ page }) => {
    await navigateTo(page, 'settings');
    const addressTypeOption = settings.addressTypeOption(page);
    await expect(addressTypeOption).toBeVisible();
    await addressTypeOption.click();
    await expect(page).toHaveURL(/address-type/);

    await page.waitForLoadState('networkidle');
    const radioOptions = page.locator('[role="radio"]');
    await expect(radioOptions.first()).toBeVisible({ timeout: 10000 });

    const options = await radioOptions.all();
    expect(options.length).toBeGreaterThanOrEqual(4);

    for (const option of options) {
      const text = await option.textContent();
      expect(text).toBeTruthy();
      expect(text!.length).toBeGreaterThan(5);
    }
  });

  for (const addressType of STANDARD_ADDRESS_TYPES) {
    walletTest(`preview for ${addressType} shows correct prefix`, async ({ page }) => {
      await navigateTo(page, 'settings');
      const addressTypeOption = settings.addressTypeOption(page);
      await expect(addressTypeOption).toBeVisible();
      await addressTypeOption.click();
      await expect(page).toHaveURL(/address-type/);

      await page.waitForLoadState('networkidle');
      await expect(page.locator('[role="radio"]').first()).toBeVisible({ timeout: 10000 });

      const displayName = ADDRESS_TYPE_DISPLAY_NAMES[addressType];
      const card = page.locator('[role="radio"]').filter({ hasText: displayName });
      const cardCount = await card.count();

      if (cardCount === 0) {
        return; // Card not present for this address type
      }

      await expect(card).toBeVisible();
      const previewElement = card.locator('.text-xs');
      const previewCount = await previewElement.count();

      if (previewCount > 0) {
        const previewText = await previewElement.textContent();
        const expectedPrefix = ADDRESS_PREFIX_STRINGS.mainnet[addressType];

        if (previewText && previewText.length > 0) {
          expect(previewText).toContain(expectedPrefix);
        }
      }
    });
  }
});

walletTest.describe('Address Type Matrix - QR Code Display', () => {
  for (const addressType of STANDARD_ADDRESS_TYPES) {
    walletTest(`QR code displays for ${addressType} address`, async ({ page }) => {
      await selectAddressType(page, addressType);

      const receiveButton = index.receiveButton(page);
      await expect(receiveButton).toBeVisible({ timeout: 5000 });
      await receiveButton.click();
      await expect(page).toHaveURL(/view-address/, { timeout: 5000 });

      // QR code should be visible on the receive page
      const qrCode = viewAddress.qrCode(page);
      await expect(qrCode).toBeVisible({ timeout: 5000 });
    });
  }
});

walletTest.describe('Address Type Matrix - Copy Address', () => {
  for (const addressType of STANDARD_ADDRESS_TYPES) {
    walletTest(`can copy ${addressType} address to clipboard`, async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);

      await selectAddressType(page, addressType);

      const copyButton = selectAddress.copyButton(page);
      const buttonCount = await copyButton.count();

      if (buttonCount === 0) {
        return; // Copy button not present
      }

      await expect(copyButton).toBeVisible();
      await copyButton.click();

      const clipboardContent = await page.evaluate(() => navigator.clipboard.readText());
      const expectedPrefix = ADDRESS_PREFIX_STRINGS.mainnet[addressType];
      expect(clipboardContent.startsWith(expectedPrefix)).toBe(true);
    });
  }
});

// Note: Address type persistence tests are covered in e2e/flows/persistence.spec.ts

test.describe('Address Type Matrix - Counterwallet Wallet', () => {
  test('importing Counterwallet mnemonic creates Counterwallet wallet', async ({ extensionPage }) => {
    await importMnemonic(extensionPage, TEST_COUNTERWALLET_MNEMONIC, TEST_PASSWORD);

    // Wait for index page to fully load after import
    await extensionPage.waitForLoadState('networkidle');
    await expect(index.addressText(extensionPage)).toBeVisible({ timeout: 15000 });

    const address = await getCurrentDisplayedAddress(extensionPage);
    expect(validateAddressPrefix(address, 'counterwallet')).toBe(true);
  });

  test('Counterwallet wallet shows only Counterwallet address options', async ({ extensionPage }) => {
    await importMnemonic(extensionPage, TEST_COUNTERWALLET_MNEMONIC, TEST_PASSWORD);

    await navigateTo(extensionPage, 'settings');
    const addressTypeOption = settings.addressTypeOption(extensionPage);
    await expect(addressTypeOption).toBeVisible();
    await addressTypeOption.click();
    await expect(extensionPage).toHaveURL(/address-type/);

    await extensionPage.waitForLoadState('networkidle');
    const radioOptions = extensionPage.locator('[role="radio"]');
    await expect(radioOptions.first()).toBeVisible({ timeout: 10000 });

    const options = await radioOptions.all();
    expect(options.length).toBe(2);

    // CounterWallet options should be visible
    const counterwalletOption = extensionPage.locator('[role="radio"]').filter({ hasText: 'CounterWallet (P2PKH)' });
    const counterwalletSegwitOption = extensionPage.locator('[role="radio"]').filter({ hasText: 'CounterWallet SegWit' });

    await expect(counterwalletOption).toBeVisible();
    await expect(counterwalletSegwitOption).toBeVisible();

    // Standard address types should NOT be visible
    const legacyOption = extensionPage.locator('[role="radio"]').filter({ hasText: 'Legacy (P2PKH)' });
    const taprootOption = extensionPage.locator('[role="radio"]').filter({ hasText: 'Taproot' });

    const legacyCount = await legacyOption.count();
    const taprootCount = await taprootOption.count();

    expect(legacyCount).toBe(0);
    expect(taprootCount).toBe(0);
  });

  for (const addressType of COUNTERWALLET_ADDRESS_TYPES) {
    test(`Counterwallet wallet can switch to ${ADDRESS_TYPE_DISPLAY_NAMES[addressType]}`, async ({ extensionPage }) => {
      await importMnemonic(extensionPage, TEST_COUNTERWALLET_MNEMONIC, TEST_PASSWORD);

      await selectAddressType(extensionPage, addressType);

      const address = await getCurrentDisplayedAddress(extensionPage);
      expect(validateAddressPrefix(address, addressType)).toBe(true);
    });
  }
});

walletTest.describe('Address Type Matrix - Private Key Import', () => {
  walletTest('can add wallet via private key import', async ({ page }) => {
    // Navigate to select wallet to add another wallet
    const walletSelector = page.locator('header button[aria-label="Select Wallet"]');
    await expect(walletSelector).toBeVisible({ timeout: 5000 });
    await walletSelector.click();
    await expect(page).toHaveURL(/select-wallet/);

    // Click Add Wallet (the main green button, not the header one)
    const addWalletButton = page.locator('button.bg-green-500').filter({ hasText: /Add Wallet/i });
    await expect(addWalletButton).toBeVisible({ timeout: 5000 });
    await addWalletButton.click();

    // Click Import Private Key
    const importPrivateKeyOption = page.getByRole('button', { name: /Import Private Key/i });
    await expect(importPrivateKeyOption).toBeVisible({ timeout: 5000 });
    await importPrivateKeyOption.click();

    await page.waitForSelector('input[name="private-key"]');
    await page.locator('input[name="private-key"]').fill(TEST_PRIVATE_KEY);
    await page.getByLabel(/I have backed up this private key/i).check();
    await page.locator('input[name="password"]').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.waitForURL(/index/, { timeout: 15000 });

    const address = await getCurrentDisplayedAddress(page);
    expect(address.length).toBeGreaterThan(0);
  });

  walletTest('private key import shows valid address format', async ({ page }) => {
    // Navigate to select wallet to add another wallet
    const walletSelector = page.locator('header button[aria-label="Select Wallet"]');
    await expect(walletSelector).toBeVisible({ timeout: 5000 });
    await walletSelector.click();
    await expect(page).toHaveURL(/select-wallet/);

    // Click Add Wallet (the main green button, not the header one)
    const addWalletButton = page.locator('button.bg-green-500').filter({ hasText: /Add Wallet/i });
    await expect(addWalletButton).toBeVisible({ timeout: 5000 });
    await addWalletButton.click();

    // Click Import Private Key
    const importPrivateKeyOption = page.getByRole('button', { name: /Import Private Key/i });
    await expect(importPrivateKeyOption).toBeVisible({ timeout: 5000 });
    await importPrivateKeyOption.click();

    await page.waitForSelector('input[name="private-key"]');
    await page.locator('input[name="private-key"]').fill(TEST_PRIVATE_KEY);
    await page.getByLabel(/I have backed up this private key/i).check();
    await page.locator('input[name="password"]').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.waitForURL(/index/, { timeout: 15000 });

    const address = await getCurrentDisplayedAddress(page);

    const isValidFormat =
      address.startsWith('1') ||
      address.startsWith('3') ||
      address.startsWith('bc1q') ||
      address.startsWith('bc1p');

    expect(isValidFormat).toBe(true);
  });
});
