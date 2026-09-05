import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { p2wpkh, Script, Transaction } from '@scure/btc-signer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import { finalizePSBT, signPSBT } from '@/core/bitcoin/psbt';
import { HardwareWalletError } from '../types';

// Create hoisted mocks using vi.hoisted()
const {
  mockInit,
  mockDispose,
  mockOn,
  mockGetFeatures,
  mockPingDevice,
  mockGetAddress,
  mockGetPublicKey,
  mockGetAccountInfo,
  mockSignTransaction,
  mockSignMessage,
} = vi.hoisted(() => ({
  mockInit: vi.fn(),
  mockDispose: vi.fn(),
  mockOn: vi.fn(),
  mockGetFeatures: vi.fn(),
  mockPingDevice: vi.fn(),
  mockGetAddress: vi.fn(),
  mockGetPublicKey: vi.fn(),
  mockGetAccountInfo: vi.fn(),
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
    pingDevice: mockPingDevice,
    getAddress: mockGetAddress,
    getPublicKey: mockGetPublicKey,
    getAccountInfo: mockGetAccountInfo,
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

      // Production mode: popup=true, no explicit transports (auto-detect)
      expect(mockInit).toHaveBeenCalledWith({
        manifest: {
          appName: 'XCP Wallet',
          email: 'support@xcpwallet.com',
          appUrl: 'https://xcpwallet.com',
        },
        popup: true,
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

  describe('pingDevice', () => {
    beforeEach(async () => {
      mockInit.mockResolvedValue(undefined);
      await adapter.init();
    });

    it('should return true and mark connected when ping succeeds', async () => {
      mockPingDevice.mockResolvedValue({
        success: true,
        payload: { message: 'XCP Wallet connection check' },
      });

      const result = await adapter.pingDevice();

      expect(result).toBe(true);
      expect(adapter.getConnectionStatus()).toBe('connected');
      expect(mockPingDevice).toHaveBeenCalledWith({
        message: 'XCP Wallet connection check',
        button_protection: false,
      });
    });

    it('should return false and mark disconnected when ping fails', async () => {
      mockPingDevice.mockResolvedValue({
        success: false,
        payload: {
          error: 'Device disconnected',
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
      mockPingDevice.mockResolvedValue({
        success: true,
        payload: { message: 'XCP Wallet connection check' },
      });

      await adapter.getDeviceInfo();
      const result = await adapter.reconnect();

      expect(result).toBe(true);
      expect(mockPingDevice).toHaveBeenCalledTimes(1);
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
    const key = '01'.padStart(64, '0');
    const own = p2wpkh(getPublicKey(hexToBytes(key)));
    const recipient = p2wpkh(getPublicKey(hexToBytes('02'.padStart(64, '0'))));
    const path = [84 | 0x80000000, 0x80000000, 0x80000000, 0, 0];
    const inputPaths = new Map([[0, path]]);
    const createTransaction = (options: { version?: number; lockTime?: number; sequence?: number; amount?: bigint; script?: Uint8Array; funded?: boolean } = {}) => {
      const tx = new Transaction({
        version: options.version ?? 1, lockTime: options.lockTime ?? 950_000,
        allowUnknownInputs: true, allowUnknownOutputs: true, disableScriptCheck: true,
      });
      tx.addInput({
        txid: '11'.repeat(32), index: 0, sequence: options.sequence ?? 0xffffffff,
        ...(options.funded === false ? {} : { witnessUtxo: { script: own.script, amount: 100_000n } }),
      });
      tx.addOutput({ script: options.script ?? recipient.script, amount: options.amount ?? 99_000n });
      return tx;
    };
    const psbt = (tx: Transaction) => bytesToHex(tx.toPSBT());
    const signed = (tx: Transaction) => finalizePSBT(signPSBT(psbt(tx), key, [0], AddressFormat.P2WPKH, [1]));
    let reviewed: Transaction;

    beforeEach(async () => {
      reviewed = createTransaction();
      mockInit.mockResolvedValue(undefined);
      mockSignTransaction.mockImplementation(async () => ({ success: true, payload: { serializedTx: signed(reviewed) } }));
      await adapter.init();
    });

    it('preserves reviewed headers, sequence, amounts and scripts through the actual PSBT parser', async () => {
      const result = await adapter.signPsbt({ psbtHex: psbt(reviewed), inputPaths });
      expect(result.signedTxHex).toBe(signed(reviewed));
      expect(mockSignTransaction).toHaveBeenCalledWith(expect.objectContaining({
        version: 1, lock_time: 950_000, coin: 'btc', push: false,
        inputs: [expect.objectContaining({ prev_hash: '11'.repeat(32), prev_index: 0, sequence: 0xffffffff, amount: '100000', script_type: 'SPENDWITNESS' })],
        outputs: [{ address: recipient.address, amount: '99000', script_type: 'PAYTOADDRESS' }],
      }));
    });

    it('requires initialization', async () => {
      await expect(new TrezorAdapter().signPsbt({ psbtHex: psbt(reviewed), inputPaths })).rejects.toThrow(HardwareWalletError);
    });

    it('refuses an input with no path or authenticated amount before requesting a signature', async () => {
      await expect(adapter.signPsbt({ psbtHex: psbt(reviewed), inputPaths: new Map() })).rejects.toThrow(/derivation path/);
      await expect(adapter.signPsbt({ psbtHex: psbt(createTransaction({ funded: false })), inputPaths })).rejects.toThrow(/missing value/);
      expect(mockSignTransaction).not.toHaveBeenCalled();
    });

    it('uses the path purpose for the input script type', async () => {
      await adapter.signPsbt({ psbtHex: psbt(reviewed), inputPaths: new Map([[0, [44 | 0x80000000, ...path.slice(1)]]]) });
      expect(mockSignTransaction).toHaveBeenCalledWith(expect.objectContaining({
        inputs: [expect.objectContaining({ script_type: 'SPENDADDRESS' })],
      }));
    });

    it('preserves a canonical zero-value OP_RETURN output', async () => {
      const data = new TextEncoder().encode('Counterparty message');
      reviewed.addOutput({ script: Script.encode(['RETURN', data]), amount: 0n });
      await adapter.signPsbt({ psbtHex: psbt(reviewed), inputPaths });
      expect(mockSignTransaction).toHaveBeenCalledWith(expect.objectContaining({
        outputs: expect.arrayContaining([{ script_type: 'PAYTOOPRETURN', amount: '0', op_return_data: bytesToHex(data) }]),
      }));
    });

    it.each([
      ['nonzero amount', '6a026162', 1n],
      ['noncanonical push', '6a4c026162', 0n],
      ['multiple pushes', '6a01610162', 0n],
    ] as const)('refuses an OP_RETURN with %s before the device can sign rewritten bytes', async (_, hex, amount) => {
      reviewed.addOutput({ script: hexToBytes(hex), amount });
      await expect(adapter.signPsbt({ psbtHex: psbt(reviewed), inputPaths })).rejects.toThrow();
      expect(mockSignTransaction).not.toHaveBeenCalled();
    });

    it.each([
      ['version', () => createTransaction({ version: 2 })],
      ['locktime', () => createTransaction({ lockTime: 0 })],
      ['sequence', () => createTransaction({ sequence: 0xfffffffd })],
      ['output amount', () => createTransaction({ amount: 98_000n })],
      ['output script', () => createTransaction({ script: own.script })],
      ['outpoint', () => { const tx = createTransaction(); tx.updateInput(0, { index: 1 }); return tx; }],
      ['output count', () => { const tx = createTransaction(); tx.addOutput({ script: own.script, amount: 1n }); return tx; }],
    ] as const)('refuses a device response that changed the reviewed %s', async (_, changed) => {
      mockSignTransaction.mockResolvedValue({ success: true, payload: { serializedTx: signed(changed()) } });
      await expect(adapter.signPsbt({ psbtHex: psbt(reviewed), inputPaths })).rejects.toThrow(/differs from the reviewed/);
    });

    it('refuses malformed successful device responses', async () => {
      mockSignTransaction.mockResolvedValue({ success: true, payload: { serializedTx: 'not-hex' } });
      await expect(adapter.signPsbt({ psbtHex: psbt(reviewed), inputPaths })).rejects.toThrow();
    });

    it('reports device signing failures', async () => {
      mockSignTransaction.mockResolvedValue({ success: false, payload: { error: 'User rejected', code: 'Failure_ActionCancelled' } });
      await expect(adapter.signPsbt({ psbtHex: psbt(reviewed), inputPaths })).rejects.toThrow(HardwareWalletError);
    });
  });

  describe('dispose', () => {
    it('awaits SDK cleanup and clears local state even when cleanup rejects', async () => {
      mockInit.mockResolvedValue(undefined);
      await adapter.init();
      mockDispose.mockRejectedValueOnce(new Error('SDK cleanup failed'));
      await expect(adapter.dispose()).rejects.toThrow('SDK cleanup failed');
      expect(adapter.isInitialized()).toBe(false);
      expect(adapter.getConnectionStatus()).toBe('disconnected');
    });

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

    it('should discover account and extract xpub from descriptor', async () => {
      // Mock getAccountInfo response with a real-looking descriptor
      mockGetAccountInfo.mockResolvedValue({
        success: true,
        payload: {
          path: "m/84'/0'/0'",
          descriptor: "wpkh([d34db33f/84'/0'/0']xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWZiD6FKNUjPqBvnsFGUr3CX7RWVLx7YJKS3MsqHp7GJ8rSv8DFGGq/0/*)",
          balance: '100000',
          addresses: {
            unused: [{ address: 'bc1qtest123456789' }],
            used: [],
            change: [],
          },
        },
      });

      const result = await adapter.discoverAccount(false);

      expect(result).toEqual({
        path: "m/84'/0'/0'",
        descriptor: expect.stringContaining('wpkh'),
        balance: '100000',
        address: 'bc1qtest123456789',
        addressFormat: 'p2wpkh', // Lowercase - matches AddressFormat.P2WPKH
        accountIndex: 0,
        xpub: 'xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWZiD6FKNUjPqBvnsFGUr3CX7RWVLx7YJKS3MsqHp7GJ8rSv8DFGGq', // Extracted from descriptor!
      });

      // Verify getAccountInfo was called, NOT getPublicKey
      expect(mockGetAccountInfo).toHaveBeenCalledTimes(1);
      // xpub is extracted from descriptor, no separate getPublicKey call needed
    });

    it('should extract xpub from P2TR (Taproot) descriptor', async () => {
      mockGetAccountInfo.mockResolvedValue({
        success: true,
        payload: {
          path: "m/86'/0'/0'",
          descriptor: "tr([d34db33f/86'/0'/0']xpub6Dk5AGsQw8Vqk8kqD1NbQ8Pm6zJkPnVZ4d6r9LMBvpKHofDLc5bVxM4pkxYVgSrT/0/*)",
          balance: '0',
          addresses: {
            unused: [{ address: 'bc1ptest789' }],
          },
        },
      });

      const result = await adapter.discoverAccount(false);

      expect(result.xpub).toBe('xpub6Dk5AGsQw8Vqk8kqD1NbQ8Pm6zJkPnVZ4d6r9LMBvpKHofDLc5bVxM4pkxYVgSrT');
      expect(result.addressFormat).toBe('p2tr'); // Lowercase - matches AddressFormat.P2TR
    });

    it('should extract xpub from P2PKH (Legacy) descriptor', async () => {
      mockGetAccountInfo.mockResolvedValue({
        success: true,
        payload: {
          path: "m/44'/0'/0'",
          descriptor: "pkh([d34db33f/44'/0'/0']xpub6BsLYthLEycvnxBVfGqZ4S5pchR7yDBN/0/*)",
          balance: '50000',
          addresses: {
            used: [{ address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2' }],
          },
        },
      });

      const result = await adapter.discoverAccount(false);

      expect(result.xpub).toBe('xpub6BsLYthLEycvnxBVfGqZ4S5pchR7yDBN');
      expect(result.addressFormat).toBe('p2pkh'); // Lowercase - matches AddressFormat.P2PKH
    });

    it('should throw specific error when user cancels', async () => {
      mockGetAccountInfo.mockResolvedValue({
        success: false,
        payload: {
          error: 'User cancelled the action',
          code: 'Failure_ActionCancelled',
        },
      });

      await expect(adapter.discoverAccount(false)).rejects.toThrow(HardwareWalletError);
      await expect(adapter.discoverAccount(false)).rejects.toThrow('cancelled');
    });

    it('should throw specific error when device is disconnected', async () => {
      mockGetAccountInfo.mockResolvedValue({
        success: false,
        payload: {
          error: 'Session not found',
          code: 'Device_SessionNotFound',
        },
      });

      await expect(adapter.discoverAccount(false)).rejects.toThrow(HardwareWalletError);
    });

    it('should fall back to getAddress if no addresses returned', async () => {
      mockGetAccountInfo.mockResolvedValue({
        success: true,
        payload: {
          path: "m/84'/0'/0'",
          descriptor: "wpkh([d34db33f/84'/0'/0']xpub6CUGRUonZSQ4TWtT/0/*)",
          balance: '0',
          addresses: {}, // No addresses
        },
      });

      // Mock the fallback getAddress call
      mockGetAddress.mockResolvedValue({
        success: true,
        payload: {
          address: 'bc1qfallback',
        },
      });

      const result = await adapter.discoverAccount(false);

      expect(result.address).toBe('bc1qfallback');
      expect(mockGetAddress).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "m/84'/0'/0'/0/0",
        })
      );
    });

    it('should extract xpub using fallback regex for simpler descriptor formats', async () => {
      // Some descriptors may not have the [fingerprint/path] format
      // The fallback regex handles this case
      mockGetAccountInfo.mockResolvedValue({
        success: true,
        payload: {
          path: "m/84'/0'/0'",
          descriptor: "wpkh(xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWZiD6/0/*)",
          balance: '0',
          addresses: {
            unused: [{ address: 'bc1qsimple' }],
          },
        },
      });

      const result = await adapter.discoverAccount(false);

      // The fallback regex should still extract the xpub correctly
      expect(result.xpub).toBe('xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWZiD6');
    });

    it('should handle testnet pubkey variants (tpub)', async () => {
      mockGetAccountInfo.mockResolvedValue({
        success: true,
        payload: {
          path: "m/84'/1'/0'",
          descriptor: "wpkh([d34db33f/84'/1'/0']tpub6CUGRUonZSQ4TWtTMmzTestnet/0/*)",
          balance: '0',
          addresses: {
            unused: [{ address: 'tb1qtestnet' }],
          },
        },
      });

      const result = await adapter.discoverAccount(false);

      expect(result.xpub).toBe('tpub6CUGRUonZSQ4TWtTMmzTestnet');
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
      await expect(resetTrezorAdapter()).resolves.not.toThrow();
    });
  });
});
