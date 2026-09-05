import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock hardware wallet module BEFORE importing WalletManager to avoid
// @trezor/connect-webextension import side effects (Browser.runtime.onConnect.addListener)
vi.mock('@/core/hardware/trezorAdapter', () => ({
  getTrezorAdapter: vi.fn(),
  resetTrezorAdapter: vi.fn(),
  TrezorAdapter: vi.fn()
}));

import { AddressFormat } from '@/core/bitcoin/address';
import type { WalletRecord } from '@/types/wallet';
import { WalletManager } from '../walletManager';
import {
  createMultipleWallets,
  createPrivateKeyWallet,
  createTestKeychain,
  createTestKeychainRecord,
  createTestWallet,
  mockKeychainUnlocked,
  mockWalletUnlocked,
  setupMocks,
} from './helpers/testHelpers';

// Mock all external dependencies
vi.mock('@/platform/auth/sessionManager');
vi.mock('@/platform/storage/walletStorage');
vi.mock('@/core/encryption/encryption');
vi.mock('@/core/encryption/settings');
vi.mock('@/core/encryption/buffer');
vi.mock('@/core/bitcoin/address');
vi.mock('@/core/bitcoin/privateKey');
vi.mock('@/core/bitcoin/messageSigner');
vi.mock('@/core/bitcoin/transactionSigner');
vi.mock('@/core/bitcoin/transactionBroadcaster');
vi.mock('@/core/bitcoin/psbt', () => ({
  signPSBT: vi.fn().mockReturnValue('signed-psbt'),
  extractPsbtDetails: vi.fn(),
  completePsbtWithInputValues: vi.fn(),
}));
vi.mock('@/core/counterwallet');
vi.mock('@/core/wallet/rarePepeWallet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/wallet/rarePepeWallet')>()),
  detectUtxoAddress: (...args: unknown[]) => mockDetectUtxoAddress(...args),
}));
vi.mock('@noble/hashes/sha2.js');
vi.mock('@noble/hashes/utils.js');
vi.mock('@scure/bip32');
vi.mock('@scure/bip39');

import { bytesToHex } from '@noble/hashes/utils.js';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import {
  encodeAddress,
  getAddressFromMnemonic,
  getDerivationPathForAddressFormat,
  isCounterwalletFormat,
  normalizeAddressForComparison,
} from '@/core/bitcoin/address';
import { signMessage } from '@/core/bitcoin/messageSigner';
import { getAddressFromPrivateKey } from '@/core/bitcoin/privateKey';
import { signPSBT } from '@/core/bitcoin/psbt';
import { base64ToBuffer } from '@/core/encryption/buffer';
import { decryptJsonWithKey, decryptWithKey, deriveKey, deriveKeyAsync } from '@/core/encryption/encryption';
// Import modules to get access to mocked functions
import * as sessionManager from '@/platform/auth/sessionManager';
import {
  assertNoKeychainRecord,
  getKeychainRecord,
  saveKeychainRecord,
} from '@/platform/storage/walletStorage';

const { mockDetectUtxoAddress } = vi.hoisted(() => ({ mockDetectUtxoAddress: vi.fn() }));

describe('WalletManager', () => {
  let walletManager: WalletManager;
  let mocks: ReturnType<typeof setupMocks>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = setupMocks();

    // Mock chrome.alarms API
    global.chrome = {
      ...global.chrome,
      alarms: {
        create: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn().mockResolvedValue(true),
        onAlarm: {
          addListener: vi.fn(),
        },
      },
    } as any;

    // Setup the actual mocked module functions
    vi.mocked(sessionManager.setLastActiveTime).mockImplementation(mocks.sessionManager.setLastActiveTime);
    vi.mocked(sessionManager.getUnlockedSecret).mockImplementation(mocks.sessionManager.getUnlockedSecret);
    vi.mocked(sessionManager.storeUnlockedSecret).mockImplementation(mocks.sessionManager.storeUnlockedSecret);
    vi.mocked(sessionManager.clearUnlockedSecret).mockImplementation(mocks.sessionManager.clearUnlockedSecret);
    vi.mocked(sessionManager.clearAllUnlockedSecrets).mockImplementation(mocks.sessionManager.clearAllUnlockedSecrets);
    vi.mocked(sessionManager.initializeSession).mockImplementation(mocks.sessionManager.initializeSession || vi.fn().mockResolvedValue(undefined));
    vi.mocked(sessionManager.scheduleSessionExpiry).mockResolvedValue(undefined);
    vi.mocked(sessionManager.clearSessionExpiry).mockResolvedValue(undefined);
    vi.mocked(sessionManager.getKeychainMasterKey).mockImplementation(mocks.sessionManager.getKeychainMasterKey);
    vi.mocked(sessionManager.storeKeychainMasterKey).mockImplementation(mocks.sessionManager.storeKeychainMasterKey);

    vi.mocked(getKeychainRecord).mockImplementation(mocks.walletStorage.getKeychainRecord);
    vi.mocked(saveKeychainRecord).mockImplementation(mocks.walletStorage.saveKeychainRecord);
    vi.mocked(assertNoKeychainRecord).mockResolvedValue(undefined);

    vi.mocked(getAddressFromMnemonic).mockImplementation(mocks.bitcoin.getAddressFromMnemonic);
    vi.mocked(getDerivationPathForAddressFormat).mockImplementation(mocks.bitcoin.getDerivationPathForAddressFormat);
    vi.mocked(normalizeAddressForComparison).mockImplementation(address => address.toLowerCase());

    vi.mocked(deriveKey).mockImplementation(mocks.keyBased.deriveKey);
    vi.mocked(deriveKeyAsync).mockImplementation(mocks.keyBased.deriveKey);
    vi.mocked(decryptJsonWithKey).mockImplementation(mocks.keyBased.decryptJsonWithKey);
    vi.mocked(decryptWithKey).mockImplementation(mocks.keyBased.decryptWithKey);
    vi.mocked(base64ToBuffer).mockReturnValue(new Uint8Array([1, 2, 3]));

    // Mock HD key derivation
    vi.mocked(mnemonicToSeedSync).mockReturnValue(new Uint8Array(64));
    vi.mocked(HDKey.fromMasterSeed).mockReturnValue({
      derive: vi.fn().mockReturnValue({
        publicKey: new Uint8Array([2, 3, 4]),
        privateKey: new Uint8Array([1, 2, 3]),
      }),
    } as any);
    vi.mocked(bytesToHex).mockReturnValue('0203040506');

    walletManager = new WalletManager();
  });

  describe('Basic State', () => {
    it('should initialize with empty wallets', () => {
      expect(walletManager.getWallets()).toEqual([]);
      expect(walletManager.getActiveWallet()).toBeUndefined();
    });

    it('should update last active time', () => {
      walletManager.setLastActiveTime();
      expect(mocks.sessionManager.setLastActiveTime).toHaveBeenCalledOnce();
    });

    it('enforces DIESEL protection and validates its fee ceiling at persistence', async () => {
      walletManager['keychain'] = createTestKeychain([]);
      mocks.sessionManager.getKeychainMasterKey.mockResolvedValue({} as CryptoKey);
      mocks.walletStorage.getKeychainRecord.mockResolvedValue(createTestKeychainRecord());

      await walletManager.updateSettings({
        enableDieselMinting: true,
        protectAlkanesUtxos: false,
        dieselMintMaxFeeRate: 2,
      });
      expect(walletManager.getSettings()).toMatchObject({
        enableDieselMinting: true,
        protectAlkanesUtxos: true,
        dieselMintMaxFeeRate: 2,
      });

      await expect(walletManager.updateSettings({ dieselMintMaxFeeRate: 0 }))
        .rejects.toThrow('between 0 and 1,000');
    });
  });

  describe('Wallet Refresh (Service Worker Restart)', () => {
    it('should reload wallets from session when master key is available', async () => {
      const testWallet = createTestWallet();
      const keychain = createTestKeychain([testWallet]);

      // Mock that keychain is unlocked (master key in session)
      mockKeychainUnlocked(mocks, keychain);

      await walletManager.refreshWallets();

      const wallets = walletManager.getWallets();
      expect(wallets).toHaveLength(1);
      expect(wallets[0]!.name).toBe(testWallet.name);
      expect(wallets[0]!.type).toBe(testWallet.type);
    });

    it('should handle no master key gracefully (keychain locked)', async () => {
      // No master key in session (keychain locked)
      mocks.sessionManager.getKeychainMasterKey.mockResolvedValue(null);

      await walletManager.refreshWallets();

      expect(walletManager.getWallets()).toEqual([]);
    });

    it('should handle missing keychain record gracefully', async () => {
      mocks.sessionManager.getKeychainMasterKey.mockResolvedValue({} as CryptoKey);
      mocks.walletStorage.getKeychainRecord.mockResolvedValue(null);

      await walletManager.refreshWallets();

      expect(walletManager.getWallets()).toEqual([]);
    });

    it('should call selectWallet to restore addresses after SW restart', async () => {
      const testWallet = createTestWallet();
      const keychain = createTestKeychain([testWallet]);

      // Mock that keychain is unlocked (master key in session) but no secrets in memory
      mockKeychainUnlocked(mocks, keychain);
      // decryptWithKey returns the wallet secret (needed by selectWallet)
      mocks.keyBased.decryptWithKey.mockResolvedValue('test mnemonic');

      await walletManager.refreshWallets();

      // selectWallet should have been called, which stores the unlocked secret
      expect(mocks.sessionManager.storeUnlockedSecret).toHaveBeenCalledWith(
        testWallet.id,
        'test mnemonic'
      );
      // The active wallet should be set and have derived addresses
      const active = walletManager.getActiveWallet();
      expect(active).toBeDefined();
      expect(active!.id).toBe(testWallet.id);
      expect(active!.addresses.length).toBeGreaterThan(0);
    });
  });

  describe('Wallet Management', () => {
    it('should get wallet by ID', () => {
      const wallet = createTestWallet();
      walletManager['wallets'] = [wallet];

      const found = walletManager.getWalletById(wallet.id);
      expect(found).toEqual(wallet);
    });

    it('should return undefined for non-existent wallet', () => {
      const found = walletManager.getWalletById('non-existent');
      expect(found).toBeUndefined();
    });

    it('selects a wallet by decrypting its secret and deriving its addresses', async () => {
      const wallet = createTestWallet({ addressCount: 1 });
      const keychain = createTestKeychain([wallet]);
      walletManager['wallets'] = [wallet];
      walletManager['keychain'] = keychain;
      mocks.sessionManager.getKeychainMasterKey.mockResolvedValue({} as CryptoKey);
      mocks.keyBased.decryptWithKey.mockResolvedValue('test mnemonic');
      vi.mocked(HDKey.fromMasterSeed).mockReturnValue({
        derive: vi.fn().mockReturnValue({ publicKey: new Uint8Array([2, 3, 4]) }),
      } as any);
      vi.mocked(encodeAddress).mockReturnValue('bc1qselected');

      await walletManager.selectWallet(wallet.id);

      expect(walletManager.getActiveWallet()).toEqual(wallet);
      expect(wallet.addresses).toHaveLength(1);
      expect(mocks.sessionManager.storeUnlockedSecret).toHaveBeenCalledWith(
        wallet.id,
        'test mnemonic'
      );
    });
  });

  describe('Address Format Changes', () => {
    it('preserves the wallet address count and selected derivation index', async () => {
      const wallet = createTestWallet({
        addressFormat: AddressFormat.P2PKH,
        addressCount: 3,
        addresses: [0, 1, 2].map(index => ({
          name: `Address ${index + 1}`,
          address: `legacy-${index}`,
          path: `m/44'/0'/0'/0/${index}`,
          pubKey: `02legacy${index}`,
        })),
      });
      const keychain = createTestKeychain([wallet]);
      keychain.settings.lastActiveAddress = 'legacy-2';
      walletManager['wallets'] = [wallet];
      walletManager['keychain'] = keychain;
      walletManager['activeWalletId'] = wallet.id;
      mocks.sessionManager.getUnlockedSecret.mockResolvedValue('test mnemonic');
      mocks.sessionManager.getKeychainMasterKey.mockResolvedValue({} as CryptoKey);
      mocks.walletStorage.getKeychainRecord.mockResolvedValue(createTestKeychainRecord());
      mocks.bitcoin.getDerivationPathForAddressFormat.mockReturnValue("m/86'/0'/0'/0");
      vi.mocked(HDKey.fromMasterSeed).mockReturnValue({
        derive: vi.fn((path: string) => ({
          publicKey: new Uint8Array([2, Number(path.split('/').at(-1))]),
        })),
      } as any);
      vi.mocked(encodeAddress).mockImplementation(
        publicKey => `taproot-${publicKey[1]}`
      );

      await walletManager.updateWalletAddressFormat(wallet.id, AddressFormat.P2TR);

      expect(wallet.addressFormat).toBe(AddressFormat.P2TR);
      expect(wallet.addressCount).toBe(3);
      expect(wallet.addresses.map(address => address.address)).toEqual([
        'taproot-0',
        'taproot-1',
        'taproot-2',
      ]);
      expect(keychain.wallets[0]!.addressCount).toBe(3);
      expect(keychain.wallets[0]!.addressFormat).toBe(AddressFormat.P2TR);
      expect(keychain.settings.lastActiveAddress).toBe('taproot-2');
    });
  });

  describe('Wallet Locking', () => {
    it('should clear specific wallet secret', () => {
      const wallet = createTestWallet();
      walletManager['wallets'] = [wallet];

      mockWalletUnlocked(mocks, wallet.id);

      walletManager.clearWalletSecret(wallet.id);

      expect(vi.mocked(sessionManager.clearUnlockedSecret)).toHaveBeenCalledWith(wallet.id);
    });

    it('should lock entire keychain', async () => {
      const wallets = createMultipleWallets(3);
      walletManager['wallets'] = wallets;

      await walletManager.lockKeychain();

      expect(vi.mocked(sessionManager.clearAllUnlockedSecrets)).toHaveBeenCalled();
    });

    it('clears in-memory keychain state and the alarm even when storage cleanup fails', async () => {
      walletManager['keychain'] = createTestKeychain();
      vi.mocked(sessionManager.clearAllUnlockedSecrets)
        .mockRejectedValueOnce(new Error('session storage failed'));

      await expect(walletManager.lockKeychain()).rejects.toThrow('session storage failed');

      expect(walletManager['keychain']).toBeNull();
      expect(sessionManager.clearSessionExpiry).toHaveBeenCalled();
    });
  });

  describe('UTXO Addresses', () => {
    const MNEMONIC = 'test mnemonic phrase';

    /** An unlocked Counterwallet mnemonic wallet with two sequential addresses. */
    function setupCounterwalletWallet() {
      const wallet = createTestWallet({
        addressFormat: AddressFormat.Counterwallet,
        addressCount: 2,
      });
      const record: WalletRecord = {
        id: wallet.id,
        name: wallet.name,
        type: 'mnemonic',
        addressFormat: AddressFormat.Counterwallet,
        addressCount: 2,
        previewAddress: '',
        encryptedSecret: '',
      };
      walletManager['wallets'] = [wallet];
      walletManager['keychain'] = { version: 1, wallets: [record], settings: {} as never };
      mocks.sessionManager.getUnlockedSecret.mockResolvedValue(MNEMONIC);
      mocks.sessionManager.getKeychainMasterKey.mockResolvedValue({} as CryptoKey);
      vi.mocked(isCounterwalletFormat).mockReturnValue(true);
      return { wallet, record };
    }

    beforeEach(() => {
      mockDetectUtxoAddress.mockResolvedValue({ status: 'none' });
    });

    it('keeps a funded UTXO address on the record, so it survives the next unlock', async () => {
      const { wallet, record } = setupCounterwalletWallet();
      mockDetectUtxoAddress.mockResolvedValue({ status: 'found', value: '1utxo' });

      const added = await walletManager.addUtxoAddress(wallet.id, 1);

      expect(added).toMatchObject({ name: 'UTXO Address 2', path: "m/0'/1/1" });
      expect(record.extraPaths).toEqual(["m/0'/1/1"]);
      expect(mocks.walletStorage.saveKeychainRecord).toHaveBeenCalled();
    });

    it('reports an empty change address as nothing found, and keeps nothing', async () => {
      const { wallet, record } = setupCounterwalletWallet();

      await expect(walletManager.addUtxoAddress(wallet.id, 0)).resolves.toBeNull();
      expect(record.extraPaths).toBeUndefined();
      expect(mocks.walletStorage.saveKeychainRecord).not.toHaveBeenCalled();
    });

    it('refuses to call an unreachable lookup an empty address', async () => {
      const { wallet, record } = setupCounterwalletWallet();
      mockDetectUtxoAddress.mockResolvedValue({ status: 'unavailable' });

      await expect(walletManager.addUtxoAddress(wallet.id, 0)).rejects.toThrow(
        'Could not check for a UTXO address'
      );
      expect(record.extraPaths).toBeUndefined();
    });

    it('does not add the same path twice', async () => {
      const { wallet, record } = setupCounterwalletWallet();
      mockDetectUtxoAddress.mockResolvedValue({ status: 'found', value: '1utxo' });

      await walletManager.addUtxoAddress(wallet.id, 1);
      mockDetectUtxoAddress.mockClear();
      await walletManager.addUtxoAddress(wallet.id, 1);

      expect(record.extraPaths).toEqual(["m/0'/1/1"]);
      expect(mockDetectUtxoAddress).not.toHaveBeenCalled();
    });

    it('leaves the sequential run alone when a UTXO address is added', async () => {
      const { wallet } = setupCounterwalletWallet();
      mockDetectUtxoAddress.mockResolvedValue({ status: 'found', value: '1utxo' });

      await walletManager.addUtxoAddress(wallet.id, 1);

      // The sequential run is untouched and the UTXO address is appended after it.
      expect(wallet.addresses).toHaveLength(3);
      expect(wallet.addresses.at(-1)).toMatchObject({ path: "m/0'/1/1" });
    });

    it('forgets a kept UTXO address on request', async () => {
      const { wallet, record } = setupCounterwalletWallet();
      mockDetectUtxoAddress.mockResolvedValue({ status: 'found', value: '1utxo' });
      await walletManager.addUtxoAddress(wallet.id, 1);

      await walletManager.removeUtxoAddress(wallet.id, "m/0'/1/1");

      expect(record.extraPaths).toEqual([]);
      expect(wallet.addresses).toHaveLength(2);
      expect(wallet.addresses.some((address) => address.path === "m/0'/1/1")).toBe(false);
    });

    it('sweeps every address in one pass, writing the keychain once', async () => {
      const { wallet, record } = setupCounterwalletWallet();
      mockDetectUtxoAddress.mockResolvedValue({ status: 'found', value: '1utxo' });

      const found = await walletManager.sweepUtxoAddresses(wallet.id);

      expect(found).toHaveLength(2);
      expect(record.extraPaths).toEqual(["m/0'/1/0", "m/0'/1/1"]);
      expect(mockDetectUtxoAddress).toHaveBeenCalledTimes(2);
      // One persist for the pass, not one per address.
      expect(mocks.walletStorage.saveKeychainRecord).toHaveBeenCalledTimes(1);
    });

    it('checks only the indexes it is given', async () => {
      const { wallet } = setupCounterwalletWallet();

      await walletManager.sweepUtxoAddresses(wallet.id, [1]);

      expect(mockDetectUtxoAddress).toHaveBeenCalledTimes(1);
      expect(mockDetectUtxoAddress).toHaveBeenCalledWith(expect.anything(), expect.anything(), 1);
    });

    it('does not re-ask about an address it already keeps', async () => {
      const { wallet } = setupCounterwalletWallet();
      mockDetectUtxoAddress.mockResolvedValue({ status: 'found', value: '1utxo' });
      await walletManager.sweepUtxoAddresses(wallet.id, [0]);
      mockDetectUtxoAddress.mockClear();

      await walletManager.sweepUtxoAddresses(wallet.id, [0, 1]);

      expect(mockDetectUtxoAddress).toHaveBeenCalledTimes(1);
      expect(mockDetectUtxoAddress).toHaveBeenCalledWith(expect.anything(), expect.anything(), 1);
    });

    it('writes nothing and stays quiet when a sweep finds nothing', async () => {
      const { wallet, record } = setupCounterwalletWallet();

      await expect(walletManager.sweepUtxoAddresses(wallet.id)).resolves.toEqual([]);
      expect(record.extraPaths).toBeUndefined();
      expect(mocks.walletStorage.saveKeychainRecord).not.toHaveBeenCalled();
    });

    it('swallows an unreachable sweep, unlike the deliberate check', async () => {
      const { wallet } = setupCounterwalletWallet();
      mockDetectUtxoAddress.mockResolvedValue({ status: 'unavailable' });

      await expect(walletManager.sweepUtxoAddresses(wallet.id)).resolves.toEqual([]);
      await expect(walletManager.addUtxoAddress(wallet.id, 0)).rejects.toThrow(
        'Could not check for a UTXO address'
      );
    });

    it('sweeps nothing for a wallet that cannot have one, rather than throwing', async () => {
      const { wallet } = setupCounterwalletWallet();
      vi.mocked(isCounterwalletFormat).mockReturnValue(false);

      await expect(walletManager.sweepUtxoAddresses(wallet.id)).resolves.toEqual([]);
      expect(mockDetectUtxoAddress).not.toHaveBeenCalled();
    });

    it('turns away formats that cannot have one', async () => {
      const { wallet } = setupCounterwalletWallet();
      vi.mocked(isCounterwalletFormat).mockReturnValue(false);

      await expect(walletManager.addUtxoAddress(wallet.id, 0)).rejects.toThrow(
        'UTXO addresses exist only for Counterwallet address formats'
      );
    });

    it('turns away private key wallets, which have no branch to look on', async () => {
      const wallet = createPrivateKeyWallet();
      walletManager['wallets'] = [wallet];

      await expect(walletManager.addUtxoAddress(wallet.id, 0)).rejects.toThrow(
        'Only mnemonic wallets have UTXO addresses'
      );
    });
  });

  describe('Address Preview', () => {
    it('should get preview address for type', async () => {
      const wallet = createTestWallet();
      walletManager['wallets'] = [wallet];

      // Mock the wallet being unlocked with a mnemonic
      const mnemonic = 'test mnemonic phrase';
      mocks.sessionManager.getUnlockedSecret.mockResolvedValue(mnemonic);
      mocks.bitcoin.getAddressFromMnemonic.mockReturnValue('bc1qpreview');
      mocks.bitcoin.getDerivationPathForAddressFormat.mockReturnValue("m/84'/0'/0'");

      const preview = await walletManager.getPreviewAddressForFormat(wallet.id, AddressFormat.P2WPKH);

      expect(preview).toBe('bc1qpreview');
      expect(mocks.bitcoin.getAddressFromMnemonic).toHaveBeenCalledWith(
        mnemonic,
        "m/84'/0'/0'/0",
        AddressFormat.P2WPKH
      );
    });

    it('uses the stored hex field for a private-key wallet preview', async () => {
      const wallet = createPrivateKeyWallet();
      walletManager['wallets'] = [wallet];
      const privateKeyHex = '11'.repeat(32);
      mocks.sessionManager.getUnlockedSecret.mockResolvedValue(JSON.stringify({
        wif: 'Ltest',
        hex: privateKeyHex,
        compressed: true,
      }));
      vi.mocked(getAddressFromPrivateKey).mockReturnValue('1preview');

      await expect(
        walletManager.getPreviewAddressForFormat(wallet.id, AddressFormat.P2PKH)
      ).resolves.toBe('1preview');
      expect(getAddressFromPrivateKey).toHaveBeenCalledWith(
        privateKeyHex,
        AddressFormat.P2PKH,
        true
      );
    });

    it('should throw error for locked wallet', async () => {
      const wallet = createTestWallet();
      walletManager['wallets'] = [wallet];

      // Mock wallet is locked (no secret available)
      mocks.sessionManager.getUnlockedSecret.mockResolvedValue(null);

      await expect(
        walletManager.getPreviewAddressForFormat(wallet.id, AddressFormat.P2WPKH)
      ).rejects.toThrow('Wallet must be unlocked to get preview address');
    });

    it('should throw error for non-existent wallet', async () => {
      // Mock wallet is unlocked but doesn't exist in wallets array
      mocks.sessionManager.getUnlockedSecret.mockResolvedValue('test mnemonic');
      walletManager['wallets'] = []; // Empty wallets array

      await expect(
        walletManager.getPreviewAddressForFormat('non-existent', AddressFormat.P2WPKH)
      ).rejects.toThrow('Wallet not found');
    });
  });

  describe('Keychain Unlock', () => {
    it('refuses to create over an existing keychain when the session key is missing', async () => {
      vi.mocked(sessionManager.getKeychainMasterKey).mockResolvedValueOnce(null);
      vi.mocked(assertNoKeychainRecord).mockRejectedValue(
        new Error('A keychain already exists. Unlock it before adding a wallet.')
      );

      await expect(
        walletManager['getOrCreateKeychain']('test-password')
      ).rejects.toThrow('already exists');
      expect(saveKeychainRecord).not.toHaveBeenCalled();
    });

    it('should unlock keychain with correct password', async () => {
      const testWallet = createTestWallet();
      const keychain = createTestKeychain([testWallet]);
      const keychainRecord = createTestKeychainRecord();
      const mockMasterKey = {} as CryptoKey;

      // Setup mocks for unlock flow
      mocks.walletStorage.getKeychainRecord.mockResolvedValue(keychainRecord);
      mocks.keyBased.deriveKey.mockResolvedValue(mockMasterKey);
      mocks.keyBased.decryptJsonWithKey.mockResolvedValue(keychain);
      mocks.keyBased.decryptWithKey.mockResolvedValue('test mnemonic');
      mocks.bitcoin.getAddressFromMnemonic.mockReturnValue('bc1qtest');
      mocks.bitcoin.getDerivationPathForAddressFormat.mockReturnValue("m/84'/0'/0'");
      mocks.settingsStorage.getSettings.mockResolvedValue({ autoLockTimer: '5m' });

      await walletManager.unlockKeychain('test-password');

      // Should have derived key from password (via web worker)
      expect(deriveKeyAsync).toHaveBeenCalled();
      // Should have stored master key in session
      expect(mocks.sessionManager.storeKeychainMasterKey).toHaveBeenCalled();
      expect(
        vi.mocked(sessionManager.initializeSession).mock.invocationCallOrder[0]!
      ).toBeLessThan(
        vi.mocked(sessionManager.storeKeychainMasterKey).mock.invocationCallOrder[0]!
      );
    });

    it('should throw error when no keychain exists', async () => {
      mocks.walletStorage.getKeychainRecord.mockResolvedValue(null);

      await expect(walletManager.unlockKeychain('test-password')).rejects.toThrow(
        'No keychain found'
      );
    });
  });

  describe('Session Alarm Management', () => {
    it('should schedule session expiry alarm when unlocking keychain', async () => {
      const testWallet = createTestWallet();
      const keychain = createTestKeychain([testWallet]);
      const keychainRecord = createTestKeychainRecord();
      const mockMasterKey = {} as CryptoKey;

      // Setup mocks for unlock flow
      mocks.walletStorage.getKeychainRecord.mockResolvedValue(keychainRecord);
      mocks.keyBased.deriveKey.mockResolvedValue(mockMasterKey);
      mocks.keyBased.decryptJsonWithKey.mockResolvedValue(keychain);
      mocks.keyBased.decryptWithKey.mockResolvedValue('test mnemonic');
      mocks.bitcoin.getAddressFromMnemonic.mockReturnValue('bc1qtest');
      mocks.bitcoin.getDerivationPathForAddressFormat.mockReturnValue("m/84'/0'/0'");
      mocks.settingsStorage.getSettings.mockResolvedValue({ autoLockTimer: '5m' });

      await walletManager.unlockKeychain('test-password');

      // Should have initialized session with timeout
      expect(mocks.sessionManager.initializeSession).toHaveBeenCalledWith(5 * 60 * 1000);
      // Should have scheduled alarm
      expect(sessionManager.scheduleSessionExpiry).toHaveBeenCalledWith(5 * 60 * 1000);
    });

    it('should clear session expiry alarm when locking keychain', async () => {
      await walletManager.lockKeychain();

      // Should have cleared the alarm via sessionManager
      expect(sessionManager.clearSessionExpiry).toHaveBeenCalled();
    });

    it('should use default timeout if settings unavailable', async () => {
      const testWallet = createTestWallet();
      const keychain = createTestKeychain([testWallet]);
      const keychainRecord = createTestKeychainRecord();
      const mockMasterKey = {} as CryptoKey;

      // Setup mocks
      mocks.walletStorage.getKeychainRecord.mockResolvedValue(keychainRecord);
      mocks.keyBased.deriveKey.mockResolvedValue(mockMasterKey);
      mocks.keyBased.decryptJsonWithKey.mockResolvedValue(keychain);
      mocks.keyBased.decryptWithKey.mockResolvedValue('test mnemonic');
      mocks.bitcoin.getAddressFromMnemonic.mockReturnValue('bc1qtest');
      mocks.bitcoin.getDerivationPathForAddressFormat.mockReturnValue("m/84'/0'/0'");
      // Return empty settings (no autoLockTimer)
      mocks.settingsStorage.getSettings.mockResolvedValue({});

      await walletManager.unlockKeychain('test-password');

      // Should use default 5 minute timeout
      expect(mocks.sessionManager.initializeSession).toHaveBeenCalledWith(5 * 60 * 1000);
    });
  });

  describe('PSBT Signing', () => {
    it('uses the active address for fallback signing when signInputs is omitted', async () => {
      const wallet = createTestWallet({
        addresses: [
          { name: 'Address 1', address: 'bc1qfirst', path: "m/84'/0'/0'/0/0", pubKey: '02aa' },
          { name: 'Address 2', address: 'bc1qactive', path: "m/84'/0'/0'/0/1", pubKey: '02bb' },
        ],
      });
      walletManager['wallets'] = [wallet];
      walletManager['activeWalletId'] = wallet.id;
      vi.spyOn(walletManager, 'getSettings').mockReturnValue({ lastActiveAddress: 'bc1qactive' } as any);
      const privateKeySpy = vi.spyOn(walletManager, 'getPrivateKey').mockResolvedValue({
        hex: '11'.repeat(32),
        wif: 'test-wif',
        compressed: true,
      });

      const result = await walletManager.signPsbt('test-psbt');

      expect(result).toBe('signed-psbt');
      expect(privateKeySpy).toHaveBeenCalledWith(wallet.id, "m/84'/0'/0'/0/1");
      expect(signPSBT).toHaveBeenCalledWith(
        'test-psbt',
        '11'.repeat(32),
        [],
        AddressFormat.P2WPKH,
        undefined
      );
    });
  });
  describe('Message Signing', () => {
    it('derives and signs for the paired SegWit address without changing the active Legacy address', async () => {
      const wallet = createTestWallet({
        addressFormat: AddressFormat.P2PKH,
        addresses: [{
          name: 'Address 1',
          address: '1active',
          path: "m/44'/0'/0'/0/0",
          pubKey: '02aa',
        }],
      });
      walletManager['wallets'] = [wallet];
      walletManager['activeWalletId'] = wallet.id;
      vi.spyOn(walletManager, 'getPairedAddresses').mockResolvedValue({
        legacy: {
          name: 'Legacy',
          address: '1active',
          path: "m/44'/0'/0'/0/0",
          pubKey: '02aa',
          format: AddressFormat.P2PKH,
          type: 'p2pkh',
        },
        segwit: {
          name: 'SegWit',
          address: 'bc1qpaired',
          path: "m/84'/0'/0'/0/0",
          pubKey: '02aa',
          format: AddressFormat.P2WPKH,
          type: 'p2wpkh',
        },
      });
      const privateKeySpy = vi.spyOn(walletManager, 'getPrivateKey').mockResolvedValue({
        hex: '11'.repeat(32),
        wif: 'test-wif',
        compressed: true,
      });
      vi.mocked(signMessage).mockResolvedValue({ signature: 'signed', address: 'bc1qpaired' });

      await expect(walletManager.signMessage('hello', 'bc1qpaired')).resolves.toEqual({
        signature: 'signed',
        address: 'bc1qpaired',
      });

      expect(privateKeySpy).toHaveBeenCalledWith(wallet.id, "m/84'/0'/0'/0/0");
      expect(signMessage).toHaveBeenCalledWith(
        'hello',
        '11'.repeat(32),
        AddressFormat.P2WPKH,
        true,
      );
    });
  });
  describe('Mnemonic Access', () => {
    it('should get unencrypted mnemonic for unlocked wallet', async () => {
      const wallet = createTestWallet({ type: 'mnemonic' });
      walletManager['wallets'] = [wallet];

      const mnemonic = 'test mnemonic phrase';
      mocks.sessionManager.getUnlockedSecret.mockResolvedValue(mnemonic);

      const result = await walletManager.getUnencryptedMnemonic(wallet.id);

      expect(result).toBe(mnemonic);
    });

    it('should throw error for locked wallet', async () => {
      const wallet = createTestWallet();
      walletManager['wallets'] = [wallet];

      mocks.sessionManager.getUnlockedSecret.mockResolvedValue(null);

      await expect(
        walletManager.getUnencryptedMnemonic(wallet.id)
      ).rejects.toThrow('Wallet secret not found or locked');
    });

    it('should get secret for private key wallet', async () => {
      const wallet = createPrivateKeyWallet();
      walletManager['wallets'] = [wallet];

      const privateKeyData = JSON.stringify({ key: 'private-key-hex', compressed: true });
      mocks.sessionManager.getUnlockedSecret.mockResolvedValue(privateKeyData);

      const result = await walletManager.getUnencryptedMnemonic(wallet.id);

      expect(result).toBe(privateKeyData);
    });
  });

  describe('Keychain Status', () => {
    it('should return true when keychain is unlocked', async () => {
      const keychain = createTestKeychain([]);
      walletManager['keychain'] = keychain;
      mocks.sessionManager.getKeychainMasterKey.mockResolvedValue({} as CryptoKey);

      const result = await walletManager.isKeychainUnlocked();

      expect(result).toBe(true);
    });

    it('should return false when keychain is locked', async () => {
      mocks.sessionManager.getKeychainMasterKey.mockResolvedValue(null);

      const result = await walletManager.isKeychainUnlocked();

      expect(result).toBe(false);
    });
  });
});
