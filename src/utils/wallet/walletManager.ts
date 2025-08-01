import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes, bytesToHex } from '@noble/hashes/utils';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import * as sessionManager from '@/utils/auth/sessionManager';
import { settingsManager } from '@/utils/wallet';
import { getAllEncryptedWallets, addEncryptedWallet, updateEncryptedWallet, removeEncryptedWallet, EncryptedWalletRecord } from '@/utils/storage/walletStorage';
import { encryptMnemonic, decryptMnemonic, encryptPrivateKey, decryptPrivateKey, DecryptionError } from '@/utils/encryption';
import { AddressType, getAddressFromMnemonic, getPrivateKeyFromMnemonic, getAddressFromPrivateKey, getPublicKeyFromPrivateKey, decodeWIF, isWIF, getDerivationPathForAddressType } from '@/utils/blockchain/bitcoin';
import { getCounterwalletSeed } from '@/utils/blockchain/counterwallet';
import { KeychainSettings } from '@/utils/storage/settingsStorage';
import { signTransaction as btcSignTransaction } from '@/utils/blockchain/bitcoin/transactionSigner';
import { broadcastTransaction as btcBroadcastTransaction } from '@/utils/blockchain/bitcoin/transactionBroadcaster';

export interface Address {
  name: string;
  path: string;
  address: string;
  pubKey: string;
}

export interface Wallet {
  id: string;
  name: string;
  type: 'mnemonic' | 'privateKey';
  addressType: AddressType;
  addressCount: number;
  addresses: Address[];
}

const MAX_WALLETS = 20;
const MAX_ADDRESSES_PER_WALLET = 100;

export class WalletManager {
  private wallets: Wallet[] = [];
  private activeWalletId: string | null = null;

  public setLastActiveTime(): void {
    sessionManager.setLastActiveTime();
  }

  public async isAnyWalletUnlocked(): Promise<boolean> {
    for (const w of this.wallets) {
      if (sessionManager.getUnlockedSecret(w.id)) {
        return true;
      }
    }
    return false;
  }

  public async loadWallets(): Promise<void> {
    const encryptedRecords = await getAllEncryptedWallets();
    this.wallets = encryptedRecords.map((rec: EncryptedWalletRecord) => {
      const unlockedSecret = sessionManager.getUnlockedSecret(rec.id);
      let addresses: Address[] = [];
      if (unlockedSecret) {
        if (rec.type === 'mnemonic') {
          const count = rec.addressCount || 1;
          addresses = Array.from({ length: count }, (_, i) =>
            this.deriveMnemonicAddress(unlockedSecret, rec.addressType, i)
          );
        } else {
          addresses = [this.deriveAddressFromPrivateKey(unlockedSecret, rec.addressType)];
        }
      } else if (rec.previewAddress) {
        addresses = [{
          name: 'Address 1',
          path: '',
          address: rec.previewAddress,
          pubKey: '',
        }];
      }
      return {
        id: rec.id,
        name: rec.name,
        type: rec.type,
        addressType: rec.addressType,
        addressCount: rec.addressCount || 1,
        addresses,
      };
    });
    const settings: KeychainSettings = await settingsManager.loadSettings();
    if (settings.lastActiveWalletId && this.getWalletById(settings.lastActiveWalletId)) {
      this.activeWalletId = settings.lastActiveWalletId;
    }
  }

  public getWallets(): Wallet[] {
    return this.wallets;
  }

  public getActiveWallet(): Wallet | undefined {
    if (!this.activeWalletId) return undefined;
    return this.getWalletById(this.activeWalletId);
  }

  public setActiveWallet(walletId: string): void {
    this.activeWalletId = walletId;
    settingsManager.updateSettings({ lastActiveWalletId: walletId });
  }

  public getWalletById(id: string): Wallet | undefined {
    return this.wallets.find((w) => w.id === id);
  }

  public getWallet(walletId: string): Wallet | undefined {
    return this.getWalletById(walletId);
  }

  public getUnencryptedMnemonic(walletId: string): string {
    const secret = sessionManager.getUnlockedSecret(walletId);
    if (!secret) throw new Error("Wallet secret not found or locked");
    return secret;
  }

  public async createMnemonicWallet(
    mnemonic: string,
    password: string,
    name?: string,
    addressType: AddressType = AddressType.P2TR
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
    const previewPath = `${getDerivationPathForAddressType(addressType)}/0`;
    const previewAddress = getAddressFromMnemonic(mnemonic, previewPath, addressType);
    const record: EncryptedWalletRecord = {
      id,
      name: walletName,
      type: 'mnemonic',
      addressType,
      addressCount: 1,
      encryptedSecret: encryptedMnemonic,
      previewAddress,
    };
    await addEncryptedWallet(record);
    const wallet: Wallet = {
      id,
      name: walletName,
      type: 'mnemonic',
      addressType,
      addressCount: 1,
      addresses: [],
    };
    this.wallets.push(wallet);
    return wallet;
  }

  public async createPrivateKeyWallet(
    privateKey: string,
    password: string,
    name?: string,
    addressType: AddressType = AddressType.P2TR
  ): Promise<Wallet> {
    if (this.wallets.length >= MAX_WALLETS) {
      throw new Error(`Maximum number of wallets (${MAX_WALLETS}) reached`);
    }
    const walletName = name || `Wallet ${this.wallets.length + 1}`;
    let privateKeyHex: string;
    let compressed = true;
    if (isWIF(privateKey)) {
      const decoded = decodeWIF(privateKey);
      privateKeyHex = decoded.privateKey;
      compressed = decoded.compressed;
    } else {
      privateKeyHex = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
    }
    getPublicKeyFromPrivateKey(privateKeyHex, compressed);
    const secretJson = JSON.stringify({ key: privateKeyHex, compressed });
    const id = await this.generateWalletIdFromPrivateKey(privateKeyHex, addressType);
    if (this.wallets.some((w) => w.id === id)) {
      throw new Error('A wallet with this private key already exists.');
    }
    const encryptedPrivateKey = await encryptPrivateKey(secretJson, password);
    const previewAddress = getAddressFromPrivateKey(privateKeyHex, addressType, compressed);
    const record: EncryptedWalletRecord = {
      id,
      name: walletName,
      type: 'privateKey',
      addressType,
      addressCount: 1,
      encryptedSecret: encryptedPrivateKey,
      previewAddress,
    };
    await addEncryptedWallet(record);
    const wallet: Wallet = {
      id,
      name: walletName,
      type: 'privateKey',
      addressType,
      addressCount: 1,
      addresses: [],
    };
    this.wallets.push(wallet);
    return wallet;
  }

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
      this.activeWalletId = walletId;
    } catch (err) {
      if (err instanceof DecryptionError) throw err;
      throw new Error('Invalid password or corrupted data.');
    }
  }

  public lockWallet(walletId: string): void {
    sessionManager.clearUnlockedSecret(walletId);
    const wallet = this.getWalletById(walletId);
    if (wallet) {
      wallet.addresses = [];
    }
  }

  public lockAllWallets(): void {
    sessionManager.clearAllUnlockedSecrets();
    this.wallets.forEach((wallet) => (wallet.addresses = []));
  }

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

  public async removeWallet(walletId: string): Promise<void> {
    const idx = this.wallets.findIndex((w) => w.id === walletId);
    if (idx === -1) throw new Error('Wallet not found in memory.');
    
    this.wallets.splice(idx, 1);
    sessionManager.clearUnlockedSecret(walletId);
    await removeEncryptedWallet(walletId);
    
    if (this.activeWalletId === walletId) {
      this.activeWalletId = null;
    }

    await this.renumberWallets();
  }

  private async renumberWallets(): Promise<void> {
    for (let i = 0; i < this.wallets.length; i++) {
      const wallet = this.wallets[i];
      const newName = `Wallet ${i + 1}`;
      
      if (wallet.name.match(/^Wallet \d+$/)) {
        wallet.name = newName;
        
        const allRecords = await getAllEncryptedWallets();
        const record = allRecords.find((r) => r.id === wallet.id);
        if (record) {
          record.name = newName;
          await updateEncryptedWallet(record);
        }
      }
    }
  }

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

  public async resetAllWallets(password: string): Promise<void> {
    const valid = await this.verifyPassword(password);
    if (!valid) throw new Error('Invalid password');
    this.lockAllWallets();
    const all = await getAllEncryptedWallets();
    for (const rec of all) {
      await removeEncryptedWallet(rec.id);
    }
    this.wallets = [];
    sessionManager.clearAllUnlockedSecrets();
    this.activeWalletId = null;
  }

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

  public async updateWalletAddressType(walletId: string, newType: AddressType): Promise<void> {
    const wallet = this.getWalletById(walletId);
    if (!wallet) throw new Error('Wallet not found');
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
    record.previewAddress = wallet.addresses[0].address;
    
    await updateEncryptedWallet(record);

    if (this.activeWalletId === walletId) {
      this.setActiveWallet(walletId);
    }
  }

  /**
   * Updates the pinned assets in the global settings.
   * This method is kept for backward compatibility.
   * 
   * @param pinnedAssets - Array of asset IDs to pin
   */
  public async updateWalletPinnedAssets(pinnedAssets: string[]): Promise<void> {
    await settingsManager.updateSettings({ pinnedAssets });
  }

  public async getPrivateKey(walletId: string, derivationPath?: string): Promise<string> {
    const wallet = this.getWalletById(walletId);
    if (!wallet) throw new Error('Wallet not found.');
    const secret = sessionManager.getUnlockedSecret(walletId);
    if (!secret) throw new Error('Wallet is locked.');
    if (wallet.type === 'mnemonic') {
      const path =
        derivationPath ||
        (wallet.addresses[0]?.path ?? `${getDerivationPathForAddressType(wallet.addressType)}/0`);
      return getPrivateKeyFromMnemonic(secret, path, wallet.addressType);
    } else {
      const { key: privateKeyHex } = JSON.parse(secret);
      return privateKeyHex;
    }
  }

  public async createAndUnlockMnemonicWallet(
    mnemonic: string,
    password: string,
    name?: string,
    addressType: AddressType = AddressType.P2TR
  ): Promise<Wallet> {
    if (!name) {
      name = `Wallet ${this.wallets.length + 1}`;
    }
    const newWallet = await this.createMnemonicWallet(mnemonic, password, name, addressType);
    await this.unlockWallet(newWallet.id, password);
    this.setActiveWallet(newWallet.id);
    return newWallet;
  }

  public async createAndUnlockPrivateKeyWallet(
    privateKey: string,
    password: string,
    name?: string,
    addressType: AddressType = AddressType.P2TR
  ): Promise<Wallet> {
    if (!name) {
      name = `Wallet ${this.wallets.length + 1}`;
    }
    const newWallet = await this.createPrivateKeyWallet(privateKey, password, name, addressType);
    await this.unlockWallet(newWallet.id, password);
    this.setActiveWallet(newWallet.id);
    return newWallet;
  }

  public getPreviewAddressForType(walletId: string, addressType: AddressType): string {
    const secret = sessionManager.getUnlockedSecret(walletId);
    if (!secret) {
      throw new Error('Wallet is locked');
    }
    const wallet = this.getWalletById(walletId);
    if (!wallet) {
      throw new Error('Wallet not found');
    }
    if (wallet.type === 'mnemonic') {
      return getAddressFromMnemonic(
        secret,
        `${getDerivationPathForAddressType(addressType)}/0`,
        addressType
      );
    } else {
      const { key: privateKeyHex, compressed } = JSON.parse(secret);
      return getAddressFromPrivateKey(privateKeyHex, addressType, compressed);
    }
  }

  public async signTransaction(rawTxHex: string, sourceAddress: string): Promise<string> {
    if (!this.activeWalletId) throw new Error("No active wallet set");
    const wallet = this.getWalletById(this.activeWalletId);
    if (!wallet) throw new Error("Wallet not found");
    
    const targetAddress = wallet.addresses.find(addr => addr.address === sourceAddress);
    if (!targetAddress) throw new Error("Source address not found in wallet");
    
    const privateKeyHex = await this.getPrivateKey(wallet.id, targetAddress.path);
    return btcSignTransaction(rawTxHex, wallet, targetAddress, privateKeyHex);
  }

  public async broadcastTransaction(signedTxHex: string): Promise<{ txid: string; fees?: number }> {
    return btcBroadcastTransaction(signedTxHex);
  }

  private async generateWalletId(mnemonic: string, addressType: AddressType): Promise<string> {
    const seed = addressType === AddressType.Counterwallet ? getCounterwalletSeed(mnemonic) : mnemonicToSeedSync(mnemonic);
    const derivationPath = getDerivationPathForAddressType(addressType);
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

  private async generateWalletIdFromPrivateKey(privateKeyHex: string, addressType: AddressType): Promise<string> {
    const pubkeyCompressed = getPublicKeyFromPrivateKey(privateKeyHex, true);
    const combined = utf8ToBytes(pubkeyCompressed + addressType);
    const hash = sha256(combined);
    return bytesToHex(hash);
  }

  private deriveMnemonicAddress(mnemonic: string, addressType: AddressType, index: number): Address {
    const path = `${getDerivationPathForAddressType(addressType)}/${index}`;
    const address = getAddressFromMnemonic(mnemonic, path, addressType);
    const seed = addressType === AddressType.Counterwallet ? getCounterwalletSeed(mnemonic) : mnemonicToSeedSync(mnemonic);
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

  private deriveAddressFromPrivateKey(privKeyData: string, addressType: AddressType): Address {
    const { key: privateKeyHex, compressed } = JSON.parse(privKeyData);
    const address = getAddressFromPrivateKey(privateKeyHex, addressType, compressed);
    const pubKey = getPublicKeyFromPrivateKey(privateKeyHex, compressed);
    return {
      name: 'Address 1',
      path: '',
      address,
      pubKey,
    };
  }
}

export const walletManager = new WalletManager();
