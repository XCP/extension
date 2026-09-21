import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { p2tr, p2wpkh, Script, Transaction } from '@scure/btc-signer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import { finalizePSBT, signPSBT } from '@/core/bitcoin/psbt';
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

      expect(mockInit).toHaveBeenCalledWith(
        expect.objectContaining({
        manifest: {
          appName: 'XCP Wallet',
          email: 'support@xcpwallet.com',
          appUrl: 'https://xcpwallet.com',
        },
        coreMode: 'auto',
        env: 'webextension',
        debug: expect.any(Boolean),
        })
      );
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
        coreMode: 'auto',
        env: 'webextension',
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
        version: 1, locktime: 950_000, coin: 'btc', push: false,
        inputs: [expect.objectContaining({ prev_hash: '11'.repeat(32), prev_index: 0, sequence: 0xffffffff, amount: '100000', script_type: 'SPENDWITNESS' })],
        outputs: [{ address: recipient.address, amount: '99000', script_type: 'PAYTOADDRESS' }],
      }));
    });

    it('returns a PSBT with independently verified device signatures', async () => {
      const result = await adapter.signPsbt({ psbtHex: psbt(reviewed), inputPaths,
        sighashTypes: [1], resultFormat: 'signed_psbt' });
      expect(finalizePSBT(result.signedPsbtHex!)).toBe(signed(reviewed));
      expect(result.signedTxHex).toBe(signed(reviewed));
    });

    it('applies an explicit ALL override to the returned PSBT signature metadata', async () => {
      reviewed.updateInput(0, { sighashType: 0x83 });
      const result = await adapter.signPsbt({ psbtHex: psbt(reviewed), inputPaths,
        sighashTypes: [1], resultFormat: 'signed_psbt' });
      const returned = Transaction.fromPSBT(hexToBytes(result.signedPsbtHex!));
      expect(returned.getInput(0).sighashType).toBe(1);
      expect(finalizePSBT(result.signedPsbtHex!)).toBe(result.signedTxHex);
    });

    it('preserves a real presigned external input and reconstructs the exact completed transaction', async () => {
      const acceptance = new Transaction({ version: 1, lockTime: 950_000 });
      acceptance.addInput({ txid: '22'.repeat(32), index: 1, sequence: 0xfffffffc,
        witnessUtxo: { script: recipient.script, amount: 20_000n } });
      acceptance.addInput(reviewed.getInput(0));
      acceptance.addOutput({ script: recipient.script, amount: 119_000n });
      const buyerSigned = signPSBT(psbt(acceptance), '02'.padStart(64, '0'), [0], AddressFormat.P2WPKH, [1, 1]);
      const completed = finalizePSBT(signPSBT(buyerSigned, key, [1], AddressFormat.P2WPKH, [1, 1]));
      mockSignTransaction.mockResolvedValue({ success: true, payload: { serializedTx: completed } });
      const result = await adapter.signPsbt({ psbtHex: buyerSigned, inputPaths: new Map([[1, path]]),
        sighashTypes: [0x83, 1], resultFormat: 'signed_psbt' });
      expect(finalizePSBT(result.signedPsbtHex!)).toBe(completed);
      expect(mockSignTransaction).toHaveBeenCalledWith(expect.objectContaining({
        version: 1, locktime: 950_000,
        inputs: [expect.objectContaining({ prev_hash: '22'.repeat(32), prev_index: 1, amount: '20000',
          script_type: 'EXTERNAL', script_pubkey: bytesToHex(recipient.script), sequence: 0xfffffffc,
          witness: expect.any(String) }), expect.objectContaining({ address_n: path, script_type: 'SPENDWITNESS' })],
      }));
    });

    it('rejects unsupported provider sighashes and derivation formats before prompting', async () => {
      await expect(adapter.signPsbt({ psbtHex: psbt(reviewed), inputPaths,
        sighashTypes: [0x83], resultFormat: 'signed_psbt' })).rejects.toMatchObject({ code: 'UNSUPPORTED_SIGHASH' });
      await expect(adapter.signPsbt({ psbtHex: psbt(reviewed),
        inputPaths: new Map([[0, [44 | 0x80000000, ...path.slice(1)]]]),
        resultFormat: 'signed_psbt' })).rejects.toMatchObject({ code: 'UNSUPPORTED_PROVIDER_PSBT' });
      expect(mockSignTransaction).not.toHaveBeenCalled();
    });

    it('preserves DEFAULT sighash for the existing raw Taproot composer path', async () => {
      const internalKey = getPublicKey(hexToBytes(key)).slice(1);
      const taproot = p2tr(internalKey);
      const tx = createTransaction();
      tx.updateInput(0, { witnessUtxo: { script: taproot.script, amount: 100_000n },
        tapInternalKey: internalKey, sighashType: 0 }, true);
      const raw = finalizePSBT(signPSBT(psbt(tx), key, [0], AddressFormat.P2TR, [0]));
      mockSignTransaction.mockResolvedValue({ success: true, payload: { serializedTx: raw } });
      await expect(adapter.signPsbt({ psbtHex: psbt(tx),
        inputPaths: new Map([[0, [86 | 0x80000000, ...path.slice(1)]]]) })).resolves.toEqual({ signedTxHex: raw });
      expect(mockSignTransaction).toHaveBeenCalledWith(expect.objectContaining({
        inputs: [expect.objectContaining({ script_type: 'SPENDTAPROOT' })],
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
      mockSignTransaction.mockResolvedValue({ success: false, error: { message: 'User rejected', code: 'Failure_ActionCancelled' } });
      await expect(adapter.signPsbt({ psbtHex: psbt(reviewed), inputPaths })).rejects.toThrow(HardwareWalletError);
    });

    it.each(['Transport_Error', 'Failure_ActionCancelled'])('handles v10 signing failure %s without retrying the signature', async code => {
      mockSignTransaction.mockResolvedValue({ success: false, error: { message: 'Signing interrupted', code } });
      await expect(adapter.signPsbt({ psbtHex: psbt(reviewed), inputPaths,
        resultFormat: 'signed_psbt' })).rejects.toMatchObject({ code });
      expect(mockSignTransaction).toHaveBeenCalledTimes(1);
      expect(mockDispose).toHaveBeenCalledTimes(code === 'Transport_Error' ? 1 : 0);
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
      mockGetAddress.mockResolvedValue({ success: true, payload: { address: 'bc1qzero', publicKey: '02...' } });
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
        address: 'bc1qzero',
        addressFormat: 'p2wpkh',
        accountIndex: 0,
        xpub: 'xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWZiD6FKNUjPqBvnsFGUr3CX7RWVLx7YJKS3MsqHp7GJ8rSv8DFGGq',
      });
      expect(mockSelectAccount).toHaveBeenCalledWith(expect.objectContaining({ addressSelection: 'fullAccount', selectionType: 'single' }));
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

    it('uses address zero even when the picker returns a later fresh address', async () => {
      mockSelectAccount.mockResolvedValue({
        success: true,
        payload: [{ symbol: 'btc', path: "m/84'/0'/0'", address: 'bc1qlater', xpub: 'xpub6CUGRUonZSQ4TWtT' }],
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
      await expect(resetTrezorAdapter()).resolves.not.toThrow();
    });
  });
});
