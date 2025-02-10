import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes, bytesToHex } from '@noble/hashes/utils';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';

import * as sessionManager from '@/utils/auth/sessionManager';

import {
  getAllEncryptedWallets,
  addEncryptedWallet,
  updateEncryptedWallet,
  removeEncryptedWalletRecord,
  EncryptedWalletRecord,
} from '@/utils/storage/walletStorage';

import {
  encryptMnemonic,
  decryptMnemonic,
  encryptPrivateKey,
  decryptPrivateKey,
  DecryptionError,
} from '@/utils/encryption';

import {
  AddressType,
  getAddressFromMnemonic,
  getPrivateKeyFromMnemonic,
  getAddressFromPrivateKey,
  getPublicKeyFromPrivateKey,
  decodeWIF,
  isWIF,
  getDerivationPathForAddressType,
} from '@/utils/blockchain/bitcoin';

import { getCounterwalletSeed } from '@/utils/blockchain/counterwallet';

/** Represents a single derived Bitcoin address. */
export interface Address {
  name: string;
  path: string;
  address: string;
  pubKey: string;
}

/** Represents an in‑memory wallet (without storing decrypted secrets). */
export interface Wallet {
  id: string;
  name: string;
  type: 'mnemonic' | 'privateKey';
  addressType: AddressType;
  addressCount: number;
  addresses: Address[];
  pinnedAssetBalances: string[];
}

const MAX_WALLETS = 20;
const MAX_ADDRESSES_PER_WALLET = 100;
const DEFAULT_PINNED_ASSETS = ['XCP', 'PEPECASH', 'BITCRYSTALS', 'BITCORN', 'CROPS', 'MINTS'];

/**
 * WalletManager handles wallet creation, unlocking, and modifications.
 */
export class WalletManager {
  private wallets: Wallet[] = [];
  private activeWalletId: string | null = null;


  // Expose onAutoLock via getter and setter.
  public get onAutoLock(): (() => void) | undefined {
    return sessionManager.onAutoLock;
  }
  public set onAutoLock(callback: (() => void) | undefined) {
    sessionManager.setOnAutoLock(callback);
  }

  /**
   * Records user activity to prevent auto‑lock.
   */
  public setLastActiveTime(): void {
    sessionManager.setLastActiveTime();
  }

  /**
   * Checks if any wallet is currently unlocked.
   *
   * @returns A Promise that resolves to true if at least one wallet is unlocked.
   */
  public async isAnyWalletUnlocked(): Promise<boolean> {
    for (const w of this.wallets) {
      if (sessionManager.getUnlockedSecret(w.id)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Loads wallet metadata from persistent storage.
   */
  public async loadWallets(): Promise<void> {
    const encryptedRecords = await getAllEncryptedWallets();
    this.wallets = encryptedRecords.map((rec: EncryptedWalletRecord) => {
      // Check if a decrypted secret is stored for this wallet.
      const unlockedSecret = sessionManager.getUnlockedSecret(rec.id);
      let addresses: Address[] = [];
      if (unlockedSecret) {
        if (rec.type === 'mnemonic') {
          // For mnemonic wallets, derive addresses up to the stored count.
          const count = rec.addressCount || 1;
          addresses = Array.from({ length: count }, (_, i) =>
            this.deriveMnemonicAddress(unlockedSecret, rec.addressType, i)
          );
        } else {
          // For private-key wallets, derive the single address.
          addresses = [this.deriveAddressFromPrivateKey(unlockedSecret, rec.addressType)];
        }
      }
      return {
        id: rec.id,
        name: rec.name,
        type: rec.type,
        addressType: rec.addressType,
        addressCount: rec.addressCount || 1,
        addresses, // now contains derived addresses if unlocked
        pinnedAssetBalances: rec.pinnedAssetBalances || [],
      };
    });
  }

  /**
   * Returns all loaded wallets.
   */
  public getWallets(): Wallet[] {
    return this.wallets;
  }

  /**
   * Returns the active wallet (if any).
   */
  public getActiveWallet(): Wallet | undefined {
    if (!this.activeWalletId) return undefined;
    return this.getWalletById(this.activeWalletId);
  }

  /**
   * Sets the active wallet by its ID.
   *
   * @param walletId - The wallet ID to mark as active.
   */
  public setActiveWallet(walletId: string): void {
    this.activeWalletId = walletId;
  }

  /**
   * Retrieves a wallet by its ID.
   *
   * @param id - The wallet ID.
   * @returns The wallet if found; otherwise undefined.
   */
  public getWalletById(id: string): Wallet | undefined {
    return this.wallets.find((w) => w.id === id);
  }

  /**
   * Creates a new mnemonic-based wallet.
   *
   * @param mnemonic - The BIP39 or Counterwallet mnemonic.
   * @param password - The encryption password.
   * @param name - Optional wallet name.
   * @param addressType - The address derivation type (default is P2WPKH).
   * @returns A Promise that resolves to the created wallet.
   * @throws Error if the wallet limit is reached or if a duplicate wallet exists.
   */
  public async createMnemonicWallet(
    mnemonic: string,
    password: string,
    name?: string,
    addressType: AddressType = AddressType.P2WPKH
  ): Promise<Wallet> {
    if (this.wallets.length >= MAX_WALLETS) {
      throw new Error(`Maximum number of wallets (${MAX_WALLETS}) reached`);
    }
    const walletName = name || `Wallet ${this.wallets.length + 1}`;
    const id = await this.generateWalletId(mnemonic, addressType);
    if (this.wallets.some((w) => w.id === id)) {
      throw new Error('A wallet with this mnemonic+addressType combination already exists.');
    }
    const encryptedMnemonic = await encryptMnemonic(mnemonic, password, addressType);
    const record: EncryptedWalletRecord = {
      id,
      name: walletName,
      type: 'mnemonic',
      addressType,
      addressCount: 1,
      encryptedSecret: encryptedMnemonic,
      pinnedAssetBalances: [...DEFAULT_PINNED_ASSETS],
    };
    await addEncryptedWallet(record);
    const wallet: Wallet = {
      id,
      name: walletName,
      type: 'mnemonic',
      addressType,
      addressCount: 1,
      addresses: [],
      pinnedAssetBalances: [...DEFAULT_PINNED_ASSETS],
    };
    this.wallets.push(wallet);
    return wallet;
  }

  /**
   * Creates a new private-key wallet.
   *
   * @param privateKey - The private key in WIF or hexadecimal format.
   * @param password - The encryption password.
   * @param name - Optional wallet name.
   * @param addressType - The address derivation type (default is P2WPKH).
   * @returns A Promise that resolves to the created wallet.
   * @throws Error if the wallet limit is reached or if a duplicate wallet exists.
   */
  public async createPrivateKeyWallet(
    privateKey: string,
    password: string,
    name?: string,
    addressType: AddressType = AddressType.P2WPKH
  ): Promise<Wallet> {
    if (this.wallets.length >= MAX_WALLETS) {
      throw new Error(`Maximum number of wallets (${MAX_WALLETS}) reached`);
    }
    const walletName = name || `PK ${this.wallets.length + 1}`;
    let privateKeyHex: string;
    let compressed = true;
    if (isWIF(privateKey)) {
      const decoded = decodeWIF(privateKey);
      privateKeyHex = decoded.privateKey;
      compressed = decoded.compressed;
    } else {
      privateKeyHex = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
    }
    // Validate the private key by attempting to derive the public key.
    getPublicKeyFromPrivateKey(privateKeyHex, compressed);
    const secretJson = JSON.stringify({ key: privateKeyHex, compressed });
    const id = await this.generateWalletIdFromPrivateKey(privateKeyHex, addressType);
    if (this.wallets.some((w) => w.id === id)) {
      throw new Error('A wallet with this private key already exists.');
    }
    const encryptedPrivateKey = await encryptPrivateKey(secretJson, password);
    const record: EncryptedWalletRecord = {
      id,
      name: walletName,
      type: 'privateKey',
      addressType,
      addressCount: 1,
      encryptedSecret: encryptedPrivateKey,
      pinnedAssetBalances: [...DEFAULT_PINNED_ASSETS],
    };
    await addEncryptedWallet(record);
    const wallet: Wallet = {
      id,
      name: walletName,
      type: 'privateKey',
      addressType,
      addressCount: 1,
      addresses: [],
      pinnedAssetBalances: [...DEFAULT_PINNED_ASSETS],
    };
    this.wallets.push(wallet);
    return wallet;
  }

  /**
   * Unlocks a wallet using the provided password.
   *
   * @param walletId - The ID of the wallet to unlock.
   * @param password - The password to decrypt the wallet.
   * @throws Error if the wallet record is missing or if decryption fails.
   */
  public async unlockWallet(walletId: string, password: string): Promise<void> {
    const wallet = this.getWalletById(walletId);
    if (!wallet) throw new Error('Wallet not found in memory.');
    const allRecords = await getAllEncryptedWallets();
    const record = allRecords.find((r) => r.id === walletId);
    if (!record) throw new Error('Wallet record not found in storage.');

    try {
      if (record.type === 'mnemonic') {
        if (!record.encryptedSecret) throw new Error('Missing encrypted secret.');
        const mnemonic = await decryptMnemonic(record.encryptedSecret, password);
        sessionManager.storeUnlockedSecret(walletId, mnemonic);
        wallet.addresses = [];
        const count = Math.min(record.addressCount || 1, MAX_ADDRESSES_PER_WALLET);
        wallet.addressCount = count;
        for (let i = 0; i < count; i++) {
          wallet.addresses.push(this.deriveMnemonicAddress(mnemonic, wallet.addressType, i));
        }
      } else {
        if (!record.encryptedSecret) throw new Error('Missing encrypted secret.');
        const privKeyData = await decryptPrivateKey(record.encryptedSecret, password);
        sessionManager.storeUnlockedSecret(walletId, privKeyData);
        wallet.addresses = [this.deriveAddressFromPrivateKey(privKeyData, wallet.addressType)];
        wallet.addressCount = 1;
      }
      // *** The key fix: set the active wallet ID after a successful unlock ***
      this.activeWalletId = walletId;
    } catch (err) {
      console.error('Failed to unlock wallet', err);
      if (err instanceof DecryptionError) throw err;
      throw new Error('Invalid password or corrupted data.');
    }
    sessionManager.resetAutoLockTimer();
  }

  /**
   * Locks a specific wallet by clearing its unlocked secret and derived addresses.
   *
   * @param walletId - The wallet ID to lock.
   */
  public lockWallet(walletId: string): void {
    sessionManager.clearUnlockedSecret(walletId);
    const wallet = this.getWalletById(walletId);
    if (wallet) {
      wallet.addresses = [];
    }
  }

  /**
   * Locks all wallets.
   */
  public lockAllWallets(): void {
    sessionManager.clearAllUnlockedSecrets();
    this.wallets.forEach((wallet) => (wallet.addresses = []));
  }

  /**
   * Adds a new address to a mnemonic wallet.
   *
   * @param walletId - The wallet ID to update.
   * @returns A Promise that resolves to the newly derived address.
   * @throws Error if the wallet is not found, not mnemonic, locked, or at maximum address count.
   */
  public async addAddress(walletId: string): Promise<Address> {
    const wallet = this.getWalletById(walletId);
    if (!wallet) throw new Error('Wallet not found.');
    if (wallet.type !== 'mnemonic')
      throw new Error('Can only add addresses to a mnemonic wallet.');
    if (!sessionManager.getUnlockedSecret(walletId))
      throw new Error('Wallet is locked. Please unlock first.');
    if (wallet.addressCount >= MAX_ADDRESSES_PER_WALLET) {
      throw new Error(`Cannot exceed ${MAX_ADDRESSES_PER_WALLET} addresses.`);
    }
    const mnemonic = sessionManager.getUnlockedSecret(walletId)!;
    const index = wallet.addressCount;
    const newAddr = this.deriveMnemonicAddress(mnemonic, wallet.addressType, index);
    wallet.addresses.push(newAddr);
    wallet.addressCount++;
    const allRecords = await getAllEncryptedWallets();
    const record = allRecords.find((r) => r.id === walletId);
    if (!record) throw new Error('Missing storage record.');
    record.addressCount = wallet.addressCount;
    await updateEncryptedWallet(record);
    return newAddr;
  }

  /**
   * Removes a wallet from memory and persistent storage.
   *
   * @param walletId - The wallet ID to remove.
   * @throws Error if the wallet is not found.
   */
  public async removeWallet(walletId: string): Promise<void> {
    const idx = this.wallets.findIndex((w) => w.id === walletId);
    if (idx === -1) throw new Error('Wallet not found in memory.');
    this.wallets.splice(idx, 1);
    sessionManager.clearUnlockedSecret(walletId);
    await removeEncryptedWalletRecord(walletId);
    if (this.activeWalletId === walletId) {
      this.activeWalletId = null;
    }
  }

  /**
   * Verifies the given password by attempting to decrypt at least one wallet record.
   *
   * @param password - The password to verify.
   * @returns A Promise that resolves to true if decryption succeeds for any wallet.
   */
  public async verifyPassword(password: string): Promise<boolean> {
    const all = await getAllEncryptedWallets();
    for (const r of all) {
      try {
        if (r.type === 'mnemonic' && r.encryptedSecret) {
          await decryptMnemonic(r.encryptedSecret, password);
          return true;
        } else if (r.type === 'privateKey' && r.encryptedSecret) {
          await decryptPrivateKey(r.encryptedSecret, password);
          return true;
        }
      } catch {
        continue;
      }
    }
    return false;
  }

  /**
   * Resets all wallets by removing all encrypted records and clearing memory.
   *
   * @param password - The current password for verification.
   * @throws Error if the password is invalid.
   */
  public async resetAllWallets(password: string): Promise<void> {
    const valid = await this.verifyPassword(password);
    if (!valid) throw new Error('Invalid password');
    this.lockAllWallets();
    const all = await getAllEncryptedWallets();
    for (const rec of all) {
      await removeEncryptedWalletRecord(rec.id);
    }
    this.wallets = [];
    sessionManager.clearAllUnlockedSecrets();
    this.activeWalletId = null;
  }

  /**
   * Updates the password used to encrypt all wallet secrets.
   *
   * @param currentPassword - The current password.
   * @param newPassword - The new password.
   * @throws Error if the current password is incorrect.
   */
  public async updatePassword(currentPassword: string, newPassword: string): Promise<void> {
    const valid = await this.verifyPassword(currentPassword);
    if (!valid) throw new Error('Current password is incorrect');
    const all = await getAllEncryptedWallets();
    for (const rec of all) {
      if (rec.type === 'mnemonic' && rec.encryptedSecret) {
        const mnemonic = await decryptMnemonic(rec.encryptedSecret, currentPassword);
        const newEnc = await encryptMnemonic(mnemonic, newPassword, rec.addressType);
        rec.encryptedSecret = newEnc;
        await updateEncryptedWallet(rec);
      } else if (rec.type === 'privateKey' && rec.encryptedSecret) {
        const pkData = await decryptPrivateKey(rec.encryptedSecret, currentPassword);
        const newEnc = await encryptPrivateKey(pkData, newPassword);
        rec.encryptedSecret = newEnc;
        await updateEncryptedWallet(rec);
      }
    }
    this.lockAllWallets();
  }

  /**
   * Updates the address type for a mnemonic wallet.
   *
   * @param walletId - The wallet ID to update.
   * @param newType - The new address type.
   * @throws Error if the wallet is not found, not mnemonic, or locked.
   */
  public async updateWalletAddressType(walletId: string, newType: AddressType): Promise<void> {
    const wallet = this.getWalletById(walletId);
    if (!wallet) throw new Error('Wallet not found.');
    if (wallet.type !== 'mnemonic') {
      throw new Error('Only mnemonic wallets can change address type.');
    }
    const mnemonic = sessionManager.getUnlockedSecret(walletId);
    if (!mnemonic) {
      throw new Error('Wallet is locked. Please unlock first.');
    }
    wallet.addressType = newType;
    wallet.addressCount = 1;
    wallet.addresses = [this.deriveMnemonicAddress(mnemonic, newType, 0)];
    const allRecords = await getAllEncryptedWallets();
    const record = allRecords.find((r) => r.id === walletId);
    if (!record) throw new Error('Missing storage record.');
    record.addressType = newType;
    record.addressCount = 1;
    await updateEncryptedWallet(record);
  }

  /**
   * Updates the list of pinned assets for a wallet.
   *
   * @param walletId - The wallet ID.
   * @param pinned - The new array of pinned asset identifiers.
   * @throws Error if the wallet is not found.
   */
  public async updateWalletPinnedAssets(walletId: string, pinned: string[]): Promise<void> {
    const wallet = this.getWalletById(walletId);
    if (!wallet) throw new Error('Wallet not found.');
    wallet.pinnedAssetBalances = pinned;
    const allRecords = await getAllEncryptedWallets();
    const record = allRecords.find((r) => r.id === walletId);
    if (!record) throw new Error('Missing storage record.');
    record.pinnedAssetBalances = pinned;
    await updateEncryptedWallet(record);
  }

  /**
   * Retrieves the private key for a wallet.
   *
   * @param walletId - The wallet ID.
   * @param pathIndex - For mnemonic wallets, the derivation index (default is 0).
   * @returns A Promise that resolves to the private key in hexadecimal.
   * @throws Error if the wallet is not found or locked.
   */
  public async getPrivateKey(walletId: string, pathIndex = 0): Promise<string> {
    const wallet = this.getWalletById(walletId);
    if (!wallet) throw new Error('Wallet not found.');
    const secret = sessionManager.getUnlockedSecret(walletId);
    if (!secret) throw new Error('Wallet is locked.');
    if (wallet.type === 'mnemonic') {
      const path = `${getDerivationPathForAddressType(wallet.addressType)}/${pathIndex}`;
      return getPrivateKeyFromMnemonic(secret, path, wallet.addressType);
    } else {
      const { key: privateKeyHex } = JSON.parse(secret);
      return privateKeyHex;
    }
  }

  /**
   * Creates and unlocks a new mnemonic wallet in one operation.
   * 
   * @param mnemonic - The BIP39 or Counterwallet mnemonic
   * @param password - The encryption password
   * @param name - Optional wallet name (will be auto-generated if not provided)
   * @param addressType - The address derivation type (default is P2WPKH)
   * @returns A Promise that resolves to the created and unlocked wallet
   */
  public async createAndUnlockMnemonicWallet(
    mnemonic: string,
    password: string,
    name?: string,
    addressType: AddressType = AddressType.P2WPKH
  ): Promise<Wallet> {
    // Generate wallet name if not provided
    if (!name) {
      const mnemonicWallets = this.wallets.filter(w => w.type === 'mnemonic');
      name = `Wallet ${mnemonicWallets.length + 1}`;
    }

    // Create the wallet
    const newWallet = await this.createMnemonicWallet(mnemonic, password, name, addressType);
    
    // Unlock it immediately
    await this.unlockWallet(newWallet.id, password);
    
    return newWallet;
  }

  // ---------------------------
  // Private helper methods
  // ---------------------------

  /**
   * Generates a wallet ID for a mnemonic wallet.
   *
   * @param mnemonic - The wallet's mnemonic.
   * @param addressType - The address derivation type.
   * @returns A Promise that resolves to the wallet ID as a hexadecimal string.
   */
  private async generateWalletId(mnemonic: string, addressType: AddressType): Promise<string> {
    const seed =
      addressType === AddressType.Counterwallet
        ? getCounterwalletSeed(mnemonic)
        : mnemonicToSeedSync(mnemonic);
    const derivationPath = getDerivationPathForAddressType(addressType);
    // Use all but the last segment for the account node.
    const pathParts = derivationPath.split('/').slice(0, -1).join('/');
    const root = HDKey.fromMasterSeed(seed);
    const accountNode = root.derive(pathParts);
    if (!accountNode.publicKey) {
      throw new Error('Unable to derive public key for ID creation.');
    }
    const xpub = accountNode.publicExtendedKey;
    const xpubHash = sha256(utf8ToBytes(xpub));
    const typeHash = sha256(utf8ToBytes(addressType));
    const combined = new Uint8Array([...xpubHash, ...typeHash]);
    const finalHash = sha256(combined);
    return bytesToHex(finalHash);
  }

  /**
   * Generates a wallet ID for a private-key wallet.
   *
   * @param privateKeyHex - The private key in hexadecimal.
   * @param addressType - The address derivation type.
   * @returns A Promise that resolves to the wallet ID as a hexadecimal string.
   */
  private async generateWalletIdFromPrivateKey(privateKeyHex: string, addressType: AddressType): Promise<string> {
    const pubkeyCompressed = getPublicKeyFromPrivateKey(privateKeyHex, true);
    const combined = utf8ToBytes(pubkeyCompressed + addressType);
    const hash = sha256(combined);
    return bytesToHex(hash);
  }

  /**
   * Derives a single address from a mnemonic wallet.
   *
   * @param mnemonic - The wallet mnemonic.
   * @param addressType - The address type.
   * @param index - The derivation index.
   * @returns A derived Address.
   */
  private deriveMnemonicAddress(mnemonic: string, addressType: AddressType, index: number): Address {
    const path = `${getDerivationPathForAddressType(addressType)}/${index}`;
    const address = getAddressFromMnemonic(mnemonic, path, addressType);
    // Recompute the public key.
    const seed =
      addressType === AddressType.Counterwallet
        ? getCounterwalletSeed(mnemonic)
        : mnemonicToSeedSync(mnemonic);
    const root = HDKey.fromMasterSeed(seed);
    const child = root.derive(path);
    if (!child.publicKey) {
      throw new Error('Unable to derive public key');
    }
    const pubKeyHex = bytesToHex(child.publicKey);
    return {
      name: `Address ${index + 1}`,
      path,
      address,
      pubKey: pubKeyHex,
    };
  }

  /**
   * Derives an address from a private-key wallet.
   *
   * @param privKeyData - The JSON string containing the private key data.
   * @param addressType - The address type.
   * @returns A derived Address.
   * @throws Error if the JSON is invalid.
   */
  private deriveAddressFromPrivateKey(privKeyData: string, addressType: AddressType): Address {
    try {
      const { key: privateKeyHex, compressed } = JSON.parse(privKeyData);
      const address = getAddressFromPrivateKey(privateKeyHex, addressType, compressed);
      const pubKey = getPublicKeyFromPrivateKey(privateKeyHex, compressed);
      return {
        name: 'Address 1',
        path: '',
        address,
        pubKey,
      };
    } catch (err) {
      throw new Error('Invalid privateKey JSON');
    }
  }
}

export const walletManager = new WalletManager();
