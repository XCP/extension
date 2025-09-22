import { sha256 } from '@noble/hashes/sha2';
import { utf8ToBytes, bytesToHex } from '@noble/hashes/utils';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import * as sessionManager from '@/utils/auth/sessionManager';
import { settingsManager } from '@/utils/wallet/settingsManager';
import { getAllEncryptedWallets, addEncryptedWallet, updateEncryptedWallet, removeEncryptedWallet, EncryptedWalletRecord } from '@/utils/storage/walletStorage';
import { encryptMnemonic, decryptMnemonic, encryptPrivateKey, decryptPrivateKey, DecryptionError } from '@/utils/encryption';
import { getAddressFromMnemonic, getPrivateKeyFromMnemonic, getAddressFromPrivateKey, getPublicKeyFromPrivateKey, decodeWIF, isWIF, getDerivationPathForAddressFormat, signMessage, isCounterwalletFormat } from '@/utils/blockchain/bitcoin';
import { AddressFormat } from '@/utils/blockchain/bitcoin';
import { getCounterwalletSeed } from '@/utils/blockchain/counterwallet';
import { KeychainSettings } from '@/utils/storage/settingsStorage';
import { signTransaction as btcSignTransaction, broadcastTransaction as btcBroadcastTransaction } from '@/utils/blockchain/bitcoin';

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
  addressFormat: AddressFormat;
  addressCount: number;
  addresses: Address[];
  isTestOnly?: boolean;
}

export const MAX_WALLETS = 20;
export const MAX_ADDRESSES_PER_WALLET = 100;

export class WalletManager {
  private wallets: Wallet[] = [];
  private activeWalletId: string | null = null;

  public async setLastActiveTime(): Promise<void> {
    await sessionManager.setLastActiveTime();
  }

  public async isAnyWalletUnlocked(): Promise<boolean> {
    for (const w of this.wallets) {
      if (await sessionManager.getUnlockedSecret(w.id)) {
        return true;
      }
    }
    return false;
  }

  public async loadWallets(): Promise<void> {
    const encryptedRecords = await getAllEncryptedWallets();
    this.wallets = await Promise.all(encryptedRecords.map(async (rec: EncryptedWalletRecord) => {
      const unlockedSecret = await sessionManager.getUnlockedSecret(rec.id);
      let addresses: Address[] = [];
      if (unlockedSecret) {
        if (rec.type === 'mnemonic') {
          const count = rec.addressCount || 1;
          addresses = Array.from({ length: count }, (_, i) =>
            this.deriveMnemonicAddress(unlockedSecret, rec.addressFormat, i)
          );
        } else if (rec.isTestOnly) {
          // Special handling for test wallets - parse the test data
          try {
            const testData = JSON.parse(unlockedSecret);
            if (testData.isTestWallet && testData.address) {
              addresses = [{
                name: "Test Address",
                path: "m/test",
                address: testData.address,
                pubKey: ''
              }];
            }
          } catch (e) {
            console.warn('Failed to parse test wallet data:', e);
            addresses = [];
          }
        } else {
          addresses = [this.deriveAddressFromPrivateKey(unlockedSecret, rec.addressFormat)];
        }
      } else {
        // Try to get preview from addressPreviews first, then fall back to previewAddress
        const preview = rec.addressPreviews?.[rec.addressFormat] || rec.previewAddress;
        if (preview) {
          addresses = [{
            name: 'Address 1',
            path: '',
            address: preview,
            pubKey: '',
          }];
        }
      }
      return {
        id: rec.id,
        name: rec.name,
        type: rec.type,
        addressFormat: rec.addressFormat,
        addressCount: rec.addressCount || 1,
        addresses,
        isTestOnly: rec.isTestOnly,
      };
    }));
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

  public async getUnencryptedMnemonic(walletId: string): Promise<string> {
    const secret = await sessionManager.getUnlockedSecret(walletId);
    if (!secret) throw new Error("Wallet secret not found or locked");
    return secret;
  }

  public async createMnemonicWallet(
    mnemonic: string,
    password: string,
    name?: string,
    addressFormat: AddressFormat = AddressFormat.P2TR
  ): Promise<Wallet> {
    if (this.wallets.length >= MAX_WALLETS) {
      throw new Error(`Maximum number of wallets (${MAX_WALLETS}) reached`);
    }
    const walletName = name || `Wallet ${this.wallets.length + 1}`;
    const id = await this.generateWalletId(mnemonic, addressFormat);
    if (this.wallets.some((w) => w.id === id)) {
      throw new Error('A wallet with this mnemonic+addressType combination already exists.');
    }
    const encryptedMnemonic = await encryptMnemonic(mnemonic, password, addressFormat);
    const previewPath = `${getDerivationPathForAddressFormat(addressFormat)}/0`;
    const previewAddress = getAddressFromMnemonic(mnemonic, previewPath, addressFormat);
    const record: EncryptedWalletRecord = {
      id,
      name: walletName,
      type: 'mnemonic',
      addressFormat,
      addressCount: 1,
      encryptedSecret: encryptedMnemonic,
      previewAddress,  // Keep for backward compatibility
      addressPreviews: {
        [addressFormat]: previewAddress,
      },
    };
    await addEncryptedWallet(record);
    const wallet: Wallet = {
      id,
      name: walletName,
      type: 'mnemonic',
      addressFormat,
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
    addressFormat: AddressFormat = AddressFormat.P2TR
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
    const id = await this.generateWalletIdFromPrivateKey(privateKeyHex, addressFormat);
    if (this.wallets.some((w) => w.id === id)) {
      throw new Error('A wallet with this private key already exists.');
    }
    const encryptedPrivateKey = await encryptPrivateKey(secretJson, password);
    const previewAddress = getAddressFromPrivateKey(privateKeyHex, addressFormat, compressed);
    const record: EncryptedWalletRecord = {
      id,
      name: walletName,
      type: 'privateKey',
      addressFormat,
      addressCount: 1,
      encryptedSecret: encryptedPrivateKey,
      previewAddress,  // Keep for backward compatibility
      addressPreviews: {
        [addressFormat]: previewAddress,
      },
    };
    await addEncryptedWallet(record);
    const wallet: Wallet = {
      id,
      name: walletName,
      type: 'privateKey',
      addressFormat,
      addressCount: 1,
      addresses: [],
    };
    this.wallets.push(wallet);
    return wallet;
  }

  public async importTestAddress(
    address: string,
    name?: string
  ): Promise<Wallet> {
    // Development-only feature for UI testing with watch-only addresses
    if (process.env.NODE_ENV !== 'development') {
      throw new Error('Test address import is only available in development mode');
    }

    // Basic validation - just check if it looks like a Bitcoin address
    if (!address.match(/^[13bc][a-km-zA-HJ-NP-Z0-9]{25,62}$/)) {
      throw new Error('Invalid Bitcoin address format');
    }

    // Detect address format from the address string
    let addressFormat: AddressFormat;
    if (address.startsWith('1')) {
      addressFormat = AddressFormat.P2PKH;
    } else if (address.startsWith('3')) {
      addressFormat = AddressFormat.P2SH_P2WPKH;
    } else if (address.startsWith('bc1q')) {
      addressFormat = AddressFormat.P2WPKH;
    } else if (address.startsWith('bc1p')) {
      addressFormat = AddressFormat.P2TR;
    } else {
      addressFormat = AddressFormat.P2PKH; // Default
    }

    // Generate proper SHA-256 hash ID for test wallet (similar to private key wallets)
    const testData = `TEST_WALLET_${address}_${addressFormat}_${Date.now()}`;
    const hash = sha256(utf8ToBytes(testData));
    const id = bytesToHex(hash);
    const walletName = name || `Test: ${address.slice(0, 8)}...`;

    // Create a special encrypted record that marks this as test-only
    // We use a special format that won't decrypt to a valid private key
    const testMarker = {
      isTestWallet: true,
      address: address,
      warning: 'This is a test wallet for UI development only. It cannot sign transactions.'
    };
    
    // Create a fake encrypted private key structure for consistency
    // This allows the wallet to work with existing code but won't decrypt properly
    const fakeEncrypted = {
      v: 1,
      e: JSON.stringify(testMarker),
      t: 'test',
      s: 'test'
    };
    
    const record: EncryptedWalletRecord = {
      id,
      name: walletName,
      encryptedSecret: fakeEncrypted as any,
      type: 'privateKey',
      addressFormat,
      createdAt: Date.now(),
      isTestOnly: true,
    } as any;
    
    await addEncryptedWallet(record);
    
    // Create wallet object with the test address
    const wallet: Wallet = {
      id,
      name: walletName,
      type: 'privateKey',
      addressFormat,
      addressCount: 1,
      addresses: [{
        name: "Test Address",
        path: "m/test", // Fake path for test addresses
        address: address,
        pubKey: '' // No real public key for test addresses
      }],
      isTestOnly: true,
    };
    
    this.wallets.push(wallet);
    
    // Set as active wallet
    this.activeWalletId = id;
    
    // Set the test address as the last active address
    await settingsManager.updateSettings({ 
      lastActiveWalletId: id,
      lastActiveAddress: address 
    });
    
    // Store a fake "unlocked" secret so the wallet appears unlocked
    // This will prevent signing but allow UI testing
    sessionManager.storeUnlockedSecret(id, JSON.stringify({
      isTestWallet: true,
      address: address
    }));
    
    return wallet;
  }

  public async unlockWallet(walletId: string, password: string): Promise<void> {
    const wallet = this.getWalletById(walletId);
    if (!wallet) throw new Error('Wallet not found in memory.');
    const allRecords = await getAllEncryptedWallets();
    const record = allRecords.find((r) => r.id === walletId);
    if (!record) throw new Error('Wallet record not found in storage.');
    
    // Special handling for test wallets
    if (record.isTestOnly) {
      // Test wallets are always "unlocked" - just restore the address
      const testData = JSON.parse((record.encryptedSecret as any).e);
      wallet.addresses = [{
        name: "Test Address",
        path: "m/test",
        address: testData.address,
        pubKey: ''
      }];
      wallet.addressCount = 1;
      this.activeWalletId = walletId;
      
      // Store fake secret for test wallet
      sessionManager.storeUnlockedSecret(walletId, JSON.stringify(testData));
      return;
    }
    
    try {
      if (record.type === 'mnemonic') {
        if (!record.encryptedSecret) throw new Error('Missing encrypted secret.');
        const mnemonic = await decryptMnemonic(record.encryptedSecret, password);
        sessionManager.storeUnlockedSecret(walletId, mnemonic);
        wallet.addresses = [];
        const count = Math.min(record.addressCount || 1, MAX_ADDRESSES_PER_WALLET);
        wallet.addressCount = count;
        for (let i = 0; i < count; i++) {
          wallet.addresses.push(this.deriveMnemonicAddress(mnemonic, wallet.addressFormat, i));
        }
      } else {
        if (!record.encryptedSecret) throw new Error('Missing encrypted secret.');
        const privKeyData = await decryptPrivateKey(record.encryptedSecret, password);
        sessionManager.storeUnlockedSecret(walletId, privKeyData);
        wallet.addresses = [this.deriveAddressFromPrivateKey(privKeyData, wallet.addressFormat)];
        wallet.addressCount = 1;
      }

      // Don't override the active wallet when unlocking
      // The active wallet should be preserved from settings (lastActiveWalletId)
      // Only set it if there's no active wallet yet
      if (!this.activeWalletId) {
        this.activeWalletId = walletId;
      }

      // Initialize session with timeout from settings
      const settings = await settingsManager.getSettings();
      const timeout = settings?.autoLockTimeout || 5 * 60 * 1000; // Default 5 minutes
      await sessionManager.initializeSession(timeout);
      
      // Set up session expiry alarm
      await this.scheduleSessionExpiry(timeout);
      
      // Cache address previews for all formats
      await this.cacheAddressPreviews(walletId);
    } catch (err) {
      if (err instanceof DecryptionError) throw err;
      throw new Error('Invalid password or corrupted data.');
    }
  }
  
  private async scheduleSessionExpiry(timeout: number): Promise<void> {
    // Check if chrome.alarms is available
    if (!chrome?.alarms) {
      return; // Silently skip if alarms not available (e.g., in tests)
    }
    
    // Clear any existing alarm
    await chrome.alarms.clear('session-expiry');
    
    // Schedule new alarm for when session should expire
    await chrome.alarms.create('session-expiry', {
      when: Date.now() + timeout
    });
  }

  /**
   * Cache address previews for all address formats when wallet is unlocked
   * This allows the settings page to show real addresses even when wallet is locked later
   */
  private async cacheAddressPreviews(walletId: string): Promise<void> {
    try {
      const wallet = this.getWalletById(walletId);
      if (!wallet) return;
      
      const secret = await sessionManager.getUnlockedSecret(walletId);
      if (!secret) return;
      
      const previews: { [key in AddressFormat]?: string } = {};
      const formats = Object.values(AddressFormat) as AddressFormat[];
      
      for (const format of formats) {
        try {
          let address: string;
          
          if (wallet.type === 'mnemonic') {
            // Generate first address for this format
            address = getAddressFromMnemonic(
              secret,
              `${getDerivationPathForAddressFormat(format)}/0`,
              format
            );
          } else {
            // For private key wallets, generate address in the format
            const { key: privateKeyHex, compressed } = JSON.parse(secret);
            address = getAddressFromPrivateKey(privateKeyHex, format, compressed);
          }
          
          previews[format] = address;
        } catch (err) {
          // Some formats might not be supported for certain wallet types
          console.debug(`Could not generate ${format} preview for wallet ${walletId}:`, err);
        }
      }
      
      // Save previews directly to wallet record
      const allRecords = await getAllEncryptedWallets();
      const record = allRecords.find((r) => r.id === walletId);
      if (record) {
        record.addressPreviews = previews;
        await updateEncryptedWallet(record);
      }
    } catch (error) {
      console.error('Error caching address previews:', error);
      // Don't throw - this is a non-critical operation
    }
  }

  public async lockWallet(walletId: string): Promise<void> {
    sessionManager.clearUnlockedSecret(walletId);
    const wallet = this.getWalletById(walletId);
    if (wallet) {
      wallet.addresses = [];
    }
  }

  public async lockAllWallets(): Promise<void> {
    await sessionManager.clearAllUnlockedSecrets();
    this.wallets.forEach((wallet) => (wallet.addresses = []));
    
    // Clear session expiry alarm
    if (chrome?.alarms) {
      await chrome.alarms.clear('session-expiry');
    }
  }

  public async addAddress(walletId: string): Promise<Address> {
    const wallet = this.getWalletById(walletId);
    if (!wallet) throw new Error('Wallet not found.');
    if (wallet.type !== 'mnemonic')
      throw new Error('Can only add addresses to a mnemonic wallet.');
    const mnemonic = await sessionManager.getUnlockedSecret(walletId);
    if (!mnemonic)
      throw new Error('Wallet is locked. Please unlock first.');
    if (wallet.addressCount >= MAX_ADDRESSES_PER_WALLET) {
      throw new Error(`Cannot exceed ${MAX_ADDRESSES_PER_WALLET} addresses.`);
    }
    const index = wallet.addressCount;
    const newAddr = this.deriveMnemonicAddress(mnemonic, wallet.addressFormat, index);
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
    // Address previews are removed automatically with the wallet record
    
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
    await this.lockAllWallets();
    const all = await getAllEncryptedWallets();
    for (const rec of all) {
      await removeEncryptedWallet(rec.id);
    }
    this.wallets = [];
    await sessionManager.clearAllUnlockedSecrets();
    this.activeWalletId = null;
  }

  public async updatePassword(currentPassword: string, newPassword: string): Promise<void> {
    const valid = await this.verifyPassword(currentPassword);
    if (!valid) throw new Error('Current password is incorrect');
    const all = await getAllEncryptedWallets();
    for (const rec of all) {
      if (rec.type === 'mnemonic' && rec.encryptedSecret) {
        const mnemonic = await decryptMnemonic(rec.encryptedSecret, currentPassword);
        const newEnc = await encryptMnemonic(mnemonic, newPassword, rec.addressFormat);
        rec.encryptedSecret = newEnc;
        await updateEncryptedWallet(rec);
      } else if (rec.type === 'privateKey' && rec.encryptedSecret) {
        const pkData = await decryptPrivateKey(rec.encryptedSecret, currentPassword);
        const newEnc = await encryptPrivateKey(pkData, newPassword);
        rec.encryptedSecret = newEnc;
        await updateEncryptedWallet(rec);
      }
    }
    await this.lockAllWallets();
  }

  public async updateWalletAddressFormat(walletId: string, newType: AddressFormat): Promise<void> {
    const wallet = this.getWalletById(walletId);
    if (!wallet) throw new Error('Wallet not found');
    if (wallet.type !== 'mnemonic') {
      throw new Error('Only mnemonic wallets can change address type.');
    }
    const mnemonic = await sessionManager.getUnlockedSecret(walletId);
    if (!mnemonic) {
      throw new Error('Wallet is locked. Please unlock first.');
    }

    wallet.addressFormat = newType;
    wallet.addressCount = 1;
    wallet.addresses = [this.deriveMnemonicAddress(mnemonic, newType, 0)];

    const allRecords = await getAllEncryptedWallets();
    const record = allRecords.find((r) => r.id === walletId);
    if (!record) throw new Error('Missing storage record.');
    
    record.addressFormat = newType;
    record.addressCount = 1;
    record.previewAddress = wallet.addresses[0].address;  // Keep for backward compatibility
    
    // Update addressPreviews for the new format
    if (!record.addressPreviews) {
      record.addressPreviews = {};
    }
    record.addressPreviews[newType] = wallet.addresses[0].address;
    
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

  public async getPrivateKey(walletId: string, derivationPath?: string): Promise<{ key: string; compressed: boolean }> {
    const wallet = this.getWalletById(walletId);
    if (!wallet) throw new Error('Wallet not found.');
    const secret = await sessionManager.getUnlockedSecret(walletId);
    if (!secret) throw new Error('Wallet is locked.');
    
    if (wallet.type === 'mnemonic') {
      // Mnemonic wallets always use compressed keys
      const path =
        derivationPath ||
        (wallet.addresses[0]?.path ?? `${getDerivationPathForAddressFormat(wallet.addressFormat)}/0`);
      return {
        key: getPrivateKeyFromMnemonic(secret, path, wallet.addressFormat),
        compressed: true
      };
    } else {
      // Private key wallets store the compression flag
      const { key: privateKeyHex, compressed } = JSON.parse(secret);
      return { key: privateKeyHex, compressed };
    }
  }

  public async createAndUnlockMnemonicWallet(
    mnemonic: string,
    password: string,
    name?: string,
    addressFormat: AddressFormat = AddressFormat.P2TR
  ): Promise<Wallet> {
    if (!name) {
      name = `Wallet ${this.wallets.length + 1}`;
    }
    const newWallet = await this.createMnemonicWallet(mnemonic, password, name, addressFormat);
    await this.unlockWallet(newWallet.id, password);
    this.setActiveWallet(newWallet.id);
    return newWallet;
  }

  public async createAndUnlockPrivateKeyWallet(
    privateKey: string,
    password: string,
    name?: string,
    addressFormat: AddressFormat = AddressFormat.P2TR
  ): Promise<Wallet> {
    if (!name) {
      name = `Wallet ${this.wallets.length + 1}`;
    }
    const newWallet = await this.createPrivateKeyWallet(privateKey, password, name, addressFormat);
    await this.unlockWallet(newWallet.id, password);
    this.setActiveWallet(newWallet.id);
    return newWallet;
  }

  public async getPreviewAddressForFormat(walletId: string, addressFormat: AddressFormat): Promise<string> {
    // First check if we have a cached preview
    const allRecords = await getAllEncryptedWallets();
    const record = allRecords.find((r) => r.id === walletId);
    
    if (record?.addressPreviews?.[addressFormat]) {
      return record.addressPreviews[addressFormat];
    }
    
    // If no cached preview, generate it (requires wallet to be unlocked)
    const secret = await sessionManager.getUnlockedSecret(walletId);
    if (!secret) {
      throw new Error('Wallet is locked and no cached preview available');
    }
    
    const wallet = this.getWalletById(walletId);
    if (!wallet) {
      throw new Error('Wallet not found');
    }
    
    let address: string;
    if (wallet.type === 'mnemonic') {
      address = getAddressFromMnemonic(
        secret,
        `${getDerivationPathForAddressFormat(addressFormat)}/0`,
        addressFormat
      );
    } else {
      const { key: privateKeyHex, compressed } = JSON.parse(secret);
      address = getAddressFromPrivateKey(privateKeyHex, addressFormat, compressed);
    }
    
    // Cache this preview for future use
    if (record) {
      if (!record.addressPreviews) {
        record.addressPreviews = {};
      }
      record.addressPreviews[addressFormat] = address;
      await updateEncryptedWallet(record);
    }
    
    return address;
  }

  public async signTransaction(rawTxHex: string, sourceAddress: string): Promise<string> {
    if (!this.activeWalletId) throw new Error("No active wallet set");
    const wallet = this.getWalletById(this.activeWalletId);
    if (!wallet) throw new Error("Wallet not found");
    
    const targetAddress = wallet.addresses.find(addr => addr.address === sourceAddress);
    if (!targetAddress) throw new Error("Source address not found in wallet");
    
    const { key: privateKeyHex, compressed } = await this.getPrivateKey(wallet.id, targetAddress.path);
    return btcSignTransaction(rawTxHex, wallet, targetAddress, privateKeyHex, compressed);
  }

  public async broadcastTransaction(signedTxHex: string): Promise<{ txid: string; fees?: number }> {
    return btcBroadcastTransaction(signedTxHex);
  }

  public async signMessage(message: string, address: string): Promise<{ signature: string; address: string }> {
    if (!this.activeWalletId) throw new Error("No active wallet set");
    const wallet = this.getWalletById(this.activeWalletId);
    if (!wallet) throw new Error("Wallet not found");
    
    const targetAddress = wallet.addresses.find(addr => addr.address === address);
    if (!targetAddress) throw new Error("Address not found in wallet");
    
    const { key: privateKeyHex, compressed } = await this.getPrivateKey(wallet.id, targetAddress.path);
    
    // Use the signMessage function
    return signMessage(message, privateKeyHex, wallet.addressFormat, compressed);
  }

  private async generateWalletId(mnemonic: string, addressFormat: AddressFormat): Promise<string> {
    const seed = isCounterwalletFormat(addressFormat)
      ? getCounterwalletSeed(mnemonic)
      : mnemonicToSeedSync(mnemonic);
    const derivationPath = getDerivationPathForAddressFormat(addressFormat);
    const pathParts = derivationPath.split('/').slice(0, -1).join('/');
    const root = HDKey.fromMasterSeed(seed);
    const accountNode = root.derive(pathParts);
    if (!accountNode.publicKey) {
      throw new Error('Unable to derive public key for ID creation.');
    }
    const xpub = accountNode.publicExtendedKey;
    const xpubHash = sha256(utf8ToBytes(xpub));
    const typeHash = sha256(utf8ToBytes(addressFormat));
    const combined = new Uint8Array([...xpubHash, ...typeHash]);
    const finalHash = sha256(combined);
    return bytesToHex(finalHash);
  }

  private async generateWalletIdFromPrivateKey(privateKeyHex: string, addressFormat: AddressFormat): Promise<string> {
    const pubkeyCompressed = getPublicKeyFromPrivateKey(privateKeyHex, true);
    const combined = utf8ToBytes(pubkeyCompressed + addressFormat);
    const hash = sha256(combined);
    return bytesToHex(hash);
  }

  private deriveMnemonicAddress(mnemonic: string, addressFormat: AddressFormat, index: number): Address {
    const path = `${getDerivationPathForAddressFormat(addressFormat)}/${index}`;
    const address = getAddressFromMnemonic(mnemonic, path, addressFormat);
    const seed = isCounterwalletFormat(addressFormat)
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

  private deriveAddressFromPrivateKey(privKeyData: string, addressFormat: AddressFormat): Address {
    const { key: privateKeyHex, compressed } = JSON.parse(privKeyData);
    const address = getAddressFromPrivateKey(privateKeyHex, addressFormat, compressed);
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
