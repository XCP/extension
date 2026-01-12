import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AddressFormat } from '@/utils/blockchain/bitcoin/address';
import { HardwareWalletError } from '../types';

// Create hoisted mocks using vi.hoisted()
const {
  mockInit,
  mockDispose,
  mockOn,
  mockGetFeatures,
  mockGetAddress,
  mockGetPublicKey,
  mockSignTransaction,
  mockSignMessage,
} = vi.hoisted(() => ({
  mockInit: vi.fn(),
  mockDispose: vi.fn(),
  mockOn: vi.fn(),
  mockGetFeatures: vi.fn(),
  mockGetAddress: vi.fn(),
  mockGetPublicKey: vi.fn(),
  mockSignTransaction: vi.fn(),
  mockSignMessage: vi.fn(),
}));

// Mock TrezorConnect (using webextension package for browser extension compatibility)
vi.mock('@trezor/connect-webextension', () => ({
  default: {
    init: mockInit,
    dispose: mockDispose,
    on: mockOn,
    off: vi.fn(),
    getFeatures: mockGetFeatures,
    getAddress: mockGetAddress,
    getPublicKey: mockGetPublicKey,
    signTransaction: mockSignTransaction,
    signMessage: mockSignMessage,
    uiResponse: vi.fn(),
  },
  DEVICE_EVENT: 'DEVICE_EVENT',
  DEVICE: {
    CONNECT: 'device-connect',
    DISCONNECT: 'device-disconnect',
  },
  UI: {
    REQUEST_BUTTON: 'ui-request_button',
    REQUEST_CONFIRMATION: 'ui-request_confirmation',
    RECEIVE_CONFIRMATION: 'ui-receive_confirmation',
  },
}));

// Mock extractPsbtDetails for signPsbt tests
const mockExtractPsbtDetails = vi.fn();
vi.mock('@/utils/blockchain/bitcoin/psbt', () => ({
  extractPsbtDetails: (...args: unknown[]) => mockExtractPsbtDetails(...args),
}));

// Import after mocking
import { TrezorAdapter, getTrezorAdapter, resetTrezorAdapter } from '../trezorAdapter';

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
        popup: true,
        debug: expect.any(Boolean),
        transports: ['WebUsbTransport'],
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

    it('should register device event listener', async () => {
      mockInit.mockResolvedValue(undefined);

      await adapter.init();

      expect(mockOn).toHaveBeenCalledWith(
        'DEVICE_EVENT',
        expect.any(Function)
      );
    });

    it('should initialize in test mode with BridgeTransport', async () => {
      mockInit.mockResolvedValue(undefined);

      await adapter.init({ testMode: true });

      expect(mockInit).toHaveBeenCalledWith({
        manifest: {
          appName: 'XCP Wallet',
          email: 'support@xcpwallet.com',
          appUrl: 'https://xcpwallet.com',
        },
        popup: false,
        debug: expect.any(Boolean),
        transports: ['BridgeTransport'],
        pendingTransportEvent: true,
        transportReconnect: false,
      });
    });

    it('should register UI event listeners in test mode', async () => {
      mockInit.mockResolvedValue(undefined);

      await adapter.init({ testMode: true });

      // Should register for REQUEST_CONFIRMATION events
      expect(mockOn).toHaveBeenCalledWith(
        'ui-request_confirmation',
        expect.any(Function)
      );
    });

    it('should use custom connectSrc in test mode', async () => {
      mockInit.mockResolvedValue(undefined);

      await adapter.init({
        testMode: true,
        connectSrc: 'http://localhost:8088/',
      });

      expect(mockInit).toHaveBeenCalledWith(
        expect.objectContaining({
          connectSrc: 'http://localhost:8088/',
        })
      );
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
        payload: {
          error: 'Device disconnected',
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
      expect(results[0].address).toBe('bc1q0');
      expect(results[2].address).toBe('bc1q2');
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
        useEmptyPassphrase: true,
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
        payload: {
          error: 'User cancelled',
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
        coin: 'Bitcoin',
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
        signedPsbtHex: '02000000...',
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
              script_type: 'PAYTOWITNESS',
            }),
          ]),
        })
      );
    });

    it('should throw on signing failure', async () => {
      mockSignTransaction.mockResolvedValue({
        success: false,
        payload: {
          error: 'User rejected',
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
});
