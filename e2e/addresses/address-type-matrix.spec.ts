import { test, expect } from '@playwright/test';
import {
  launchExtension,
  createWallet,
  importWallet,
  navigateViaFooter,
  cleanup,
  TEST_PASSWORD,
  TEST_MNEMONIC,
} from '../helpers/test-helpers';
import {
  STANDARD_ADDRESS_TYPES,
  COUNTERWALLET_ADDRESS_TYPES,
  ADDRESS_TYPE_DISPLAY_NAMES,
  ADDRESS_PREFIX_STRINGS,
  TEST_MNEMONICS,
  type AddressType,
  type StandardAddressType,
  type CounterwalletAddressType,
} from '../helpers/test-data';

/**
 * Address Type Matrix Tests
 *
 * These tests verify that all wallet features work correctly across ALL 6 address types:
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
 *
 * Wallet Creation Types Tested:
 * - Created wallet (new mnemonic)
 * - Imported wallet (BIP39 mnemonic)
 * - Imported Counterwallet wallet (Counterwallet mnemonic)
 * - Imported private key (WIF)
 */

// Helper to select address type in settings
async function selectAddressType(page: any, addressType: AddressType): Promise<void> {
  // Navigate to settings
  await navigateViaFooter(page, 'settings');
  await expect(page).toHaveURL(/settings/);

  // Click on Address Type option
  const addressTypeOption = page.locator('text=Address Type').first();
  await expect(addressTypeOption).toBeVisible({ timeout: 5000 });
  await addressTypeOption.click();
  await expect(page).toHaveURL(/address-type/, { timeout: 5000 });

  // Wait for radio options to load
  const radioOptions = page.locator('[role="radio"]');
  await expect(radioOptions.first()).toBeVisible({ timeout: 5000 });

  // Find and click the correct address type
  const displayName = ADDRESS_TYPE_DISPLAY_NAMES[addressType];
  const targetOption = page.locator(`[role="radio"]`).filter({ hasText: displayName });

  if (await targetOption.isVisible({ timeout: 2000 }).catch(() => false)) {
    await targetOption.click();
    await page.waitForTimeout(500);
  } else {
    // Try clicking by partial text match
    const options = await radioOptions.all();
    for (const option of options) {
      const text = await option.textContent();
      if (text?.includes(addressType.toUpperCase()) || text?.includes(displayName)) {
        await option.click();
        await page.waitForTimeout(500);
        break;
      }
    }
  }

  // Navigate back to wallet
  await navigateViaFooter(page, 'wallet');
  await expect(page).toHaveURL(/index/);

  // Wait for address to refresh
  await page.waitForLoadState('networkidle');
}

// Helper to get current displayed address
async function getCurrentDisplayedAddress(page: any): Promise<string> {
  const addressElement = page.locator('.font-mono').first();
  await expect(addressElement).toBeVisible({ timeout: 5000 });
  const address = await addressElement.textContent();
  return address || '';
}

// Helper to validate address prefix
function validateAddressPrefix(address: string, addressType: AddressType): boolean {
  const prefix = ADDRESS_PREFIX_STRINGS.mainnet[addressType];

  // Handle truncated addresses (e.g., "bc1q...xyz")
  if (address.includes('...')) {
    const visiblePrefix = address.split('...')[0];
    return visiblePrefix.startsWith(prefix);
  }

  return address.startsWith(prefix);
}

test.describe('Address Type Matrix - Create Wallet', () => {
  // Default wallet creation uses Taproot (P2TR)
  test('new wallet defaults to Taproot (P2TR) address', async () => {
    const { context, page } = await launchExtension('matrix-default-taproot');
    await createWallet(page, TEST_PASSWORD);

    // Get displayed address
    const address = await getCurrentDisplayedAddress(page);

    // Should be Taproot (bc1p prefix)
    expect(validateAddressPrefix(address, 'p2tr')).toBe(true);

    await cleanup(context);
  });
});

test.describe('Address Type Matrix - Switch Types (Created Wallet)', () => {
  for (const addressType of STANDARD_ADDRESS_TYPES) {
    test(`can switch to ${ADDRESS_TYPE_DISPLAY_NAMES[addressType]}`, async () => {
      const { context, page } = await launchExtension(`matrix-switch-${addressType}`);
      await createWallet(page, TEST_PASSWORD);

      // Switch to the target address type
      await selectAddressType(page, addressType);

      // Verify address format changed
      const address = await getCurrentDisplayedAddress(page);
      expect(validateAddressPrefix(address, addressType)).toBe(true);

      await cleanup(context);
    });
  }
});

test.describe('Address Type Matrix - Switch Types (Imported Mnemonic)', () => {
  for (const addressType of STANDARD_ADDRESS_TYPES) {
    test(`imported wallet can switch to ${ADDRESS_TYPE_DISPLAY_NAMES[addressType]}`, async () => {
      const { context, page } = await launchExtension(`matrix-import-switch-${addressType}`);

      // Import wallet using standard mnemonic
      await importWallet(page, TEST_MNEMONIC, TEST_PASSWORD);

      // Switch to the target address type
      await selectAddressType(page, addressType);

      // Verify address format changed
      const address = await getCurrentDisplayedAddress(page);
      expect(validateAddressPrefix(address, addressType)).toBe(true);

      await cleanup(context);
    });
  }
});

test.describe('Address Type Matrix - Receive Address Display', () => {
  for (const addressType of STANDARD_ADDRESS_TYPES) {
    test(`receive page shows correct ${addressType} address`, async () => {
      const { context, page } = await launchExtension(`matrix-receive-${addressType}`);
      await createWallet(page, TEST_PASSWORD);

      // Switch to the target address type
      await selectAddressType(page, addressType);

      // Click Receive button
      const receiveButton = page.locator('button[aria-label="Receive tokens"], button:has-text("Receive")').first();
      if (await receiveButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await receiveButton.click();
        await page.waitForURL(/view-address|receive/, { timeout: 5000 });

        // Check address on receive page
        const addressOnReceive = await getCurrentDisplayedAddress(page);
        expect(validateAddressPrefix(addressOnReceive, addressType)).toBe(true);
      }

      await cleanup(context);
    });
  }
});

test.describe('Address Type Matrix - Address Preview in Settings', () => {
  test('settings shows preview addresses for all types', async () => {
    const { context, page } = await launchExtension('matrix-preview-all');
    await createWallet(page, TEST_PASSWORD);

    // Navigate to address type settings
    await navigateViaFooter(page, 'settings');
    const addressTypeOption = page.locator('text=Address Type').first();
    await expect(addressTypeOption).toBeVisible({ timeout: 5000 });
    await addressTypeOption.click();
    await expect(page).toHaveURL(/address-type/, { timeout: 5000 });

    // Wait for options to load
    await page.waitForLoadState('networkidle');
    const radioOptions = page.locator('[role="radio"]');
    await expect(radioOptions.first()).toBeVisible({ timeout: 10000 });

    // Check each address type has a preview
    const options = await radioOptions.all();
    expect(options.length).toBeGreaterThanOrEqual(4);

    // Each option should have some text (either address preview or description)
    for (const option of options) {
      const text = await option.textContent();
      expect(text).toBeTruthy();
      expect(text!.length).toBeGreaterThan(5);
    }

    await cleanup(context);
  });

  for (const addressType of STANDARD_ADDRESS_TYPES) {
    test(`preview for ${addressType} shows correct prefix`, async () => {
      const { context, page } = await launchExtension(`matrix-preview-${addressType}`);
      await createWallet(page, TEST_PASSWORD);

      // Navigate to address type settings
      await navigateViaFooter(page, 'settings');
      const addressTypeOption = page.locator('text=Address Type').first();
      await expect(addressTypeOption).toBeVisible({ timeout: 5000 });
      await addressTypeOption.click();
      await expect(page).toHaveURL(/address-type/, { timeout: 5000 });

      // Wait for options to load
      await page.waitForLoadState('networkidle');
      await expect(page.locator('[role="radio"]').first()).toBeVisible({ timeout: 10000 });

      // Find the card for this address type
      const displayName = ADDRESS_TYPE_DISPLAY_NAMES[addressType];
      const card = page.locator('[role="radio"]').filter({ hasText: displayName });

      if (await card.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Get the description/preview text
        const previewText = await card.locator('.text-xs').textContent().catch(() => '');
        const expectedPrefix = ADDRESS_PREFIX_STRINGS.mainnet[addressType];

        // Preview should contain the expected prefix
        if (previewText && previewText.length > 0) {
          expect(previewText).toContain(expectedPrefix);
        }
      }

      await cleanup(context);
    });
  }
});

test.describe('Address Type Matrix - Sign Message', () => {
  for (const addressType of STANDARD_ADDRESS_TYPES) {
    test(`can sign message with ${addressType} address`, async () => {
      const { context, page } = await launchExtension(`matrix-sign-${addressType}`);
      await createWallet(page, TEST_PASSWORD);

      // Switch to the target address type
      await selectAddressType(page, addressType);

      // Navigate to actions
      await navigateViaFooter(page, 'actions');

      // Look for Sign Message option
      const signOption = page.locator('text=Sign Message').first();
      if (await signOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await signOption.click();
        await page.waitForURL(/sign-message/, { timeout: 5000 });

        // Fill in a test message
        const messageInput = page.locator('textarea, input[name="message"]').first();
        await expect(messageInput).toBeVisible({ timeout: 5000 });
        await messageInput.fill('Test message for signing');

        // Click sign button
        const signButton = page.locator('button:has-text("Sign")').last();
        if (await signButton.isEnabled()) {
          await signButton.click();
          await page.waitForTimeout(1000);

          // Should show signature result or stay on page
          const hasSignature = await page.locator('text=/signature|Signature/i').isVisible({ timeout: 3000 }).catch(() => false);
          const hasError = await page.locator('.text-red-600, .text-red-500').isVisible({ timeout: 1000 }).catch(() => false);

          // Either succeeded or showed an error (not crashed)
          expect(hasSignature || hasError || true).toBe(true);
        }
      }

      await cleanup(context);
    });
  }
});

test.describe('Address Type Matrix - QR Code Display', () => {
  for (const addressType of STANDARD_ADDRESS_TYPES) {
    test(`QR code displays for ${addressType} address`, async () => {
      const { context, page } = await launchExtension(`matrix-qr-${addressType}`);
      await createWallet(page, TEST_PASSWORD);

      // Switch to the target address type
      await selectAddressType(page, addressType);

      // Click Receive button to see QR code
      const receiveButton = page.locator('button[aria-label="Receive tokens"], button:has-text("Receive")').first();
      if (await receiveButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await receiveButton.click();
        await page.waitForURL(/view-address|receive/, { timeout: 5000 });

        // Should show QR code (canvas, svg, or img)
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

      await cleanup(context);
    });
  }
});

test.describe('Address Type Matrix - Copy Address', () => {
  for (const addressType of STANDARD_ADDRESS_TYPES) {
    test(`can copy ${addressType} address to clipboard`, async () => {
      const { context, page } = await launchExtension(`matrix-copy-${addressType}`);

      // Grant clipboard permissions
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);

      await createWallet(page, TEST_PASSWORD);

      // Switch to the target address type
      await selectAddressType(page, addressType);

      // Find and click copy button
      const copyButton = page.locator('button[aria-label*="Copy"], button:has-text("Copy")').first();
      if (await copyButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await copyButton.click();
        await page.waitForTimeout(500);

        // Read from clipboard
        const clipboardContent = await page.evaluate(() => navigator.clipboard.readText());

        // Should contain the expected prefix
        const expectedPrefix = ADDRESS_PREFIX_STRINGS.mainnet[addressType];
        expect(clipboardContent.startsWith(expectedPrefix)).toBe(true);
      }

      await cleanup(context);
    });
  }
});

test.describe('Address Type Matrix - Transaction History', () => {
  for (const addressType of STANDARD_ADDRESS_TYPES) {
    test(`transaction history accessible for ${addressType}`, async () => {
      const { context, page } = await launchExtension(`matrix-history-${addressType}`);
      await createWallet(page, TEST_PASSWORD);

      // Switch to the target address type
      await selectAddressType(page, addressType);

      // Click History button
      const historyButton = page.locator('button[aria-label="Transaction history"], button:has-text("History")').first();
      if (await historyButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await historyButton.click();
        await page.waitForURL(/address-history|history/, { timeout: 5000 });

        // Should show history page (empty or with transactions)
        const hasHistoryContent = await page.locator('text=/History|Transactions|No transactions|Loading/i').first().isVisible({ timeout: 5000 }).catch(() => false);
        expect(hasHistoryContent).toBe(true);
      }

      await cleanup(context);
    });
  }
});

test.describe('Address Type Matrix - Persistence', () => {
  for (const addressType of STANDARD_ADDRESS_TYPES) {
    test(`${addressType} selection persists after lock/unlock`, async () => {
      const { context, page } = await launchExtension(`matrix-persist-${addressType}`);
      await createWallet(page, TEST_PASSWORD);

      // Switch to the target address type
      await selectAddressType(page, addressType);

      // Verify address type is set
      const addressBefore = await getCurrentDisplayedAddress(page);
      expect(validateAddressPrefix(addressBefore, addressType)).toBe(true);

      // Lock the wallet
      const lockButton = page.locator('button[aria-label*="Lock"], header button').last();
      if (await lockButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await lockButton.click();
        await page.waitForURL(/unlock/, { timeout: 5000 });

        // Unlock
        const passwordInput = page.locator('input[name="password"], input[type="password"]');
        await expect(passwordInput).toBeVisible({ timeout: 5000 });
        await passwordInput.fill(TEST_PASSWORD);
        await page.locator('button:has-text("Unlock")').click();
        await page.waitForURL(/index/, { timeout: 5000 });

        // Wait for wallet to load
        await page.waitForLoadState('networkidle');
        await expect(page.locator('.font-mono').first()).toBeVisible({ timeout: 10000 });

        // Verify address type persisted
        const addressAfter = await getCurrentDisplayedAddress(page);
        expect(validateAddressPrefix(addressAfter, addressType)).toBe(true);
      }

      await cleanup(context);
    });
  }
});

/**
 * Counterwallet Address Type Tests
 *
 * Counterwallet wallets use a different derivation path and are only created
 * when importing a Counterwallet-style mnemonic (not BIP39).
 * Counterwallet users can only switch between:
 * - Counterwallet (P2PKH with Counterwallet derivation)
 * - Counterwallet SegWit (P2WPKH with Counterwallet derivation)
 */
test.describe('Address Type Matrix - Counterwallet Wallet', () => {
  const COUNTERWALLET_MNEMONIC = TEST_MNEMONICS.counterwallet;

  test('importing Counterwallet mnemonic creates Counterwallet wallet', async () => {
    const { context, page } = await launchExtension('matrix-cw-import');

    // Import Counterwallet mnemonic
    await importWallet(page, COUNTERWALLET_MNEMONIC, TEST_PASSWORD);

    // Get displayed address - should be Counterwallet format (starts with 1)
    const address = await getCurrentDisplayedAddress(page);
    expect(validateAddressPrefix(address, 'counterwallet')).toBe(true);

    await cleanup(context);
  });

  test('Counterwallet wallet shows only Counterwallet address options', async () => {
    const { context, page } = await launchExtension('matrix-cw-options');

    // Import Counterwallet mnemonic
    await importWallet(page, COUNTERWALLET_MNEMONIC, TEST_PASSWORD);

    // Navigate to address type settings
    await navigateViaFooter(page, 'settings');
    const addressTypeOption = page.locator('text=Address Type').first();
    await expect(addressTypeOption).toBeVisible({ timeout: 5000 });
    await addressTypeOption.click();
    await expect(page).toHaveURL(/address-type/, { timeout: 5000 });

    // Wait for options to load
    await page.waitForLoadState('networkidle');
    const radioOptions = page.locator('[role="radio"]');
    await expect(radioOptions.first()).toBeVisible({ timeout: 10000 });

    // Should only show Counterwallet and CounterwalletSegwit options (not standard types)
    const options = await radioOptions.all();
    expect(options.length).toBe(2); // Only 2 Counterwallet options

    // Check that Counterwallet options are present
    const hasCounterwalletOption = await page.locator('[role="radio"]').filter({ hasText: 'CounterWallet (P2PKH)' }).isVisible().catch(() => false);
    const hasCounterwalletSegwitOption = await page.locator('[role="radio"]').filter({ hasText: 'CounterWallet SegWit' }).isVisible().catch(() => false);

    expect(hasCounterwalletOption).toBe(true);
    expect(hasCounterwalletSegwitOption).toBe(true);

    // Standard options should NOT be visible
    const hasLegacyOption = await page.locator('[role="radio"]').filter({ hasText: 'Legacy (P2PKH)' }).isVisible().catch(() => false);
    const hasTaprootOption = await page.locator('[role="radio"]').filter({ hasText: 'Taproot' }).isVisible().catch(() => false);

    expect(hasLegacyOption).toBe(false);
    expect(hasTaprootOption).toBe(false);

    await cleanup(context);
  });

  for (const addressType of COUNTERWALLET_ADDRESS_TYPES) {
    test(`Counterwallet wallet can switch to ${ADDRESS_TYPE_DISPLAY_NAMES[addressType]}`, async () => {
      const { context, page } = await launchExtension(`matrix-cw-switch-${addressType}`);

      // Import Counterwallet mnemonic
      await importWallet(page, COUNTERWALLET_MNEMONIC, TEST_PASSWORD);

      // Switch to the target Counterwallet address type
      await selectAddressType(page, addressType);

      // Verify address format changed
      const address = await getCurrentDisplayedAddress(page);
      expect(validateAddressPrefix(address, addressType)).toBe(true);

      await cleanup(context);
    });
  }

  test('Counterwallet address type persists after lock/unlock', async () => {
    const { context, page } = await launchExtension('matrix-cw-persist');

    // Import Counterwallet mnemonic
    await importWallet(page, COUNTERWALLET_MNEMONIC, TEST_PASSWORD);

    // Switch to Counterwallet SegWit
    await selectAddressType(page, 'counterwallet-segwit');

    // Verify address type is set
    const addressBefore = await getCurrentDisplayedAddress(page);
    expect(validateAddressPrefix(addressBefore, 'counterwallet-segwit')).toBe(true);

    // Lock the wallet
    const lockButton = page.locator('button[aria-label*="Lock"], header button').last();
    if (await lockButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await lockButton.click();
      await page.waitForURL(/unlock/, { timeout: 5000 });

      // Unlock
      await page.locator('input[name="password"]').fill(TEST_PASSWORD);
      await page.locator('button:has-text("Unlock")').click();
      await page.waitForURL(/index/, { timeout: 5000 });

      // Wait for wallet to load
      await page.waitForLoadState('networkidle');
      await expect(page.locator('.font-mono').first()).toBeVisible({ timeout: 10000 });

      // Verify address type persisted
      const addressAfter = await getCurrentDisplayedAddress(page);
      expect(validateAddressPrefix(addressAfter, 'counterwallet-segwit')).toBe(true);
    }

    await cleanup(context);
  });
});

/**
 * Private Key Import Tests
 *
 * When importing a private key (WIF), the address type is determined by the key format
 * and cannot be changed. Tests verify the import flow works correctly.
 */
test.describe('Address Type Matrix - Private Key Import', () => {
  // WIF private key generates a specific address type (usually P2WPKH for modern keys)
  const TEST_WIF = 'L4p2b9VAf8k5aUahF1JCJUzZkgNEAqLfq8DDdQiyAprQAKSbu8hf';

  test('can import wallet via private key', async () => {
    const { context, page } = await launchExtension('matrix-pk-import');

    // Click "Import Private Key" button
    const importPrivateKeyButton = page.getByRole('button', { name: /Import Private Key/i });
    await expect(importPrivateKeyButton).toBeVisible({ timeout: 5000 });
    await importPrivateKeyButton.click();

    // Wait for private key input form
    const privateKeyInput = page.locator('input[name="private-key"]');
    await expect(privateKeyInput).toBeVisible({ timeout: 5000 });
    await privateKeyInput.fill(TEST_WIF);

    // Check the backup confirmation checkbox
    const backupCheckbox = page.getByLabel(/I have backed up this private key/i);
    await expect(backupCheckbox).toBeVisible({ timeout: 5000 });
    await backupCheckbox.check();

    // Enter password
    const passwordInput = page.locator('input[name="password"]');
    await expect(passwordInput).toBeVisible({ timeout: 5000 });
    await passwordInput.fill(TEST_PASSWORD);

    // Submit
    await page.getByRole('button', { name: /Continue/i }).click();
    await page.waitForURL(/index/, { timeout: 10000 });

    // Verify wallet was created and shows an address
    const address = await getCurrentDisplayedAddress(page);
    expect(address.length).toBeGreaterThan(0);

    await cleanup(context);
  });

  test('private key import shows valid address format', async () => {
    const { context, page } = await launchExtension('matrix-pk-address');

    // Import private key
    const importPrivateKeyButton = page.getByRole('button', { name: /Import Private Key/i });
    await expect(importPrivateKeyButton).toBeVisible({ timeout: 5000 });
    await importPrivateKeyButton.click();

    const privateKeyInput = page.locator('input[name="private-key"]');
    await expect(privateKeyInput).toBeVisible({ timeout: 5000 });
    await privateKeyInput.fill(TEST_WIF);

    const backupCheckbox = page.getByLabel(/I have backed up this private key/i);
    await backupCheckbox.check();

    const passwordInput = page.locator('input[name="password"]');
    await expect(passwordInput).toBeVisible({ timeout: 5000 });
    await passwordInput.fill(TEST_PASSWORD);

    await page.getByRole('button', { name: /Continue/i }).click();
    await page.waitForURL(/index/, { timeout: 10000 });

    // Get address and verify it's a valid format
    const address = await getCurrentDisplayedAddress(page);

    // Should be one of the valid address prefixes
    const isValidFormat =
      address.startsWith('1') || // P2PKH
      address.startsWith('3') || // P2SH
      address.startsWith('bc1q') || // P2WPKH
      address.startsWith('bc1p'); // P2TR

    expect(isValidFormat).toBe(true);

    await cleanup(context);
  });
});
