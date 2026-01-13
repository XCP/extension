import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Subject, of } from 'rxjs';
import { AddressFormat } from '@/utils/blockchain/bitcoin/address';
import { HardwareWalletError, DerivationPaths } from '../types';

// Create hoisted mocks
const {
  mockBuild,
  mockAddTransport,
  mockStartDiscovering,
  mockStopDiscovering,
  mockConnect,
  mockDisconnect,
  mockSignerBuild,
  mockGetWalletAddress,
  mockGetExtendedPublicKey,
  mockSignMessage,
  mockSignPsbt,
} = vi.hoisted(() => ({
  mockBuild: vi.fn(),
  mockAddTransport: vi.fn(),
  mockStartDiscovering: vi.fn(),
  mockStopDiscovering: vi.fn(),
  mockConnect: vi.fn(),
  mockDisconnect: vi.fn(),
  mockSignerBuild: vi.fn(),
  mockGetWalletAddress: vi.fn(),
  mockGetExtendedPublicKey: vi.fn(),
  mockSignMessage: vi.fn(),
  mockSignPsbt: vi.fn(),
}));

// Mock Device Management Kit
vi.mock('@ledgerhq/device-management-kit', () => {
  const DeviceModelId = {
    NANO_S: 'nanoS',
    NANO_SP: 'nanoSP',
    NANO_X: 'nanoX',
    STAX: 'stax',
    FLEX: 'flex',
  };

  // Create a class-like constructor
  class MockDeviceManagementKitBuilder {
    addTransport() {
      mockAddTransport();
      return this;
    }
    build() {
      return mockBuild();
    }
  }

  // Set up the default mock implementation
  mockBuild.mockReturnValue({
    startDiscovering: mockStartDiscovering,
    stopDiscovering: mockStopDiscovering,
    connect: mockConnect,
    disconnect: mockDisconnect,
  });

  return {
    DeviceManagementKit: vi.fn(),
    DeviceManagementKitBuilder: MockDeviceManagementKitBuilder,
    DeviceModelId,
  };
});

// Mock WebHID transport
vi.mock('@ledgerhq/device-transport-kit-web-hid', () => ({
  webHidTransportFactory: vi.fn(),
}));

// Mock Bitcoin signer
vi.mock('@ledgerhq/device-signer-kit-bitcoin', () => {
  // Create a class-like constructor for SignerBtcBuilder
  class MockSignerBtcBuilder {
    build() {
      return mockSignerBuild();
    }
  }

  // Set up default mock implementation
  mockSignerBuild.mockReturnValue({
    getWalletAddress: mockGetWalletAddress,
    getExtendedPublicKey: mockGetExtendedPublicKey,
    signMessage: mockSignMessage,
    signPsbt: mockSignPsbt,
  });

  return {
    SignerBtcBuilder: MockSignerBtcBuilder,
    DefaultDescriptorTemplate: {
      LEGACY: 'pkh(@0/**)',
      NESTED_SEGWIT: 'sh(wpkh(@0/**))',
      NATIVE_SEGWIT: 'wpkh(@0/**)',
      TAPROOT: 'tr(@0/**)',
    },
    DefaultWallet: class MockDefaultWallet {
      derivationPath: string;
      template: string;
      constructor(path: string, template: string) {
        this.derivationPath = path;
        this.template = template;
      }
    },
  };
});

// Import after mocking
import { LedgerAdapter, getLedgerAdapter, resetLedgerAdapter } from '../ledgerAdapter';

// Helper to create mock observable states
function createMockObservable<T>(finalState: { status: 'completed' | 'error'; output?: T; error?: { message: string } }) {
  const subject = new Subject<typeof finalState>();
  // Emit the final state immediately
  setTimeout(() => {
    subject.next(finalState);
    subject.complete();
  }, 0);
  return { observable: subject.asObservable() };
}

describe('LedgerAdapter', () => {
  let adapter: LedgerAdapter;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset the mock build to return a fresh DMK mock
    mockBuild.mockReturnValue({
      startDiscovering: mockStartDiscovering,
      stopDiscovering: mockStopDiscovering,
      connect: mockConnect,
      disconnect: mockDisconnect,
    });

    // Reset the signer mock
    mockSignerBuild.mockReturnValue({
      getWalletAddress: mockGetWalletAddress,
      getExtendedPublicKey: mockGetExtendedPublicKey,
      signMessage: mockSignMessage,
      signPsbt: mockSignPsbt,
    });

    // Set up default mock for device discovery
    mockStartDiscovering.mockReturnValue(
      of({
        type: 'discovered',
        device: {
          modelId: 'nanoSP',
          deviceId: 'test-device-id',
        },
      })
    );

    // Set up default mock for connect
    mockConnect.mockResolvedValue({
      sessionId: 'test-session-id',
    });

    mockDisconnect.mockResolvedValue(undefined);

    // Create fresh adapter after mocks are set up
    adapter = new LedgerAdapter();
  });

  afterEach(async () => {
    await resetLedgerAdapter();
  });

  describe('init', () => {
    it('should initialize DeviceManagementKit', async () => {
      await adapter.init();

      expect(mockAddTransport).toHaveBeenCalled();
      expect(mockBuild).toHaveBeenCalled();
    });

    it('should set initialized flag after successful init', async () => {
      expect(adapter.isInitialized()).toBe(false);
      await adapter.init();
      expect(adapter.isInitialized()).toBe(true);
    });

    it('should not reinitialize if already initialized', async () => {
      await adapter.init();
      await adapter.init();

      expect(mockBuild).toHaveBeenCalledTimes(1);
    });

    it('should throw HardwareWalletError on init failure', async () => {
      mockBuild.mockImplementation(() => {
        throw new Error('WebHID not available');
      });

      await expect(adapter.init()).rejects.toThrow(HardwareWalletError);
    });

    it('should log in debug mode', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await adapter.init({ debug: true });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Ledger]')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('getConnectionStatus', () => {
    it('should return disconnected initially', () => {
      expect(adapter.getConnectionStatus()).toBe('disconnected');
    });

    it('should return connected after successful connection', async () => {
      await adapter.init();
      await adapter.getDeviceInfo(); // Triggers connection

      expect(adapter.getConnectionStatus()).toBe('connected');
    });
  });

  describe('getDeviceInfo', () => {
    it('should throw if not initialized', async () => {
      await expect(adapter.getDeviceInfo()).rejects.toThrow(HardwareWalletError);
    });

    it('should return device info after connection', async () => {
      await adapter.init();

      const info = await adapter.getDeviceInfo();

      expect(info).toEqual({
        vendor: 'ledger',
        model: 'Nano S Plus',
        connected: true,
      });
    });

    it('should identify different Ledger models', async () => {
      const testCases = [
        { modelId: 'nanoS', expected: 'Nano S' },
        { modelId: 'nanoSP', expected: 'Nano S Plus' },
        { modelId: 'nanoX', expected: 'Nano X' },
        { modelId: 'stax', expected: 'Stax' },
        { modelId: 'flex', expected: 'Flex' },
      ];

      for (const { modelId, expected } of testCases) {
        mockStartDiscovering.mockReturnValue(
          of({
            type: 'discovered',
            device: { modelId, deviceId: 'test-id' },
          })
        );

        const testAdapter = new LedgerAdapter();
        await testAdapter.init();
        const info = await testAdapter.getDeviceInfo();

        expect(info?.model).toBe(expected);
        await testAdapter.dispose();
      }
    });
  });

  describe('getAddress', () => {
    beforeEach(async () => {
      await adapter.init();
    });

    it('should get address for P2WPKH format', async () => {
      mockGetWalletAddress.mockReturnValue(
        createMockObservable({
          status: 'completed',
          output: { address: 'bc1qtest123' },
        })
      );

      const result = await adapter.getAddress(AddressFormat.P2WPKH, 0, 0);

      expect(result).toEqual({
        address: 'bc1qtest123',
        publicKey: '', // Ledger doesn't return pubkey
        path: "m/84'/0'/0'/0/0",
      });
    });

    it('should reject P2TR when firmware version is unknown', async () => {
      // Ledger adapter doesn't retrieve firmware version from device,
      // so Taproot should be rejected until firmware version is known
      await expect(
        adapter.getAddress(AddressFormat.P2TR, 0, 5)
      ).rejects.toThrow('Unable to determine firmware version');
    });

    it('should pass showOnDevice flag', async () => {
      mockGetWalletAddress.mockReturnValue(
        createMockObservable({
          status: 'completed',
          output: { address: 'bc1q...' },
        })
      );

      await adapter.getAddress(AddressFormat.P2WPKH, 0, 0, true);

      expect(mockGetWalletAddress).toHaveBeenCalledWith(
        expect.anything(),
        0,
        expect.objectContaining({
          checkOnDevice: true,
        })
      );
    });

    it('should throw HardwareWalletError on failure', async () => {
      mockGetWalletAddress.mockReturnValue(
        createMockObservable({
          status: 'error',
          error: { message: 'Device disconnected' },
        })
      );

      await expect(
        adapter.getAddress(AddressFormat.P2WPKH, 0, 0)
      ).rejects.toThrow(HardwareWalletError);
    });

    it('should handle user cancellation', async () => {
      // Return a fresh observable for each call
      mockGetWalletAddress.mockImplementation(() =>
        createMockObservable({
          status: 'error',
          error: { message: 'User denied the request' },
        })
      );

      try {
        await adapter.getAddress(AddressFormat.P2WPKH, 0, 0, true);
        throw new Error('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HardwareWalletError);
        expect((error as HardwareWalletError).code).toBe('USER_CANCELLED');
      }
    });
  });

  describe('getAddresses (batch)', () => {
    beforeEach(async () => {
      await adapter.init();
    });

    it('should get multiple addresses', async () => {
      let callCount = 0;
      mockGetWalletAddress.mockImplementation(() => {
        return createMockObservable({
          status: 'completed',
          output: { address: `bc1q${callCount++}` },
        });
      });

      const results = await adapter.getAddresses(AddressFormat.P2WPKH, 0, 0, 3);

      expect(results).toHaveLength(3);
      expect(results[0].address).toBe('bc1q0');
      expect(results[1].address).toBe('bc1q1');
      expect(results[2].address).toBe('bc1q2');
    });
  });

  describe('getXpub', () => {
    beforeEach(async () => {
      await adapter.init();
    });

    it('should get xpub for account', async () => {
      mockGetExtendedPublicKey.mockReturnValue(
        createMockObservable({
          status: 'completed',
          output: { extendedPublicKey: 'xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWZiD6...' },
        })
      );

      const xpub = await adapter.getXpub(AddressFormat.P2WPKH, 0);

      expect(xpub).toBe('xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWZiD6...');
      expect(mockGetExtendedPublicKey).toHaveBeenCalledWith("m/84'/0'/0'");
    });

    it('should use correct purpose for different address formats', async () => {
      // Return a fresh observable for each call
      mockGetExtendedPublicKey.mockImplementation(() =>
        createMockObservable({
          status: 'completed',
          output: { extendedPublicKey: 'xpub...' },
        })
      );

      await adapter.getXpub(AddressFormat.P2PKH, 0);
      expect(mockGetExtendedPublicKey).toHaveBeenCalledWith("m/44'/0'/0'");

      await adapter.getXpub(AddressFormat.P2TR, 0);
      expect(mockGetExtendedPublicKey).toHaveBeenCalledWith("m/86'/0'/0'");
    });

    it('should throw on failure', async () => {
      mockGetExtendedPublicKey.mockReturnValue(
        createMockObservable({
          status: 'error',
          error: { message: 'Failed to get xpub' },
        })
      );

      await expect(
        adapter.getXpub(AddressFormat.P2WPKH, 0)
      ).rejects.toThrow(HardwareWalletError);
    });
  });

  describe('signTransaction', () => {
    beforeEach(async () => {
      await adapter.init();
    });

    it('should throw and suggest using PSBT instead', async () => {
      await expect(
        adapter.signTransaction({
          inputs: [],
          outputs: [],
        })
      ).rejects.toThrow('Use signPsbt instead');
    });
  });

  describe('signMessage', () => {
    beforeEach(async () => {
      await adapter.init();
    });

    it('should sign message', async () => {
      mockSignMessage.mockReturnValue(
        createMockObservable({
          status: 'completed',
          output: { signature: 'H+signature...' },
        })
      );
      mockGetWalletAddress.mockReturnValue(
        createMockObservable({
          status: 'completed',
          output: { address: 'bc1qsigner...' },
        })
      );

      const result = await adapter.signMessage({
        message: 'Hello, Bitcoin!',
        path: [84 | 0x80000000, 0 | 0x80000000, 0 | 0x80000000, 0, 0],
      });

      expect(result).toEqual({
        signature: 'H+signature...',
        address: 'bc1qsigner...',
      });
    });

    it('should throw on signing failure', async () => {
      mockSignMessage.mockReturnValue(
        createMockObservable({
          status: 'error',
          error: { message: 'User rejected' },
        })
      );

      await expect(
        adapter.signMessage({
          message: 'test',
          path: [84 | 0x80000000, 0 | 0x80000000, 0 | 0x80000000, 0, 0],
        })
      ).rejects.toThrow(HardwareWalletError);
    });
  });

  describe('signPsbt', () => {
    const testPsbtHex = '70736274ff0100520200000001'; // Minimal PSBT hex
    const testSignedPsbtBase64 = 'cHNidP8BAFICAAAAASgned4='; // Simulated signed PSBT

    beforeEach(async () => {
      await adapter.init();
    });

    it('should throw if not initialized', async () => {
      const uninitAdapter = new LedgerAdapter();
      await expect(
        uninitAdapter.signPsbt({
          psbtHex: testPsbtHex,
          inputPaths: new Map(),
        })
      ).rejects.toThrow(HardwareWalletError);
    });

    it('should throw if no input paths provided', async () => {
      await expect(
        adapter.signPsbt({
          psbtHex: testPsbtHex,
          inputPaths: new Map(), // Empty map
        })
      ).rejects.toThrow(HardwareWalletError);
    });

    it('should sign PSBT successfully', async () => {
      mockSignPsbt.mockReturnValue(
        createMockObservable({
          status: 'completed',
          output: { psbt: testSignedPsbtBase64 },
        })
      );

      const inputPaths = new Map<number, number[]>();
      inputPaths.set(0, [84 | 0x80000000, 0 | 0x80000000, 0 | 0x80000000, 0, 0]);

      const result = await adapter.signPsbt({
        psbtHex: testPsbtHex,
        inputPaths,
      });

      expect(result.signedPsbtHex).toBeDefined();
      expect(mockSignPsbt).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String) // Base64 PSBT
      );
    });

    it('should throw on signing failure', async () => {
      mockSignPsbt.mockReturnValue(
        createMockObservable({
          status: 'error',
          error: { message: 'User cancelled' },
        })
      );

      const inputPaths = new Map<number, number[]>();
      inputPaths.set(0, [84 | 0x80000000, 0 | 0x80000000, 0 | 0x80000000, 0, 0]);

      await expect(
        adapter.signPsbt({
          psbtHex: testPsbtHex,
          inputPaths,
        })
      ).rejects.toThrow(HardwareWalletError);
    });

    it('should use correct address format based on derivation path purpose', async () => {
      // Return a fresh observable for each call
      mockSignPsbt.mockImplementation(() =>
        createMockObservable({
          status: 'completed',
          output: { psbt: testSignedPsbtBase64 },
        })
      );

      // Test with P2PKH path (purpose 44)
      const legacyPaths = new Map<number, number[]>();
      legacyPaths.set(0, [44 | 0x80000000, 0 | 0x80000000, 0 | 0x80000000, 0, 0]);

      await adapter.signPsbt({
        psbtHex: testPsbtHex,
        inputPaths: legacyPaths,
      });

      // Test with P2TR path (purpose 86)
      const taprootPaths = new Map<number, number[]>();
      taprootPaths.set(0, [86 | 0x80000000, 0 | 0x80000000, 0 | 0x80000000, 0, 0]);

      await adapter.signPsbt({
        psbtHex: testPsbtHex,
        inputPaths: taprootPaths,
      });

      expect(mockSignPsbt).toHaveBeenCalledTimes(2);
    });
  });

  describe('dispose', () => {
    it('should clean up resources', async () => {
      await adapter.init();
      await adapter.getDeviceInfo(); // Connect first

      expect(adapter.isInitialized()).toBe(true);
      expect(adapter.getConnectionStatus()).toBe('connected');

      await adapter.dispose();

      expect(mockDisconnect).toHaveBeenCalled();
      expect(adapter.isInitialized()).toBe(false);
      expect(adapter.getConnectionStatus()).toBe('disconnected');
    });

    it('should handle dispose when not connected', async () => {
      await adapter.init();

      // Dispose without connecting - should not throw
      await expect(adapter.dispose()).resolves.not.toThrow();
    });
  });

  describe('getLedgerAdapter (singleton)', () => {
    it('should return same instance', () => {
      const adapter1 = getLedgerAdapter();
      const adapter2 = getLedgerAdapter();

      expect(adapter1).toBe(adapter2);
    });

    it('should create new instance after reset', async () => {
      const adapter1 = getLedgerAdapter();
      await resetLedgerAdapter();
      const adapter2 = getLedgerAdapter();

      expect(adapter1).not.toBe(adapter2);
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await adapter.init();
      // Connect the adapter for tests that need signer
      await adapter.getDeviceInfo();
    });

    it('should wrap unknown errors in HardwareWalletError', async () => {
      mockGetWalletAddress.mockReturnValue(
        createMockObservable({
          status: 'error',
          error: { message: 'Unknown error' },
        })
      );

      try {
        await adapter.getAddress(AddressFormat.P2WPKH, 0, 0);
        throw new Error('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HardwareWalletError);
        expect((error as HardwareWalletError).vendor).toBe('ledger');
      }
    });
  });

  describe('firmware validation', () => {
    beforeEach(async () => {
      await adapter.init();
      // Connect the adapter
      await adapter.getDeviceInfo();
    });

    it('should log warning for passphrase usage', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockGetWalletAddress.mockReturnValue(
        createMockObservable({
          status: 'completed',
          output: { address: 'bc1q...' },
        })
      );

      await adapter.getAddress(AddressFormat.P2WPKH, 0, 0, false, true);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Passphrase support')
      );

      consoleSpy.mockRestore();
    });
  });
});
