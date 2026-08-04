import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import { HardwareWalletError } from '../types';

// Create hoisted mocks using vi.hoisted()
const {
  mockInit,
  mockDispose,
  mockGetFeatures,
  mockGetAddress,
  mockGetPublicKey,
  mockSelectAccount,
  mockSignTransaction,
  mockSignMessage,
} = vi.hoisted(() => ({
  mockInit: vi.fn(),
  mockDispose: vi.fn(),
  mockGetFeatures: vi.fn(),
  mockGetAddress: vi.fn(),
  mockGetPublicKey: vi.fn(),
  mockSelectAccount: vi.fn(),
  mockSignTransaction: vi.fn(),
  mockSignMessage: vi.fn(),
}));

// Mock TrezorConnect (using webextension package for browser extension compatibility)
vi.mock('@trezor/connect-webextension', () => ({
  default: {
    init: mockInit,
    dispose: mockDispose,
    getFeatures: mockGetFeatures,
    getAddress: mockGetAddress,
    getPublicKey: mockGetPublicKey,
    selectAccount: mockSelectAccount,
    signTransaction: mockSignTransaction,
    signMessage: mockSignMessage,
  },
}));

// Mock extractPsbtDetails for signPsbt tests
const mockExtractPsbtDetails = vi.fn();
vi.mock('@/core/bitcoin/psbt', () => ({
  extractPsbtDetails: (...args: unknown[]) => mockExtractPsbtDetails(...args),
}));

// Import after mocking
import { getTrezorAdapter, resetTrezorAdapter, TrezorAdapter } from '../trezorAdapter';

describe('TrezorAdapter', () => {
  let adapter: TrezorAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new TrezorAdapter();
  });

  afterEach(async () => {
    await resetTrezorAdapter();
  });

  describe('init', () => {
    it('should initialize TrezorConnect with correct manifest', async () => {
      mockInit.mockResolvedValue(undefined);

      await adapter.init();

      expect(mockInit).toHaveBeenCalledWith({
        manifest: {
          appName: 'XCP Wallet',
          email: 'support@xcpwallet.com',
          appUrl: 'https://xcpwallet.com',
        },
        debug: expect.any(Boolean),
      });
    });

    it('should set initialized flag after successful init', async () => {
      mockInit.mockResolvedValue(undefined);

      expect(adapter.isInitialized()).toBe(false);
      await adapter.init();
      expect(adapter.isInitialized()).toBe(true);
    });

    it('should not reinitialize if already initialized', async () => {
      mockInit.mockResolvedValue(undefined);

      await adapter.init();
      await adapter.init();

      expect(mockInit).toHaveBeenCalledTimes(1);
    });

    it('should throw HardwareWalletError on init failure', async () => {
      mockInit.mockRejectedValue(new Error('USB not available'));

      await expect(adapter.init()).rejects.toThrow(HardwareWalletError);
    });

    // Connect 10 accepts only manifest/version/env/debug/enabledNetworks/
    // requestedPermissions/coreMode. The transport settings that used to drive the emulator
    // are not part of the public surface, so there is no longer a mode to assert.
    it('should init with only the settings Connect 10 accepts', async () => {
      mockInit.mockResolvedValue(undefined);

      await adapter.init();

      expect(mockInit).toHaveBeenCalledWith({
        manifest: {
          appName: 'XCP Wallet',
          email: 'support@xcpwallet.com',
          appUrl: 'https://xcpwallet.com',
        },
        debug: expect.any(Boolean),
      });
    });
  });

  describe('getConnectionStatus', () => {
    it('should return disconnected initially', () => {
      expect(adapter.getConnectionStatus()).toBe('disconnected');
    });
  });

  describe('getDeviceInfo', () => {
    it('should throw if not initialized', async () => {
      await expect(adapter.getDeviceInfo()).rejects.toThrow(HardwareWalletError);
    });

    it('should return device info on success', async () => {
      mockInit.mockResolvedValue(undefined);
      mockGetFeatures.mockResolvedValue({
        success: true,
        payload: {
          model: 'T',
          label: 'My Trezor',
          major_version: 2,
          minor_version: 5,
          patch_version: 3,
        },
      });

      await adapter.init();
      const info = await adapter.getDeviceInfo();

      expect(info).toEqual({
        vendor: 'trezor',
        model: 'T',
        label: 'My Trezor',
        firmwareVersion: '2.5.3',
        connected: true,
      });
    });
  });

  describe('pingDevice', () => {
    beforeEach(async () => {
      mockInit.mockResolvedValue(undefined);
      await adapter.init();
    });

    // pingDevice moved into the management API, which Connect 10 omits from the public
    // surface. getFeatures answers the same question without a device confirmation.
    it('should return true and mark connected when the device answers', async () => {
      mockGetFeatures.mockResolvedValue({
        success: true,
        payload: { model: 'T', label: 'My Trezor', major_version: 2, minor_version: 5, patch_version: 3 },
      });

      const result = await adapter.pingDevice();

      expect(result).toBe(true);
      expect(adapter.getConnectionStatus()).toBe('connected');
      expect(mockGetFeatures).toHaveBeenCalled();
    });

    it('should return false and mark disconnected when the device does not answer', async () => {
      mockGetFeatures.mockResolvedValue({
        success: false,
        error: {
          message: 'Device disconnected',
          code: 'Device_Disconnected',
        },
      });

      const result = await adapter.pingDevice();

      expect(result).toBe(false);
      expect(adapter.getConnectionStatus()).toBe('disconnected');
    });

    it('should verify a connected adapter before reconnect returns true', async () => {
      mockGetFeatures.mockResolvedValue({
        success: true,
        payload: {
          model: 'T',
          label: 'My Trezor',
          major_version: 2,
          minor_version: 5,
          patch_version: 3,
        },
      });

      await adapter.getDeviceInfo();
      const result = await adapter.reconnect();

      expect(result).toBe(true);
      // once for getDeviceInfo, once for the reconnect check
      expect(mockGetFeatures).toHaveBeenCalledTimes(2);
      expect(mockDispose).not.toHaveBeenCalled();
    });
  });

  describe('getAddress', () => {
    beforeEach(async () => {
      mockInit.mockResolvedValue(undefined);
      await adapter.init();
    });

    it('should get address for P2WPKH format', async () => {
      mockGetAddress.mockResolvedValue({
        success: true,
        payload: {
          address: 'bc1qtest123',
          publicKey: '02abcdef',
        },
      });

      const result = await adapter.getAddress(AddressFormat.P2WPKH, 0, 0);

      expect(result).toEqual({
        address: 'bc1qtest123',
        publicKey: '02abcdef',
        path: "m/84'/0'/0'/0/0",
      });

      // Verify correct INPUT script type is passed (SPEND*, not PAYTO*)
      // This caught a bug where PAYTOWITNESS was passed instead of SPENDWITNESS
      expect(mockGetAddress).toHaveBeenCalledWith(
        expect.objectContaining({
          scriptType: 'SPENDWITNESS', // NOT 'PAYTOWITNESS'
        })
      );
    });

    it('should get address for P2TR (Taproot) format', async () => {
      mockGetAddress.mockResolvedValue({
        success: true,
        payload: {
          address: 'bc1ptest456',
          publicKey: '03fedcba',
        },
      });

      const result = await adapter.getAddress(AddressFormat.P2TR, 0, 5);

      expect(result.address).toBe('bc1ptest456');
      expect(result.path).toBe("m/86'/0'/0'/0/5");

      // Verify correct INPUT script type
      expect(mockGetAddress).toHaveBeenCalledWith(
        expect.objectContaining({
          scriptType: 'SPENDTAPROOT',
        })
      );
    });

    it('should use correct INPUT script types for all address formats', async () => {
      mockGetAddress.mockResolvedValue({
        success: true,
        payload: { address: 'test', publicKey: '02...' },
      });

      // P2PKH should use SPENDADDRESS
      await adapter.getAddress(AddressFormat.P2PKH, 0, 0);
      expect(mockGetAddress).toHaveBeenLastCalledWith(
        expect.objectContaining({ scriptType: 'SPENDADDRESS' })
      );

      // P2SH-P2WPKH should use SPENDP2SHWITNESS
      await adapter.getAddress(AddressFormat.P2SH_P2WPKH, 0, 0);
      expect(mockGetAddress).toHaveBeenLastCalledWith(
        expect.objectContaining({ scriptType: 'SPENDP2SHWITNESS' })
      );

      // P2WPKH should use SPENDWITNESS (NOT PAYTOWITNESS)
      await adapter.getAddress(AddressFormat.P2WPKH, 0, 0);
      expect(mockGetAddress).toHaveBeenLastCalledWith(
        expect.objectContaining({ scriptType: 'SPENDWITNESS' })
      );

      // P2TR should use SPENDTAPROOT
      await adapter.getAddress(AddressFormat.P2TR, 0, 0);
      expect(mockGetAddress).toHaveBeenLastCalledWith(
        expect.objectContaining({ scriptType: 'SPENDTAPROOT' })
      );
    });

    it('should pass showOnDevice flag', async () => {
      mockGetAddress.mockResolvedValue({
        success: true,
        payload: { address: 'bc1q...', publicKey: '02...' },
      });

      await adapter.getAddress(AddressFormat.P2WPKH, 0, 0, true);

      expect(mockGetAddress).toHaveBeenCalledWith(
        expect.objectContaining({
          showOnTrezor: true,
        })
      );
    });

    it('should throw HardwareWalletError on failure', async () => {
      mockGetAddress.mockResolvedValue({
        success: false,
        error: {
          message: 'Device disconnected',
          code: 'Device_Disconnected',
        },
      });

      await expect(
        adapter.getAddress(AddressFormat.P2WPKH, 0, 0)
      ).rejects.toThrow(HardwareWalletError);
    });
  });

  describe('getAddresses (batch)', () => {
    beforeEach(async () => {
      mockInit.mockResolvedValue(undefined);
      await adapter.init();
    });

    it('should get multiple addresses in batch', async () => {
      mockGetAddress.mockResolvedValue({
        success: true,
        payload: [
          { address: 'bc1q0', publicKey: '020' },
          { address: 'bc1q1', publicKey: '021' },
          { address: 'bc1q2', publicKey: '022' },
        ],
      });

      const results = await adapter.getAddresses(AddressFormat.P2WPKH, 0, 0, 3);

      expect(results).toHaveLength(3);
      expect(results[0]!.address).toBe('bc1q0');
      expect(results[2]!.address).toBe('bc1q2');
    });
  });

  describe('getXpub', () => {
    beforeEach(async () => {
      mockInit.mockResolvedValue(undefined);
      await adapter.init();
    });

    it('should get xpub for account', async () => {
      mockGetPublicKey.mockResolvedValue({
        success: true,
        payload: {
          xpub: 'xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWZiD6...',
        },
      });

      const xpub = await adapter.getXpub(AddressFormat.P2WPKH, 0);

      expect(xpub).toBe('xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWZiD6...');
      expect(mockGetPublicKey).toHaveBeenCalledWith({
        path: "m/84'/0'/0'", // String path format
        coin: 'btc',
        device: { useEmptyPassphrase: true },
      });
    });

    it('should use correct purpose for different address formats', async () => {
      mockGetPublicKey.mockResolvedValue({
        success: true,
        payload: { xpub: 'xpub...' },
      });

      await adapter.getXpub(AddressFormat.P2PKH, 0);
      expect(mockGetPublicKey).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "m/44'/0'/0'", // String path format
        })
      );

      await adapter.getXpub(AddressFormat.P2TR, 0);
      expect(mockGetPublicKey).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "m/86'/0'/0'", // String path format
        })
      );
    });
  });

  describe('signTransaction', () => {
    beforeEach(async () => {
      mockInit.mockResolvedValue(undefined);
      await adapter.init();
    });

    it('should sign transaction with inputs and outputs', async () => {
      mockSignTransaction.mockResolvedValue({
        success: true,
        payload: {
          serializedTx: '02000000...',
          txid: 'abc123...',
        },
      });

      const result = await adapter.signTransaction({
        inputs: [
          {
            addressPath: [84 | 0x80000000, 0 | 0x80000000, 0 | 0x80000000, 0, 0],
            prevTxHash: 'def456...',
            prevIndex: 0,
            amount: '100000',
            scriptType: 'SPENDWITNESS',
          },
        ],
        outputs: [
          {
            address: 'bc1qrecipient...',
            amount: '90000',
            scriptType: 'PAYTOWITNESS',
          },
        ],
      });

      expect(result).toEqual({
        signedTxHex: '02000000...',
        txid: 'abc123...',
      });
      expect(mockSignTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          outputs: [
            expect.objectContaining({
              address: 'bc1qrecipient...',
              amount: '90000',
              script_type: 'PAYTOADDRESS',
            }),
          ],
        })
      );
    });

    it('should keep concrete script type for change outputs with address_n', async () => {
      mockSignTransaction.mockResolvedValue({
        success: true,
        payload: {
          serializedTx: '02000000...',
          txid: 'abc123...',
        },
      });

      const changePath = [84 | 0x80000000, 0 | 0x80000000, 0 | 0x80000000, 1, 0];

      await adapter.signTransaction({
        inputs: [
          {
            addressPath: [84 | 0x80000000, 0 | 0x80000000, 0 | 0x80000000, 0, 0],
            prevTxHash: 'def456...',
            prevIndex: 0,
            amount: '100000',
            scriptType: 'SPENDWITNESS',
          },
        ],
        outputs: [
          {
            addressPath: changePath,
            amount: '90000',
            scriptType: 'PAYTOWITNESS',
          },
        ],
      });

      expect(mockSignTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          outputs: [
            expect.objectContaining({
              address_n: changePath,
              amount: '90000',
              script_type: 'PAYTOWITNESS',
            }),
          ],
        })
      );
    });

    it('should handle OP_RETURN outputs for Counterparty', async () => {
      mockSignTransaction.mockResolvedValue({
        success: true,
        payload: {
          serializedTx: '02000000...',
          txid: 'counterparty_tx...',
        },
      });

      await adapter.signTransaction({
        inputs: [
          {
            addressPath: [84 | 0x80000000, 0 | 0x80000000, 0 | 0x80000000, 0, 0],
            prevTxHash: 'input_tx...',
            prevIndex: 0,
            amount: '100000',
            scriptType: 'SPENDWITNESS',
          },
        ],
        outputs: [
          {
            scriptType: 'PAYTOOPRETURN',
            amount: '0',
            opReturnData: '434e545250525459...',  // Counterparty data
          },
          {
            address: 'bc1qchange...',
            amount: '99000',
            scriptType: 'PAYTOWITNESS',
          },
        ],
      });

      expect(mockSignTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          outputs: expect.arrayContaining([
            expect.objectContaining({
              script_type: 'PAYTOOPRETURN',
              amount: '0',
              op_return_data: '434e545250525459...',
            }),
          ]),
        })
      );
    });

    it('should throw on signing failure', async () => {
      mockSignTransaction.mockResolvedValue({
        success: false,
        error: {
          message: 'User cancelled',
          code: 'Failure_ActionCancelled',
        },
      });

      await expect(
        adapter.signTransaction({
          inputs: [],
          outputs: [],
        })
      ).rejects.toThrow(HardwareWalletError);
    });
  });

  describe('signMessage', () => {
    beforeEach(async () => {
      mockInit.mockResolvedValue(undefined);
      await adapter.init();
    });

    it('should sign message', async () => {
      mockSignMessage.mockResolvedValue({
        success: true,
        payload: {
          signature: 'H+signature...',
          address: 'bc1qsigner...',
        },
      });

      const result = await adapter.signMessage({
        message: 'Hello, Bitcoin!',
        path: [84 | 0x80000000, 0 | 0x80000000, 0 | 0x80000000, 0, 0],
      });

      expect(result).toEqual({
        signature: 'H+signature...',
        address: 'bc1qsigner...',
      });
    });

    it('should use default coin name', async () => {
      mockSignMessage.mockResolvedValue({
        success: true,
        payload: { signature: '...', address: '...' },
      });

      await adapter.signMessage({
        message: 'test',
        path: [84 | 0x80000000, 0 | 0x80000000, 0 | 0x80000000, 0, 0],
      });

      expect(mockSignMessage).toHaveBeenCalledWith({
        path: expect.any(Array),
        message: 'test',
        coin: 'btc',
      });
    });
  });

  describe('signPsbt', () => {
    const mockPsbtDetails = {
      rawTxHex: '',
      inputs: [
        {
          index: 0,
          txid: 'def456789012345678901234567890123456789012345678901234567890abcd',
          vout: 0,
          value: 100000,
        },
      ],
      outputs: [
        {
          index: 0,
          value: 10000,
          type: 'p2wpkh' as const,
          // P2WPKH script: 0014 + 20-byte hash (40 hex chars) = 44 chars total
          script: '0014751e76e8199196d454941c45d1b3a323f1433bd6',
        },
        {
          index: 1,
          value: 89000,
          type: 'p2wpkh' as const,
          script: '00142299626fa0236be4d0ba93cbbfccd0bc44ff5a63',
        },
      ],
      totalInputValue: 100000,
      totalOutputValue: 99000,
      fee: 1000,
      hasOpReturn: false,
    };

    beforeEach(async () => {
      mockInit.mockResolvedValue(undefined);
      mockExtractPsbtDetails.mockReturnValue(mockPsbtDetails);
      await adapter.init();
    });

    it('should throw if not initialized', async () => {
      const uninitAdapter = new TrezorAdapter();
      await expect(
        uninitAdapter.signPsbt({
          psbtHex: 'any_psbt_hex',
          inputPaths: new Map(),
        })
      ).rejects.toThrow(HardwareWalletError);
    });

    it('should throw if input path is missing', async () => {
      // Empty inputPaths map but PSBT has inputs
      await expect(
        adapter.signPsbt({
          psbtHex: 'any_psbt_hex',
          inputPaths: new Map(), // No paths provided
        })
      ).rejects.toThrow(HardwareWalletError);
    });

    it('should sign PSBT successfully', async () => {
      mockSignTransaction.mockResolvedValue({
        success: true,
        payload: {
          serializedTx: '02000000...',
          txid: 'psbt_tx_id...',
        },
      });

      const inputPaths = new Map<number, number[]>();
      inputPaths.set(0, [84 | 0x80000000, 0 | 0x80000000, 0 | 0x80000000, 0, 0]);

      const result = await adapter.signPsbt({
        psbtHex: 'any_psbt_hex',
        inputPaths,
      });

      expect(result).toEqual({
        signedTxHex: '02000000...',
      });
      expect(mockSignTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          coin: 'btc',
          push: false,
          inputs: expect.arrayContaining([
            expect.objectContaining({
              address_n: inputPaths.get(0),
              script_type: 'SPENDWITNESS',
            }),
          ]),
          outputs: expect.arrayContaining([
            expect.objectContaining({
              script_type: 'PAYTOADDRESS',
            }),
          ]),
        })
      );
    });

    it('should use PAYTOADDRESS for SegWit PSBT address outputs', async () => {
      const segwitPsbtDetails = {
        ...mockPsbtDetails,
        outputs: [
          {
            index: 0,
            value: 90000,
            type: 'p2wpkh' as const,
            script: '00142299626fa0236be4d0ba93cbbfccd0bc44ff5a63',
          },
        ],
      };
      mockExtractPsbtDetails.mockReturnValue(segwitPsbtDetails);

      mockSignTransaction.mockResolvedValue({
        success: true,
        payload: {
          serializedTx: '02000000...',
          txid: 'segwit_tx_id...',
        },
      });

      const inputPaths = new Map<number, number[]>();
      inputPaths.set(0, [84 | 0x80000000, 0 | 0x80000000, 0 | 0x80000000, 0, 0]);

      await adapter.signPsbt({
        psbtHex: 'any_psbt_hex',
        inputPaths,
      });

      expect(mockSignTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          outputs: [
            expect.objectContaining({
              script_type: 'PAYTOADDRESS',
            }),
          ],
        })
      );
    });

    it('should throw on signing failure', async () => {
      mockSignTransaction.mockResolvedValue({
        success: false,
        error: {
          message: 'User rejected',
          code: 'Failure_ActionCancelled',
        },
      });

      const inputPaths = new Map<number, number[]>();
      inputPaths.set(0, [84 | 0x80000000, 0 | 0x80000000, 0 | 0x80000000, 0, 0]);

      await expect(
        adapter.signPsbt({
          psbtHex: 'any_psbt_hex',
          inputPaths,
        })
      ).rejects.toThrow(HardwareWalletError);
    });

    it('should handle OP_RETURN outputs in PSBT', async () => {
      const psbtWithOpReturn = {
        ...mockPsbtDetails,
        outputs: [
          {
            index: 0,
            value: 0,
            type: 'op_return' as const,
            script: '6a0f68656c6c6f20776f726c64',
            opReturnData: '0f68656c6c6f20776f726c64',
          },
          {
            index: 1,
            value: 99000,
            type: 'p2wpkh' as const,
            script: '00142299626fa0236be4d0ba93cbbfccd0bc44ff5a63',
          },
        ],
        hasOpReturn: true,
      };
      mockExtractPsbtDetails.mockReturnValue(psbtWithOpReturn);

      mockSignTransaction.mockResolvedValue({
        success: true,
        payload: {
          serializedTx: '02000000...',
          txid: 'op_return_tx_id...',
        },
      });

      const inputPaths = new Map<number, number[]>();
      inputPaths.set(0, [84 | 0x80000000, 0 | 0x80000000, 0 | 0x80000000, 0, 0]);

      await adapter.signPsbt({
        psbtHex: 'any_psbt_hex',
        inputPaths,
      });

      expect(mockSignTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          outputs: expect.arrayContaining([
            expect.objectContaining({
              script_type: 'PAYTOOPRETURN',
              amount: '0',
              op_return_data: '0f68656c6c6f20776f726c64',
            }),
          ]),
        })
      );
    });

    it('should use SPENDADDRESS script type for legacy P2PKH path (purpose 44)', async () => {
      // Legacy P2PKH uses purpose 44'
      const legacyPsbtDetails = {
        ...mockPsbtDetails,
        outputs: [
          {
            index: 0,
            value: 90000,
            type: 'p2pkh' as const,
            // P2PKH script: 76a914 + 20-byte-hash + 88ac
            script: '76a914751e76e8199196d454941c45d1b3a323f1433bd688ac',
          },
        ],
      };
      mockExtractPsbtDetails.mockReturnValue(legacyPsbtDetails);

      mockSignTransaction.mockResolvedValue({
        success: true,
        payload: {
          serializedTx: '02000000...',
          txid: 'legacy_tx_id...',
        },
      });

      const inputPaths = new Map<number, number[]>();
      // Legacy P2PKH path: m/44'/0'/0'/0/0
      inputPaths.set(0, [44 | 0x80000000, 0 | 0x80000000, 0 | 0x80000000, 0, 0]);

      await adapter.signPsbt({
        psbtHex: 'any_psbt_hex',
        inputPaths,
      });

      // Should use SPENDADDRESS for input (legacy P2PKH)
      expect(mockSignTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          inputs: expect.arrayContaining([
            expect.objectContaining({
              script_type: 'SPENDADDRESS', // Legacy P2PKH input type
            }),
          ]),
          outputs: expect.arrayContaining([
            expect.objectContaining({
              script_type: 'PAYTOADDRESS', // Legacy P2PKH output type
            }),
          ]),
        })
      );
    });

    it('should throw if input value is missing', async () => {
      const psbtWithMissingValue = {
        ...mockPsbtDetails,
        inputs: [
          {
            index: 0,
            txid: 'def456789012345678901234567890123456789012345678901234567890abcd',
            vout: 0,
            value: undefined, // Missing value!
          },
        ],
      };
      mockExtractPsbtDetails.mockReturnValue(psbtWithMissingValue);

      const inputPaths = new Map<number, number[]>();
      inputPaths.set(0, [84 | 0x80000000, 0 | 0x80000000, 0 | 0x80000000, 0, 0]);

      await expect(
        adapter.signPsbt({
          psbtHex: 'any_psbt_hex',
          inputPaths,
        })
      ).rejects.toThrow(/missing value/i);
    });
  });

  describe('dispose', () => {
    it('should clean up resources', async () => {
      mockInit.mockResolvedValue(undefined);
      await adapter.init();

      expect(adapter.isInitialized()).toBe(true);

      await adapter.dispose();

      expect(mockDispose).toHaveBeenCalled();
      expect(adapter.isInitialized()).toBe(false);
      expect(adapter.getConnectionStatus()).toBe('disconnected');
    });
  });

  describe('discoverAccount', () => {
    beforeEach(async () => {
      mockInit.mockResolvedValue(undefined);
      await adapter.init();
    });

    // getAccountInfo no longer discovers - it rejects a request carrying neither path nor
    // descriptor. selectAccount replaces it and returns the xpub directly, so there is no
    // descriptor left to parse.
    it('should discover an account and take the xpub from the response', async () => {
      mockSelectAccount.mockResolvedValue({
        success: true,
        payload: [{
          symbol: 'btc',
          path: "m/84'/0'/0'",
          address: 'bc1qtest123456789',
          xpub: 'xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWZiD6FKNUjPqBvnsFGUr3CX7RWVLx7YJKS3MsqHp7GJ8rSv8DFGGq',
        }],
      });

      const result = await adapter.discoverAccount(false);

      expect(result).toEqual({
        path: "m/84'/0'/0'",
        address: 'bc1qtest123456789',
        addressFormat: 'p2wpkh',
        accountIndex: 0,
        xpub: 'xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWZiD6FKNUjPqBvnsFGUr3CX7RWVLx7YJKS3MsqHp7GJ8rSv8DFGGq',
      });
      expect(mockSelectAccount).toHaveBeenCalledTimes(1);
      expect(mockGetPublicKey).not.toHaveBeenCalled();
    });

    it('should derive the address format from the account path', async () => {
      mockSelectAccount.mockResolvedValue({
        success: true,
        payload: [{ symbol: 'btc', path: "m/86'/0'/0'", address: 'bc1ptest789', xpub: 'xpub6Dk5AGsQw8Vqk' }],
      });

      const result = await adapter.discoverAccount(false);

      expect(result.addressFormat).toBe('p2tr');
    });

    it('should throw specific error when user cancels', async () => {
      mockSelectAccount.mockResolvedValue({
        success: false,
        error: {
          message: 'User cancelled the action',
          code: 'Failure_ActionCancelled',
        },
      });

      await expect(adapter.discoverAccount(false)).rejects.toThrow(HardwareWalletError);
      await expect(adapter.discoverAccount(false)).rejects.toThrow('cancelled');
    });

    it('should throw specific error when device is disconnected', async () => {
      mockSelectAccount.mockResolvedValue({
        success: false,
        error: {
          message: 'Session not found',
          code: 'Device_SessionNotFound',
        },
      });

      await expect(adapter.discoverAccount(false)).rejects.toThrow(HardwareWalletError);
    });

    it('should reject an account with no xpub rather than returning a partial result', async () => {
      mockSelectAccount.mockResolvedValue({
        success: true,
        payload: [{ symbol: 'btc', path: "m/84'/0'/0'", address: 'bc1qtest' }],
      });

      await expect(adapter.discoverAccount(false)).rejects.toThrow(HardwareWalletError);
    });

    it('should derive the address when the device returns none', async () => {
      mockSelectAccount.mockResolvedValue({
        success: true,
        payload: [{ symbol: 'btc', path: "m/84'/0'/0'", xpub: 'xpub6CUGRUonZSQ4TWtT' }],
      });
      mockGetAddress.mockResolvedValue({
        success: true,
        payload: { address: 'bc1qfallback' },
      });

      const result = await adapter.discoverAccount(false);

      expect(result.address).toBe('bc1qfallback');
      expect(mockGetAddress).toHaveBeenCalledWith(
        expect.objectContaining({ path: "m/84'/0'/0'/0/0" })
      );
    });
  });
  describe('getTrezorAdapter (singleton)', () => {
    it('should return same instance', () => {
      const adapter1 = getTrezorAdapter();
      const adapter2 = getTrezorAdapter();

      expect(adapter1).toBe(adapter2);
    });

    it('should create new instance after reset', async () => {
      const adapter1 = getTrezorAdapter();
      await resetTrezorAdapter();
      const adapter2 = getTrezorAdapter();

      expect(adapter1).not.toBe(adapter2);
    });
  });

  describe('resetTrezorAdapter', () => {
    it('should dispose adapter and call TrezorConnect.dispose()', async () => {
      mockInit.mockResolvedValue(undefined);
      const adapter1 = getTrezorAdapter();
      await adapter1.init();

      await resetTrezorAdapter();

      // Should have disposed the adapter and called TrezorConnect.dispose()
      expect(mockDispose).toHaveBeenCalled();
    });

    it('should be safe to call multiple times', async () => {
      await resetTrezorAdapter();
      await resetTrezorAdapter();
      // Should not throw
    });
  });
});
