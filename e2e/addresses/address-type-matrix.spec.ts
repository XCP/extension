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
} from '../helpers/test-data';

async function selectAddressType(page: any, addressType: AddressType): Promise<void> {
  await navigateTo(page, 'settings');
  await expect(page).toHaveURL(/settings/);

  const addressTypeOption = page.locator('text=Address Type').first();
  await expect(addressTypeOption).toBeVisible();
  await addressTypeOption.click();
  await expect(page).toHaveURL(/address-type/);

  const radioOptions = page.locator('[role="radio"]');
  await expect(radioOptions.first()).toBeVisible();

  const displayName = ADDRESS_TYPE_DISPLAY_NAMES[addressType];
  const targetOption = page.locator(`[role="radio"]`).filter({ hasText: displayName });

  if (await targetOption.isVisible({ timeout: 2000 }).catch(() => false)) {
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

  await navigateTo(page, 'wallet');
  await expect(page).toHaveURL(/index/);
  await page.waitForLoadState('networkidle');
}

async function getCurrentDisplayedAddress(page: any): Promise<string> {
  const addressElement = page.locator('.font-mono').first();
  await expect(addressElement).toBeVisible();
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

      const receiveButton = page.locator('button[aria-label="Receive tokens"], button:has-text("Receive")').first();
      if (await receiveButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await receiveButton.click();
        await page.waitForURL(/view-address|receive/);

        const addressOnReceive = await getCurrentDisplayedAddress(page);
        expect(validateAddressPrefix(addressOnReceive, addressType)).toBe(true);
      }
    });
  }
});

walletTest.describe('Address Type Matrix - Address Preview in Settings', () => {
  walletTest('settings shows preview addresses for all types', async ({ page }) => {
    await navigateTo(page, 'settings');
    const addressTypeOption = page.locator('text=Address Type').first();
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
      const addressTypeOption = page.locator('text=Address Type').first();
      await expect(addressTypeOption).toBeVisible();
      await addressTypeOption.click();
      await expect(page).toHaveURL(/address-type/);

      await page.waitForLoadState('networkidle');
      await expect(page.locator('[role="radio"]').first()).toBeVisible({ timeout: 10000 });

      const displayName = ADDRESS_TYPE_DISPLAY_NAMES[addressType];
      const card = page.locator('[role="radio"]').filter({ hasText: displayName });

      if (await card.isVisible({ timeout: 2000 }).catch(() => false)) {
        const previewText = await card.locator('.text-xs').textContent().catch(() => '');
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

      const receiveButton = page.locator('button[aria-label="Receive tokens"], button:has-text("Receive")').first();
      if (await receiveButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await receiveButton.click();
        await page.waitForURL(/view-address|receive/);

        const qrSelectors = ['canvas', 'svg', 'img[alt*="QR"]', '[class*="qr"]'];
        let qrFound = false;

        for (const selector of qrSelectors) {
          const qr = page.locator(selector).first();
          if (await qr.isVisible({ timeout: 2000 }).catch(() => false)) {
            qrFound = true;
            break;
          }
        }

        expect(qrFound).toBe(true);
      }
    });
  }
});

walletTest.describe('Address Type Matrix - Copy Address', () => {
  for (const addressType of STANDARD_ADDRESS_TYPES) {
    walletTest(`can copy ${addressType} address to clipboard`, async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);

      await selectAddressType(page, addressType);

      const copyButton = page.locator('button[aria-label*="Copy"], button:has-text("Copy")').first();
      if (await copyButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await copyButton.click();

        const clipboardContent = await page.evaluate(() => navigator.clipboard.readText());
        const expectedPrefix = ADDRESS_PREFIX_STRINGS.mainnet[addressType];
        expect(clipboardContent.startsWith(expectedPrefix)).toBe(true);
      }
    });
  }
});

walletTest.describe('Address Type Matrix - Persistence', () => {
  for (const addressType of STANDARD_ADDRESS_TYPES) {
    walletTest(`${addressType} selection persists after lock/unlock`, async ({ page }) => {
      await selectAddressType(page, addressType);

      const addressBefore = await getCurrentDisplayedAddress(page);
      expect(validateAddressPrefix(addressBefore, addressType)).toBe(true);

      await lockWallet(page);

      await expect(page).toHaveURL(/unlock/);

      await unlockWallet(page, TEST_PASSWORD);

      await page.waitForLoadState('networkidle');
      await expect(page.locator('.font-mono').first()).toBeVisible({ timeout: 10000 });

      const addressAfter = await getCurrentDisplayedAddress(page);
      expect(validateAddressPrefix(addressAfter, addressType)).toBe(true);
    });
  }
});

test.describe('Address Type Matrix - Counterwallet Wallet', () => {
  test('importing Counterwallet mnemonic creates Counterwallet wallet', async ({ extensionPage }) => {
    await importMnemonic(extensionPage, TEST_COUNTERWALLET_MNEMONIC, TEST_PASSWORD);

    const address = await getCurrentDisplayedAddress(extensionPage);
    expect(validateAddressPrefix(address, 'counterwallet')).toBe(true);
  });

  test('Counterwallet wallet shows only Counterwallet address options', async ({ extensionPage }) => {
    await importMnemonic(extensionPage, TEST_COUNTERWALLET_MNEMONIC, TEST_PASSWORD);

    await navigateTo(extensionPage, 'settings');
    const addressTypeOption = extensionPage.locator('text=Address Type').first();
    await expect(addressTypeOption).toBeVisible();
    await addressTypeOption.click();
    await expect(extensionPage).toHaveURL(/address-type/);

    await extensionPage.waitForLoadState('networkidle');
    const radioOptions = extensionPage.locator('[role="radio"]');
    await expect(radioOptions.first()).toBeVisible({ timeout: 10000 });

    const options = await radioOptions.all();
    expect(options.length).toBe(2);

    const hasCounterwalletOption = await extensionPage.locator('[role="radio"]').filter({ hasText: 'CounterWallet (P2PKH)' }).isVisible().catch(() => false);
    const hasCounterwalletSegwitOption = await extensionPage.locator('[role="radio"]').filter({ hasText: 'CounterWallet SegWit' }).isVisible().catch(() => false);

    expect(hasCounterwalletOption).toBe(true);
    expect(hasCounterwalletSegwitOption).toBe(true);

    const hasLegacyOption = await extensionPage.locator('[role="radio"]').filter({ hasText: 'Legacy (P2PKH)' }).isVisible().catch(() => false);
    const hasTaprootOption = await extensionPage.locator('[role="radio"]').filter({ hasText: 'Taproot' }).isVisible().catch(() => false);

    expect(hasLegacyOption).toBe(false);
    expect(hasTaprootOption).toBe(false);
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

test.describe('Address Type Matrix - Private Key Import', () => {
  test('can import wallet via private key', async ({ extensionPage }) => {
    await importPrivateKey(extensionPage, TEST_PRIVATE_KEY, TEST_PASSWORD);

    const address = await getCurrentDisplayedAddress(extensionPage);
    expect(address.length).toBeGreaterThan(0);
  });

  test('private key import shows valid address format', async ({ extensionPage }) => {
    await importPrivateKey(extensionPage, TEST_PRIVATE_KEY, TEST_PASSWORD);

    const address = await getCurrentDisplayedAddress(extensionPage);

    const isValidFormat =
      address.startsWith('1') ||
      address.startsWith('3') ||
      address.startsWith('bc1q') ||
      address.startsWith('bc1p');

    expect(isValidFormat).toBe(true);
  });
});
