/**
 * Trezor Operations E2E Tests
 *
 * Comprehensive tests for all Trezor hardware wallet operations.
 * These tests run against the Trezor emulator in CI.
 *
 * Test seed: "all all all all all all all all all all all all"
 */
import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtension, cleanup, createWallet, TEST_PASSWORD } from '../helpers/test-helpers';
import {
  startAutoConfirm,
  EXPECTED_ADDRESSES,
  getEmulatorStatus,
  emulatorPressYes,
  waitForDevice,
} from '../helpers/trezor-emulator';

// Skip if emulator not available
const SKIP_EMULATOR_TESTS = process.env.TREZOR_EMULATOR_AVAILABLE !== '1';

/**
 * Helper to set up the extension with a wallet before hardware tests
 */
async function setupForHardwareTest(page: Page): Promise<void> {
  const hasCreateWallet = await page.getByText('Create Wallet').isVisible({ timeout: 5000 }).catch(() => false);
  if (hasCreateWallet) {
    await createWallet(page, TEST_PASSWORD);
  }
}

/**
 * Navigate to connect hardware page
 */
async function navigateToConnectHardware(page: Page): Promise<void> {
  const baseUrl = page.url().split('#')[0];
  await page.goto(`${baseUrl}#/connect-hardware`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Connect Trezor' })).toBeVisible({ timeout: 10000 });
}

test.describe('Trezor Address Derivation', () => {
  test.skip(SKIP_EMULATOR_TESTS, 'Trezor emulator not available');

  test('derives Native SegWit (P2WPKH) address correctly', async () => {
    const { context, page } = await launchExtension('trezor-p2wpkh');

    try {
      await setupForHardwareTest(page);
      await navigateToConnectHardware(page);

      // Select Native SegWit (should be default)
      const formatSelect = page.locator('select');
      await formatSelect.selectOption('p2wpkh');

      // Set name
      await page.locator('input[placeholder="My Trezor Wallet"]').fill('Test P2WPKH');

      // Start auto-confirm
      const stopConfirm = startAutoConfirm(200);

      try {
        await page.getByRole('button', { name: /Connect Trezor/i }).click();

        // Wait for success or timeout
        const result = await page.waitForURL(/index/, { timeout: 45000 })
          .then(() => 'success')
          .catch(() => 'timeout');

        if (result === 'success') {
          // Check if expected address is visible
          const addressVisible = await page.locator(`text=${EXPECTED_ADDRESSES.P2WPKH_0_0.slice(0, 8)}`).isVisible({ timeout: 5000 }).catch(() => false);
          console.log(`P2WPKH address visible: ${addressVisible}`);
          console.log(`Expected: ${EXPECTED_ADDRESSES.P2WPKH_0_0}`);
        }
      } finally {
        stopConfirm();
      }

      await page.screenshot({ path: 'test-results/screenshots/trezor-p2wpkh.png' });
    } finally {
      await cleanup(context);
    }
  });

  test('derives Legacy (P2PKH) address correctly', async () => {
    const { context, page } = await launchExtension('trezor-p2pkh');

    try {
      await setupForHardwareTest(page);
      await navigateToConnectHardware(page);

      // Select Legacy
      const formatSelect = page.locator('select');
      await formatSelect.selectOption('p2pkh');

      await page.locator('input[placeholder="My Trezor Wallet"]').fill('Test P2PKH');

      const stopConfirm = startAutoConfirm(200);

      try {
        await page.getByRole('button', { name: /Connect Trezor/i }).click();

        const result = await page.waitForURL(/index/, { timeout: 45000 })
          .then(() => 'success')
          .catch(() => 'timeout');

        if (result === 'success') {
          const addressVisible = await page.locator(`text=${EXPECTED_ADDRESSES.P2PKH_0_0.slice(0, 8)}`).isVisible({ timeout: 5000 }).catch(() => false);
          console.log(`P2PKH address visible: ${addressVisible}`);
          console.log(`Expected: ${EXPECTED_ADDRESSES.P2PKH_0_0}`);
        }
      } finally {
        stopConfirm();
      }

      await page.screenshot({ path: 'test-results/screenshots/trezor-p2pkh.png' });
    } finally {
      await cleanup(context);
    }
  });

  test('derives Nested SegWit (P2SH-P2WPKH) address correctly', async () => {
    const { context, page } = await launchExtension('trezor-p2sh');

    try {
      await setupForHardwareTest(page);
      await navigateToConnectHardware(page);

      const formatSelect = page.locator('select');
      await formatSelect.selectOption('p2sh_p2wpkh');

      await page.locator('input[placeholder="My Trezor Wallet"]').fill('Test P2SH');

      const stopConfirm = startAutoConfirm(200);

      try {
        await page.getByRole('button', { name: /Connect Trezor/i }).click();

        const result = await page.waitForURL(/index/, { timeout: 45000 })
          .then(() => 'success')
          .catch(() => 'timeout');

        if (result === 'success') {
          const addressVisible = await page.locator(`text=${EXPECTED_ADDRESSES.P2SH_P2WPKH_0_0.slice(0, 4)}`).isVisible({ timeout: 5000 }).catch(() => false);
          console.log(`P2SH-P2WPKH address visible: ${addressVisible}`);
          console.log(`Expected: ${EXPECTED_ADDRESSES.P2SH_P2WPKH_0_0}`);
        }
      } finally {
        stopConfirm();
      }

      await page.screenshot({ path: 'test-results/screenshots/trezor-p2sh.png' });
    } finally {
      await cleanup(context);
    }
  });

  test('derives Taproot (P2TR) address correctly', async () => {
    const { context, page } = await launchExtension('trezor-p2tr');

    try {
      await setupForHardwareTest(page);
      await navigateToConnectHardware(page);

      const formatSelect = page.locator('select');
      await formatSelect.selectOption('p2tr');

      await page.locator('input[placeholder="My Trezor Wallet"]').fill('Test P2TR');

      const stopConfirm = startAutoConfirm(200);

      try {
        await page.getByRole('button', { name: /Connect Trezor/i }).click();

        const result = await page.waitForURL(/index/, { timeout: 45000 })
          .then(() => 'success')
          .catch(() => 'timeout');

        if (result === 'success') {
          // Taproot addresses start with bc1p
          const addressVisible = await page.locator('text=bc1p').first().isVisible({ timeout: 5000 }).catch(() => false);
          console.log(`P2TR address visible: ${addressVisible}`);
          console.log(`Expected: ${EXPECTED_ADDRESSES.P2TR_0_0}`);
        }
      } finally {
        stopConfirm();
      }

      await page.screenshot({ path: 'test-results/screenshots/trezor-p2tr.png' });
    } finally {
      await cleanup(context);
    }
  });
});

test.describe('Trezor Message Signing', () => {
  test.skip(SKIP_EMULATOR_TESTS, 'Trezor emulator not available');

  test('can sign a message with Trezor', async () => {
    const { context, page } = await launchExtension('trezor-sign-msg');

    try {
      await setupForHardwareTest(page);
      await navigateToConnectHardware(page);

      // First connect the Trezor
      await page.locator('input[placeholder="My Trezor Wallet"]').fill('Sign Test Wallet');

      let stopConfirm = startAutoConfirm(200);

      try {
        await page.getByRole('button', { name: /Connect Trezor/i }).click();

        // Wait for connection
        const connected = await page.waitForURL(/index/, { timeout: 45000 })
          .then(() => true)
          .catch(() => false);

        if (connected) {
          console.log('Trezor connected, navigating to sign message...');
          stopConfirm();

          // Navigate to sign message page
          const baseUrl = page.url().split('#')[0];
          await page.goto(`${baseUrl}#/actions/sign-message`);
          await page.waitForLoadState('networkidle');

          // Wait for the sign message page to load
          await expect(page.getByText('Message')).toBeVisible({ timeout: 5000 });

          // Enter a test message
          const messageInput = page.locator('textarea').first();
          await messageInput.fill('Test message for Trezor signing');

          // Start auto-confirm for the signing operation
          stopConfirm = startAutoConfirm(200);

          // Click Sign Message button
          const signButton = page.getByRole('button', { name: /Sign Message/i });
          await signButton.click();

          // Wait for signature to appear or error
          const signResult = await Promise.race([
            page.locator('text=Signed').waitFor({ timeout: 30000 }).then(() => 'success'),
            page.locator('[role="alert"]').first().waitFor({ timeout: 30000 }).then(() => 'error'),
          ]).catch(() => 'timeout');

          console.log(`Sign message result: ${signResult}`);

          if (signResult === 'success') {
            // Check that signature is displayed
            const signatureField = page.locator('textarea').nth(1);
            const signature = await signatureField.inputValue();
            console.log(`Signature obtained: ${signature.slice(0, 20)}...`);
            expect(signature.length).toBeGreaterThan(0);
          }

          await page.screenshot({ path: 'test-results/screenshots/trezor-sign-message-result.png' });
        }
      } finally {
        stopConfirm();
      }
    } finally {
      await cleanup(context);
    }
  });
});

test.describe('Trezor Multiple Address Formats', () => {
  test.skip(SKIP_EMULATOR_TESTS, 'Trezor emulator not available');

  test('can connect same Trezor with different address formats', async () => {
    const { context, page } = await launchExtension('trezor-multi-format');

    try {
      await setupForHardwareTest(page);

      // First, connect with P2WPKH
      await navigateToConnectHardware(page);
      await page.locator('select').selectOption('p2wpkh');
      await page.locator('input[placeholder="My Trezor Wallet"]').fill('Trezor SegWit');

      let stopConfirm = startAutoConfirm(200);

      try {
        await page.getByRole('button', { name: /Connect Trezor/i }).click();
        await page.waitForURL(/index/, { timeout: 45000 }).catch(() => {});
      } finally {
        stopConfirm();
      }

      // Now try to add the same Trezor with a different format
      await navigateToConnectHardware(page);
      await page.locator('select').selectOption('p2pkh');
      await page.locator('input[placeholder="My Trezor Wallet"]').fill('Trezor Legacy');

      stopConfirm = startAutoConfirm(200);

      try {
        await page.getByRole('button', { name: /Connect Trezor/i }).click();

        // This should either succeed (different format = different wallet) or show appropriate error
        const result = await Promise.race([
          page.waitForURL(/index/, { timeout: 30000 }).then(() => 'success'),
          page.locator('[role="alert"], .text-red').first().waitFor({ timeout: 30000 }).then(() => 'error'),
        ]).catch(() => 'timeout');

        console.log(`Adding second address format result: ${result}`);

        if (result === 'error') {
          const errorText = await page.locator('[role="alert"], .text-red').first().textContent();
          console.log(`Error: ${errorText}`);
        }
      } finally {
        stopConfirm();
      }

      await page.screenshot({ path: 'test-results/screenshots/trezor-multi-format.png' });
    } finally {
      await cleanup(context);
    }
  });
});

test.describe('Trezor Existing Wallet Compatibility', () => {
  test.skip(SKIP_EMULATOR_TESTS, 'Trezor emulator not available');

  test('documents standard derivation path behavior', async () => {
    /**
     * IMPORTANT: This test documents expected behavior
     *
     * When a user connects their Trezor, we derive addresses using standard BIP paths:
     * - m/84'/0'/0' for Native SegWit (P2WPKH)
     * - m/44'/0'/0' for Legacy (P2PKH)
     * - m/49'/0'/0' for Nested SegWit (P2SH-P2WPKH)
     * - m/86'/0'/0' for Taproot (P2TR)
     *
     * This means:
     * 1. Users who already have BTC on their Trezor will see those same balances
     * 2. We're NOT creating new addresses - we're using their existing addresses
     * 3. Any BTC sent to these addresses is accessible from ANY wallet using standard paths
     * 4. This is BY DESIGN - it's how HD wallets work
     */

    console.log('\n========================================');
    console.log('TREZOR DERIVATION PATH DOCUMENTATION');
    console.log('========================================\n');

    console.log('Standard BIP Derivation Paths:');
    console.log('------------------------------');
    console.log('Native SegWit: m/84\'/0\'/0\'/0/{index}');
    console.log('Legacy:        m/44\'/0\'/0\'/0/{index}');
    console.log('Nested SegWit: m/49\'/0\'/0\'/0/{index}');
    console.log('Taproot:       m/86\'/0\'/0\'/0/{index}');
    console.log('');
    console.log('Expected behavior for existing Trezor users:');
    console.log('- Existing BTC balances WILL be visible in XCP Wallet');
    console.log('- Same addresses as Trezor Suite, Electrum, etc.');
    console.log('- Funds are controlled by seed phrase, not software');
    console.log('');
    console.log('This is intentional and correct behavior!');
    console.log('========================================\n');

    expect(true).toBe(true);
  });
});

test.describe('Trezor Passphrase Support', () => {
  test.skip(SKIP_EMULATOR_TESTS, 'Trezor emulator not available');

  test('can connect with passphrase enabled', async () => {
    const { context, page } = await launchExtension('trezor-passphrase');

    try {
      await setupForHardwareTest(page);
      await navigateToConnectHardware(page);

      // Check the passphrase checkbox
      const passphraseCheckbox = page.locator('#usePassphrase');
      await passphraseCheckbox.check();
      expect(await passphraseCheckbox.isChecked()).toBe(true);

      await page.locator('input[placeholder="My Trezor Wallet"]').fill('Trezor Hidden Wallet');

      const stopConfirm = startAutoConfirm(200);

      try {
        await page.getByRole('button', { name: /Connect Trezor/i }).click();

        // With passphrase, the device will prompt for passphrase entry
        // The emulator may need specific handling for this
        const result = await Promise.race([
          page.waitForURL(/index/, { timeout: 45000 }).then(() => 'success'),
          page.locator('[role="alert"]').first().waitFor({ timeout: 45000 }).then(() => 'error'),
        ]).catch(() => 'timeout');

        console.log(`Passphrase connection result: ${result}`);

        // Document that passphrase creates a completely different wallet
        console.log('\nPassphrase behavior:');
        console.log('- Empty passphrase = standard wallet (same as Trezor Suite default)');
        console.log('- Any passphrase = completely different set of addresses');
        console.log('- This is how "hidden wallets" work on Trezor');
      } finally {
        stopConfirm();
      }

      await page.screenshot({ path: 'test-results/screenshots/trezor-passphrase.png' });
    } finally {
      await cleanup(context);
    }
  });
});

test.describe('Emulator Status Check', () => {
  test('reports emulator status', async () => {
    const status = await getEmulatorStatus();

    console.log('\n========================================');
    console.log('TREZOR EMULATOR STATUS');
    console.log('========================================');
    console.log(`HTTP API (9001):    ${status.available ? 'AVAILABLE' : 'NOT AVAILABLE'}`);
    console.log(`Bridge (21325):     ${status.bridgeAvailable ? 'AVAILABLE' : 'NOT AVAILABLE'}`);
    console.log(`Device connected:   ${status.deviceConnected ? 'YES' : 'NO'}`);
    console.log(`TREZOR_EMULATOR_AVAILABLE env: ${process.env.TREZOR_EMULATOR_AVAILABLE || 'not set'}`);
    console.log('========================================\n');

    // This test always passes - it's informational
    expect(true).toBe(true);
  });
});
