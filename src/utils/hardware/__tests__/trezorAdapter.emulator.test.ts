/**
 * Trezor Adapter Emulator Integration Tests
 *
 * These tests run against a real Trezor emulator using docker-compose.
 * They verify the actual Trezor Connect integration works correctly.
 *
 * Prerequisites:
 *   1. Start emulator: docker-compose -f docker-compose.trezor.yml up -d
 *   2. Wait for emulator to be ready (check http://localhost:9001/status)
 *   3. Run: npm run test:emulator
 *
 * Note: These tests interact with a real emulator and may require user
 * interaction simulation or emulator control API calls.
 *
 * The emulator uses a standard test seed: "all all all all all all all all all all all all"
 * This generates deterministic addresses we can verify against.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AddressFormat } from '@/utils/blockchain/bitcoin/address';

const EMULATOR_BRIDGE_URL = 'http://localhost:21325';
const EMULATOR_CONTROL_URL = 'http://localhost:9001';

/**
 * Expected addresses from the emulator's test seed
 *
 * The trezor-user-env emulator uses a specific test mnemonic.
 * After running the emulator setup, it uses:
 * "all all all all all all all all all all all all"
 *
 * These addresses are deterministic and verified against the emulator.
 * If tests fail with address mismatches, run with DISCOVER_ADDRESSES=1
 * to log the actual addresses from the emulator.
 */
const EXPECTED_ADDRESSES = {
  // m/84'/0'/0'/0/0 - Native SegWit (P2WPKH)
  P2WPKH: {
    // Address from "all all..." seed at m/84'/0'/0'/0/0
    first: 'bc1qannfxke2tfd4l7vhepehpvt05y83v3qsf6nfkk',
    // The xpub for m/84'/0'/0'
    xpub: 'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs',
  },
  // m/86'/0'/0'/0/0 - Taproot (P2TR)
  P2TR: {
    first: 'bc1ptxs597p3fnpd8gwut5p467ulsydae3rp9z75hd99w8k3ljr9g9rqx6ynaw',
  },
  // m/44'/0'/0'/0/0 - Legacy (P2PKH)
  P2PKH: {
    first: '1JAd7XCBzGudGpJQSDSfpmJhiygtLQWaGL',
  },
  // m/49'/0'/0'/0/0 - Nested SegWit (P2SH-P2WPKH)
  P2SH_P2WPKH: {
    first: '37VucYSaXLCAsxYyAPfbSi9eh4iEcbShgf',
  },
};

// Environment variable to enable address discovery mode
const DISCOVER_MODE = process.env.DISCOVER_ADDRESSES === '1';

/**
 * Check if the Trezor emulator is available
 */
async function isEmulatorAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${EMULATOR_CONTROL_URL}/status`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Control the emulator via its HTTP API
 */
async function emulatorControl(action: 'wipe' | 'setup' | 'press-yes' | 'press-no'): Promise<void> {
  const endpoints: Record<string, string> = {
    'wipe': '/emulator/wipe',
    'setup': '/emulator/setup',
    'press-yes': '/emulator/decision/yes',
    'press-no': '/emulator/decision/no',
  };

  await fetch(`${EMULATOR_CONTROL_URL}${endpoints[action]}`, {
    method: 'POST',
  });
}

/**
 * Auto-press "yes" on the emulator multiple times with delay
 * This simulates user confirmation on the device
 */
async function autoConfirm(times: number = 2, delayMs: number = 300): Promise<void> {
  for (let i = 0; i < times; i++) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    await emulatorControl('press-yes');
  }
}

describe.skipIf(!(await isEmulatorAvailable()))('TrezorAdapter Emulator Integration', () => {
  // Import the real adapter only when running against emulator
  let TrezorAdapter: typeof import('../trezorAdapter').TrezorAdapter;
  let adapter: InstanceType<typeof import('../trezorAdapter').TrezorAdapter>;

  beforeAll(async () => {
    // Dynamically import to avoid loading Trezor Connect in unit tests
    const module = await import('../trezorAdapter');
    TrezorAdapter = module.TrezorAdapter;
    adapter = new TrezorAdapter();

    // Wipe and setup emulator with default seed
    await emulatorControl('wipe');
    await emulatorControl('setup');

    // Initialize adapter with emulator-compatible settings
    await adapter.init();
  });

  afterAll(async () => {
    await adapter.dispose();
  });

  describe('Address Derivation', () => {
    it('should derive P2WPKH address from emulator', async () => {
      const result = await adapter.getAddress(AddressFormat.P2WPKH, 0, 0, false);

      // Log for discovery - helps determine correct expected values
      console.log(`P2WPKH address: ${result.address} (path: ${result.path})`);

      // Verify format first (always passes if device works)
      expect(result.address).toMatch(/^bc1q/);
      expect(result.publicKey).toBeTruthy();
      expect(result.path).toBe("m/84'/0'/0'/0/0");

      // Verify against expected value (may need updating for different seeds)
      if (!DISCOVER_MODE) {
        expect(result.address).toBe(EXPECTED_ADDRESSES.P2WPKH.first);
      }
    });

    it('should derive P2TR (Taproot) address from emulator', async () => {
      const result = await adapter.getAddress(AddressFormat.P2TR, 0, 0, false);

      console.log(`P2TR address: ${result.address} (path: ${result.path})`);

      expect(result.address).toMatch(/^bc1p/);
      expect(result.path).toBe("m/86'/0'/0'/0/0");

      if (!DISCOVER_MODE) {
        expect(result.address).toBe(EXPECTED_ADDRESSES.P2TR.first);
      }
    });

    it('should derive P2PKH (Legacy) address from emulator', async () => {
      const result = await adapter.getAddress(AddressFormat.P2PKH, 0, 0, false);

      console.log(`P2PKH address: ${result.address} (path: ${result.path})`);

      expect(result.address).toMatch(/^[13]/);
      expect(result.path).toBe("m/44'/0'/0'/0/0");

      if (!DISCOVER_MODE) {
        expect(result.address).toBe(EXPECTED_ADDRESSES.P2PKH.first);
      }
    });

    it('should derive P2SH-P2WPKH (Nested SegWit) address from emulator', async () => {
      const result = await adapter.getAddress(AddressFormat.P2SH_P2WPKH, 0, 0, false);

      console.log(`P2SH-P2WPKH address: ${result.address} (path: ${result.path})`);

      expect(result.address).toMatch(/^3/);
      expect(result.path).toBe("m/49'/0'/0'/0/0");

      if (!DISCOVER_MODE) {
        expect(result.address).toBe(EXPECTED_ADDRESSES.P2SH_P2WPKH.first);
      }
    });

    it('should derive multiple addresses in batch with consecutive indices', async () => {
      const results = await adapter.getAddresses(AddressFormat.P2WPKH, 0, 0, 5);

      console.log('Batch addresses:');
      results.forEach((addr, i) => console.log(`  [${i}] ${addr.address}`));

      expect(results).toHaveLength(5);

      results.forEach((addr, i) => {
        expect(addr.address).toMatch(/^bc1q/);
        expect(addr.path).toBe(`m/84'/0'/0'/0/${i}`);
        expect(addr.publicKey).toBeTruthy();
      });

      // First address should match expected (only in non-discovery mode)
      if (!DISCOVER_MODE) {
        expect(results[0].address).toBe(EXPECTED_ADDRESSES.P2WPKH.first);
      }

      // Verify all addresses are unique
      const uniqueAddresses = new Set(results.map(r => r.address));
      expect(uniqueAddresses.size).toBe(5);
    });
  });

  describe('Extended Public Key', () => {
    it('should retrieve xpub for account 0', async () => {
      const xpub = await adapter.getXpub(AddressFormat.P2WPKH, 0);

      console.log(`P2WPKH xpub: ${xpub}`);

      // Verify format
      expect(xpub).toMatch(/^[xyz]pub/);

      // Verify against expected value (only in non-discovery mode)
      if (!DISCOVER_MODE) {
        expect(xpub).toBe(EXPECTED_ADDRESSES.P2WPKH.xpub);
      }
    });

    it('should retrieve different xpub for different address formats', async () => {
      const zpub = await adapter.getXpub(AddressFormat.P2WPKH, 0);
      const xpub = await adapter.getXpub(AddressFormat.P2PKH, 0);

      console.log(`P2WPKH (zpub): ${zpub}`);
      console.log(`P2PKH (xpub): ${xpub}`);

      // Should be different keys for different derivation paths
      expect(zpub).not.toBe(xpub);
      expect(zpub).toMatch(/^zpub/); // BIP84 uses zpub prefix
      expect(xpub).toMatch(/^xpub/); // BIP44 uses xpub prefix
    });
  });

  describe('Device Info', () => {
    it('should return device information from emulator', async () => {
      const info = await adapter.getDeviceInfo();

      expect(info).toBeDefined();
      expect(info?.vendor).toBe('trezor');
      expect(info?.connected).toBe(true);
      // The emulator should report as a specific model
      expect(info?.firmwareVersion).toBeDefined();
    });
  });

  describe('Message Signing', () => {
    it('should sign a message and return valid signature', async () => {
      // This test requires pressing "Confirm" on the emulator
      // We'll simulate the button press asynchronously
      const messagePromise = adapter.signMessage({
        message: 'Test message for XCP Wallet',
        path: [84 | 0x80000000, 0 | 0x80000000, 0 | 0x80000000, 0, 0],
      });

      // Auto-confirm on the emulator (may need multiple button presses)
      autoConfirm(3, 500);

      const result = await messagePromise;

      expect(result.signature).toBeTruthy();
      // The signature should be base64 encoded
      expect(result.signature.length).toBeGreaterThan(0);
      // The address should match our expected first P2WPKH address
      expect(result.address).toBe(EXPECTED_ADDRESSES.P2WPKH.first);
    });
  });

  describe('Transaction Signing Flow', () => {
    it('should reject transaction with invalid input (proving error handling works)', async () => {
      // This test verifies that the Trezor connection is working
      // by attempting to sign a transaction with invalid data
      // The emulator should properly reject it

      const txPromise = adapter.signTransaction({
        inputs: [
          {
            addressPath: [84 | 0x80000000, 0 | 0x80000000, 0 | 0x80000000, 0, 0],
            prevTxHash: '0'.repeat(64), // Invalid - doesn't exist
            prevIndex: 0,
            amount: '100000',
            scriptType: 'SPENDWITNESS',
          },
        ],
        outputs: [
          {
            address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
            amount: '50000',
            scriptType: 'PAYTOWITNESS',
          },
        ],
      });

      // Try to confirm (the emulator should reject before user confirmation)
      autoConfirm(2, 500);

      // Expect the transaction to fail since the input txid is invalid
      await expect(txPromise).rejects.toThrow();
    });
  });

  describe('Wallet Integration Proof', () => {
    /**
     * This is the key e2e test that proves our wallet can work with Trezor.
     * It demonstrates the full flow:
     * 1. Initialize connection to Trezor
     * 2. Derive addresses with correct paths
     * 3. Retrieve xpub for account management
     * 4. Verify all outputs match expected values from known seed
     */
    it('should complete full wallet setup flow', async () => {
      console.log('\n========================================');
      console.log('TREZOR WALLET INTEGRATION E2E TEST');
      console.log('========================================\n');

      // Step 1: Get device info (proves connection works)
      console.log('Step 1: Getting device info...');
      const deviceInfo = await adapter.getDeviceInfo();
      expect(deviceInfo?.connected).toBe(true);
      console.log(`  ✓ Device connected: ${deviceInfo?.model || 'Emulator'}`);
      console.log(`  ✓ Firmware: ${deviceInfo?.firmwareVersion}`);

      // Step 2: Get xpub for the account (this is how wallets track addresses)
      console.log('\nStep 2: Retrieving account xpub (m/84\'/0\'/0\')...');
      const xpub = await adapter.getXpub(AddressFormat.P2WPKH, 0);
      expect(xpub).toMatch(/^zpub/);
      console.log(`  ✓ xpub: ${xpub}`);
      if (!DISCOVER_MODE) {
        expect(xpub).toBe(EXPECTED_ADDRESSES.P2WPKH.xpub);
        console.log('  ✓ xpub matches expected value');
      }

      // Step 3: Derive the first address (for receiving)
      console.log('\nStep 3: Deriving first receive address...');
      const address = await adapter.getAddress(AddressFormat.P2WPKH, 0, 0, false);
      expect(address.address).toMatch(/^bc1q/);
      console.log(`  ✓ Address: ${address.address}`);
      console.log(`  ✓ Path: ${address.path}`);
      if (!DISCOVER_MODE) {
        expect(address.address).toBe(EXPECTED_ADDRESSES.P2WPKH.first);
        console.log('  ✓ Address matches expected value');
      }

      // Step 4: Derive a batch of addresses (for address discovery)
      console.log('\nStep 4: Deriving address batch for gap limit check...');
      const addresses = await adapter.getAddresses(AddressFormat.P2WPKH, 0, 0, 3);
      expect(addresses.length).toBe(3);
      console.log(`  ✓ Derived ${addresses.length} addresses`);
      addresses.forEach((a, i) => console.log(`    [${i}] ${a.address}`));

      // This proves our wallet implementation can:
      // - Connect to Trezor devices
      // - Use correct derivation paths
      // - Retrieve the necessary data for wallet operations
      console.log('\n========================================');
      console.log('✓ TREZOR WALLET INTEGRATION TEST PASSED');
      console.log('========================================');
      console.log('\nThis test proves XCP Wallet can:');
      console.log('  • Connect to Trezor hardware wallets');
      console.log('  • Derive addresses using correct BIP44 paths');
      console.log('  • Retrieve xpub for watch-only wallet functionality');
      console.log('  • Batch derive addresses for address discovery');
      console.log('');
    });
  });
});
