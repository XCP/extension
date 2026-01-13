import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes, bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import * as sessionManager from '@/utils/auth/sessionManager';
import { getAllEncryptedWallets, addEncryptedWallet, updateEncryptedWallet, updateEncryptedWallets, removeEncryptedWallet, EncryptedWalletRecord, type WalletType, type HardwareWalletData } from '@/utils/storage/walletStorage';
import { encryptMnemonic, decryptMnemonic, encryptPrivateKey, decryptPrivateKey, DecryptionError } from '@/utils/encryption/walletEncryption';
import { getAddressFromMnemonic, getDerivationPathForAddressFormat, AddressFormat, isCounterwalletFormat } from '@/utils/blockchain/bitcoin/address';
import { getPrivateKeyFromMnemonic, getAddressFromPrivateKey, getPublicKeyFromPrivateKey, decodeWIF, isWIF, encodeWIF } from '@/utils/blockchain/bitcoin/privateKey';
import { signMessage } from '@/utils/blockchain/bitcoin/messageSigner';
import { getCounterwalletSeed } from '@/utils/blockchain/counterwallet';
import { reencryptSettings, getSettings, updateSettings, invalidateSettingsCache, getAutoLockTimeoutMs, type AppSettings } from '@/utils/storage/settingsStorage';
import { initializeSettingsKey, clearSettingsKey } from '@/utils/encryption/settings';
import { signTransaction as btcSignTransaction } from '@/utils/blockchain/bitcoin/transactionSigner';
import { broadcastTransaction as btcBroadcastTransaction } from '@/utils/blockchain/bitcoin/transactionBroadcaster';
import { signPSBT as btcSignPSBT } from '@/utils/blockchain/bitcoin/psbt';
import { getHardwareAdapter } from '@/utils/hardware';
import { DerivationPaths, type HardwareWalletVendor } from '@/utils/hardware/types';
import type { IHardwareWalletAdapter } from '@/utils/hardware/interface';

// Import types from centralized types module
import type { Address, Wallet } from '@/types/wallet';

// Re-export types for backwards compatibility
export type { Address, Wallet };

// Import from constants for internal use
import { MAX_WALLETS, MAX_ADDRESSES_PER_WALLET } from './constants';

// Re-export from constants to maintain backwards compatibility
export { MAX_WALLETS, MAX_ADDRESSES_PER_WALLET };

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

      // Hardware wallets derive addresses from xpub (no session unlock needed)
      if (rec.type === 'hardware' && rec.hardwareData) {
        const count = rec.addressCount || 1;
        addresses = this.deriveHardwareAddresses(rec.hardwareData, rec.addressFormat, count);
      } else if (unlockedSecret) {
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
      }
      // When locked (no unlockedSecret), addresses remains empty array
      // UI redirects to unlock screen, so locked-state address display is not needed
      return {
        id: rec.id,
        name: rec.name,
        type: rec.type,
        addressFormat: rec.addressFormat,
        addressCount: rec.addressCount || 1,
        addresses,
        isTestOnly: rec.isTestOnly,
        hardwareData: rec.hardwareData,
      };
    }));
    const settings: AppSettings = await getSettings();
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

  public async setActiveWallet(walletId: string): Promise<void> {
    this.activeWalletId = walletId;
    await updateSettings({ lastActiveWalletId: walletId });
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
    const record: EncryptedWalletRecord = {
      id,
      name: walletName,
      type: 'mnemonic',
      addressFormat,
      addressCount: 1,
      encryptedSecret: encryptedMnemonic,
      // Note: previewAddress/addressPreviews intentionally not stored
      // Addresses are derived on-demand when wallet is unlocked
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
    let wifFormat: string;
    let compressed = true;

    if (isWIF(privateKey)) {
      const decoded = decodeWIF(privateKey);
      privateKeyHex = decoded.privateKey;
      compressed = decoded.compressed;
      wifFormat = privateKey;
    } else {
      privateKeyHex = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
      wifFormat = encodeWIF(privateKeyHex, compressed);
    }

    getPublicKeyFromPrivateKey(privateKeyHex, compressed);

    const secretJson = JSON.stringify({
      wif: wifFormat,
      hex: privateKeyHex,
      compressed
    });

    const id = await this.generateWalletIdFromPrivateKey(privateKeyHex, addressFormat);
    if (this.wallets.some((w) => w.id === id)) {
      throw new Error('A wallet with this private key already exists.');
    }
    const encryptedPrivateKey = await encryptPrivateKey(secretJson, password);
    const record: EncryptedWalletRecord = {
      id,
      name: walletName,
      type: 'privateKey',
      addressFormat,
      addressCount: 1,
      encryptedSecret: encryptedPrivateKey,
      // Note: previewAddress/addressPreviews intentionally not stored
      // Addresses are derived on-demand when wallet is unlocked
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

  /**
   * Create a hardware wallet by connecting to a Trezor device
   *
   * @param vendor - Hardware wallet vendor (currently only 'trezor')
   * @param addressFormat - The address format to use
   * @param account - Account index (default 0)
   * @param name - Optional wallet name
   * @param usePassphrase - Whether to use passphrase (hidden wallet)
   * @returns The created wallet
   */
  public async createHardwareWallet(
    vendor: HardwareWalletVendor,
    addressFormat: AddressFormat = AddressFormat.P2WPKH,
    account: number = 0,
    name?: string,
    usePassphrase: boolean = false
  ): Promise<Wallet> {
    if (this.wallets.length >= MAX_WALLETS) {
      throw new Error(`Maximum number of wallets (${MAX_WALLETS}) reached`);
    }

    // Get the hardware wallet adapter for the specified vendor
    // This will throw if the vendor is not supported
    const adapter = await getHardwareAdapter(vendor);
    if (!adapter.isInitialized()) {
      await adapter.init();
    }

    // Get the xpub from the device (passphrase prompt happens here if enabled)
    const xpub = await adapter.getXpub(addressFormat, account, usePassphrase);

    // Get device info for label
    const deviceInfo = await adapter.getDeviceInfo();

    // Get the first address to verify and display
    const firstAddress = await adapter.getAddress(addressFormat, account, 0, false, usePassphrase);

    // Generate wallet ID from xpub + address format
    const id = await this.generateHardwareWalletId(xpub, addressFormat);
    if (this.wallets.some((w) => w.id === id)) {
      throw new Error('A wallet with this hardware device and address format already exists.');
    }

    // Generate wallet name - just use vendor name for compact display
    // Hardware wallets are session-only, so simple naming is fine
    const vendorName = vendor.charAt(0).toUpperCase() + vendor.slice(1);
    const walletName = name || vendorName;

    const hardwareData: HardwareWalletData = {
      vendor,
      xpub,
      accountIndex: account,
      deviceLabel: deviceInfo?.label,
      usePassphrase,
    };

    // Hardware wallets are session-only - not persisted to storage
    // This avoids storing xpub unencrypted and simplifies multi-device usage
    // User reconnects their Trezor each session

    // Derive addresses from xpub
    const addresses = this.deriveHardwareAddresses(hardwareData, addressFormat, 1);

    const wallet: Wallet = {
      id,
      name: walletName,
      type: 'hardware',
      addressFormat,
      addressCount: 1,
      addresses,
      hardwareData,
    };
    this.wallets.push(wallet);

    // Set as active wallet
    this.activeWalletId = id;
    await updateSettings({ lastActiveWalletId: id });

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
    // We stringify it so encryptedSecret remains a string as the type expects
    const fakeEncrypted = JSON.stringify({
      v: 1,
      e: JSON.stringify(testMarker),
      t: 'test',
      s: 'test'
    });

    const record: EncryptedWalletRecord = {
      id,
      name: walletName,
      encryptedSecret: fakeEncrypted,
      type: 'privateKey',
      addressFormat,
      createdAt: Date.now(),
      isTestOnly: true,
    };
    
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
    await updateSettings({
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

    // Hardware wallets are session-only - they don't need password unlock
    // They're already in memory with addresses derived from xpub
    if (wallet.type === 'hardware' && wallet.hardwareData) {
      if (!this.activeWalletId) {
        this.activeWalletId = walletId;
      }
      // Initialize settings encryption key for hardware wallets too
      await initializeSettingsKey(password);
      const settings = await getSettings();
      const timeout = getAutoLockTimeoutMs(settings?.autoLockTimer ?? '5m');
      await sessionManager.initializeSession(timeout);
      await sessionManager.scheduleSessionExpiry(timeout);
      return;
    }

    const allRecords = await getAllEncryptedWallets();
    const record = allRecords.find((r) => r.id === walletId);
    if (!record) throw new Error('Wallet record not found in storage.');

    // Special handling for test wallets
    if (record.isTestOnly) {
      // Test wallets are always "unlocked" - just restore the address
      try {
        if (!record.encryptedSecret) {
          throw new Error('Test wallet missing encrypted secret');
        }
        const encryptedSecret = JSON.parse(record.encryptedSecret);
        if (!encryptedSecret || typeof encryptedSecret.e !== 'string') {
          throw new Error('Invalid test wallet structure');
        }
        const testData = JSON.parse(encryptedSecret.e);
        // Validate test wallet marker to prevent using corrupted data
        if (!testData || testData.isTestWallet !== true || typeof testData.address !== 'string') {
          throw new Error('Invalid test wallet data');
        }
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
      } catch (e) {
        console.error('Failed to unlock test wallet:', e);
        throw new Error('Test wallet data is corrupted');
      }
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

      // Initialize settings encryption key FIRST (before reading settings)
      // This allows getSettings() to decrypt the encrypted settings blob
      await initializeSettingsKey(password);

      // Now we can read the real settings (will be decrypted)
      const settings = await getSettings();
      const timeout = getAutoLockTimeoutMs(settings?.autoLockTimer ?? '5m');

      // Initialize session with the actual timeout from settings
      await sessionManager.initializeSession(timeout);

      // Set up session expiry alarm (sessionManager owns the alarm)
      await sessionManager.scheduleSessionExpiry(timeout);
    } catch (err) {
      if (err instanceof DecryptionError) throw err;
      throw new Error('Invalid password or corrupted data.');
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

    // Clear settings encryption key and cached decrypted settings
    await clearSettingsKey();
    invalidateSettingsCache();

    // Clear session expiry alarm (sessionManager owns the alarm)
    await sessionManager.clearSessionExpiry();
  }

  public async addAddress(walletId: string): Promise<Address> {
    const wallet = this.getWalletById(walletId);
    if (!wallet) throw new Error('Wallet not found.');
    if (wallet.type !== 'mnemonic' && wallet.type !== 'hardware')
      throw new Error('Can only add addresses to mnemonic or hardware wallets.');
    if (wallet.addressCount >= MAX_ADDRESSES_PER_WALLET) {
      throw new Error(`Cannot exceed ${MAX_ADDRESSES_PER_WALLET} addresses.`);
    }

    const index = wallet.addressCount;
    let newAddr: Address;

    if (wallet.type === 'hardware' && wallet.hardwareData) {
      // Hardware wallet - derive from xpub
      const addresses = this.deriveHardwareAddresses(wallet.hardwareData, wallet.addressFormat, index + 1);
      newAddr = addresses[index];
    } else {
      // Mnemonic wallet
      const mnemonic = await sessionManager.getUnlockedSecret(walletId);
      if (!mnemonic)
        throw new Error('Wallet is locked. Please unlock first.');
      newAddr = this.deriveMnemonicAddress(mnemonic, wallet.addressFormat, index);
    }

    wallet.addresses.push(newAddr);
    wallet.addressCount++;

    // Hardware wallets are session-only, no storage to update
    if (wallet.type !== 'hardware') {
      const allRecords = await getAllEncryptedWallets();
      const record = allRecords.find((r) => r.id === walletId);
      if (!record) throw new Error('Missing storage record.');
      record.addressCount = wallet.addressCount;
      await updateEncryptedWallet(record);
    }

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
    // Fetch all records once instead of inside the loop
    const allRecords = await getAllEncryptedWallets();
    const recordsToUpdate: EncryptedWalletRecord[] = [];

    for (let i = 0; i < this.wallets.length; i++) {
      const wallet = this.wallets[i];
      const newName = `Wallet ${i + 1}`;

      if (wallet.name.match(/^Wallet \d+$/)) {
        wallet.name = newName;

        const record = allRecords.find((r) => r.id === wallet.id);
        if (record) {
          record.name = newName;
          recordsToUpdate.push(record);
        }
      }
    }

    // Single batch write instead of N writes
    if (recordsToUpdate.length > 0) {
      await updateEncryptedWallets(recordsToUpdate);
    }
  }

  public async verifyPassword(password: string): Promise<boolean> {
    const all = await getAllEncryptedWallets();
    if (all.length === 0) return false;

    // Hardware wallets don't have encrypted secrets to verify
    // Filter to only wallets with encrypted secrets
    const walletsWithSecrets = all.filter(r => r.type !== 'hardware' && r.encryptedSecret);
    if (walletsWithSecrets.length === 0) {
      // If all wallets are hardware wallets, we can't verify the password this way
      // Return true to allow password-based settings access
      return true;
    }

    // Try to decrypt all wallets in parallel for better UX on wrong password
    // Use Promise.allSettled to get all results regardless of failures
    const results = await Promise.allSettled(
      walletsWithSecrets.map(async (r) => {
        if (r.type === 'mnemonic' && r.encryptedSecret) {
          await decryptMnemonic(r.encryptedSecret, password);
          return true;
        } else if (r.type === 'privateKey' && r.encryptedSecret) {
          await decryptPrivateKey(r.encryptedSecret, password);
          return true;
        }
        return false;
      })
    );

    // If any decryption succeeded, the password is valid
    return results.some(
      (result) => result.status === 'fulfilled' && result.value === true
    );
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

    // Re-encrypt all wallets in parallel for better performance
    // Hardware wallets don't have encrypted secrets, so they're unchanged
    const updatedRecords = await Promise.all(
      all.map(async (rec) => {
        if (rec.type === 'mnemonic' && rec.encryptedSecret) {
          const mnemonic = await decryptMnemonic(rec.encryptedSecret, currentPassword);
          rec.encryptedSecret = await encryptMnemonic(mnemonic, newPassword, rec.addressFormat);
        } else if (rec.type === 'privateKey' && rec.encryptedSecret) {
          const pkData = await decryptPrivateKey(rec.encryptedSecret, currentPassword);
          rec.encryptedSecret = await encryptPrivateKey(pkData, newPassword);
        }
        // Hardware wallets (rec.type === 'hardware') have no encryptedSecret to update
        return rec;
      })
    );

    // Single batch write instead of N writes
    await updateEncryptedWallets(updatedRecords);

    // Re-encrypt settings with new password
    await reencryptSettings(currentPassword, newPassword);

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
    // Note: previewAddress/addressPreviews not updated - addresses derived on-demand

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
    await updateSettings({ pinnedAssets });
  }

  public async getPrivateKey(walletId: string, derivationPath?: string): Promise<{ wif: string; hex: string; compressed: boolean }> {
    const wallet = this.getWalletById(walletId);
    if (!wallet) {
      throw new Error(`Wallet not found: ${walletId}`);
    }

    // Hardware wallets don't expose private keys
    if (wallet.type === 'hardware') {
      throw new Error('Hardware wallets do not expose private keys. Use hardware signing methods instead.');
    }

    const secret = await sessionManager.getUnlockedSecret(walletId);
    if (!secret) {
      throw new Error(`Wallet is locked or secret not available: ${walletId}`);
    }

    if (wallet.type === 'mnemonic') {
      // Mnemonic wallets always use compressed keys
      const path =
        derivationPath ||
        (wallet.addresses[0]?.path ?? `${getDerivationPathForAddressFormat(wallet.addressFormat)}/0`);
      const privateKeyHex = getPrivateKeyFromMnemonic(secret, path, wallet.addressFormat);
      const wifFormat = encodeWIF(privateKeyHex, true);
      return {
        wif: wifFormat,
        hex: privateKeyHex,
        compressed: true
      };
    } else {
      // Private key wallets
      return JSON.parse(secret);
    }
  }

  public async createAndUnlockMnemonicWallet(
    mnemonic: string,
    password: string,
    name?: string,
    addressFormat: AddressFormat = AddressFormat.P2TR
  ): Promise<Wallet> {
    console.log('[WalletManager] createAndUnlockMnemonicWallet called');
    try {
      if (!name) {
        name = `Wallet ${this.wallets.length + 1}`;
      }
      console.log('[WalletManager] Creating wallet with name:', name);
      const newWallet = await this.createMnemonicWallet(mnemonic, password, name, addressFormat);
      console.log('[WalletManager] Wallet created, unlocking...');
      await this.unlockWallet(newWallet.id, password);
      console.log('[WalletManager] Wallet unlocked, setting active...');
      this.setActiveWallet(newWallet.id);
      console.log('[WalletManager] Done');
      return newWallet;
    } catch (err) {
      console.error('[WalletManager] createAndUnlockMnemonicWallet FAILED:', err);
      throw err;
    }
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
    // Generate address on-demand (requires wallet to be unlocked)
    const secret = await sessionManager.getUnlockedSecret(walletId);
    if (!secret) {
      throw new Error('Wallet must be unlocked to get preview address');
    }

    const wallet = this.getWalletById(walletId);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    if (wallet.type === 'mnemonic') {
      return getAddressFromMnemonic(
        secret,
        `${getDerivationPathForAddressFormat(addressFormat)}/0`,
        addressFormat
      );
    } else {
      const { key: privateKeyHex, compressed } = JSON.parse(secret);
      return getAddressFromPrivateKey(privateKeyHex, addressFormat, compressed);
    }
  }

  public async signTransaction(rawTxHex: string, sourceAddress: string): Promise<string> {
    if (!this.activeWalletId) throw new Error("No active wallet set");
    const wallet = this.getWalletById(this.activeWalletId);
    if (!wallet) throw new Error("Wallet not found");

    const targetAddress = wallet.addresses.find(addr => addr.address === sourceAddress);
    if (!targetAddress) throw new Error("Source address not found in wallet");

    // Hardware wallet signing
    if (wallet.type === 'hardware' && wallet.hardwareData) {
      return this.signTransactionWithHardware(rawTxHex, wallet, targetAddress);
    }

    const privateKeyResult = await this.getPrivateKey(wallet.id, targetAddress.path);
    return btcSignTransaction(rawTxHex, wallet, targetAddress, privateKeyResult.hex, privateKeyResult.compressed);
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

    // Hardware wallet message signing
    if (wallet.type === 'hardware' && wallet.hardwareData) {
      return this.signMessageWithHardware(message, wallet, targetAddress);
    }

    const privateKeyResult = await this.getPrivateKey(wallet.id, targetAddress.path);

    // Use the signMessage function
    return signMessage(message, privateKeyResult.hex, wallet.addressFormat, privateKeyResult.compressed);
  }

  /**
   * Sign a PSBT (Partially Signed Bitcoin Transaction)
   *
   * @param psbtHex - PSBT in hex format
   * @param signInputs - Optional map of address → input indices to sign
   * @param sighashTypes - Optional sighash types per input index
   * @returns Signed PSBT hex (not finalized)
   */
  public async signPsbt(
    psbtHex: string,
    signInputs?: Record<string, number[]>,
    sighashTypes?: number[]
  ): Promise<string> {
    if (!this.activeWalletId) throw new Error("No active wallet set");
    const wallet = this.getWalletById(this.activeWalletId);
    if (!wallet) throw new Error("Wallet not found");

    // Hardware wallet PSBT signing
    if (wallet.type === 'hardware' && wallet.hardwareData) {
      return this.signPsbtWithHardware(psbtHex, wallet, signInputs);
    }

    // If signInputs is provided, sign only the specified inputs
    // Otherwise, sign all inputs we can (using the active address)
    if (signInputs && Object.keys(signInputs).length > 0) {
      let signedPsbtHex = psbtHex;

      for (const [address, inputIndices] of Object.entries(signInputs)) {
        const targetAddress = wallet.addresses.find(addr => addr.address === address);
        if (!targetAddress) {
          throw new Error(`Address ${address} not found in wallet`);
        }

        const privateKeyResult = await this.getPrivateKey(wallet.id, targetAddress.path);
        signedPsbtHex = btcSignPSBT(
          signedPsbtHex,
          privateKeyResult.hex,
          inputIndices,
          wallet.addressFormat,
          sighashTypes
        );
      }

      return signedPsbtHex;
    } else {
      // Sign all inputs using the first address in the wallet
      // When no signInputs specified, try to sign all inputs with available keys
      const firstAddress = wallet.addresses[0];
      if (!firstAddress) {
        throw new Error("No addresses in wallet");
      }

      const privateKeyResult = await this.getPrivateKey(wallet.id, firstAddress.path);
      return btcSignPSBT(
        psbtHex,
        privateKeyResult.hex,
        [], // Empty array means try all inputs
        wallet.addressFormat,
        sighashTypes
      );
    }
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
    const parsed = JSON.parse(privKeyData);
    const address = getAddressFromPrivateKey(parsed.hex, addressFormat, parsed.compressed);
    const pubKey = getPublicKeyFromPrivateKey(parsed.hex, parsed.compressed);
    return {
      name: 'Address 1',
      path: '',
      address,
      pubKey,
    };
  }

  /**
   * Generate wallet ID for hardware wallets from xpub
   */
  private async generateHardwareWalletId(xpub: string, addressFormat: AddressFormat): Promise<string> {
    const xpubHash = sha256(utf8ToBytes(xpub));
    const typeHash = sha256(utf8ToBytes(addressFormat));
    const combined = new Uint8Array([...xpubHash, ...typeHash]);
    const finalHash = sha256(combined);
    return bytesToHex(finalHash);
  }

  /**
   * Derive addresses from hardware wallet xpub
   */
  private deriveHardwareAddresses(hardwareData: HardwareWalletData, addressFormat: AddressFormat, count: number): Address[] {
    const addresses: Address[] = [];
    const hdkey = HDKey.fromExtendedKey(hardwareData.xpub);

    for (let i = 0; i < count; i++) {
      // Derive child key for address index (external chain, index i)
      const child = hdkey.deriveChild(0).deriveChild(i);
      if (!child.publicKey) {
        throw new Error(`Unable to derive public key for index ${i}`);
      }

      const pubKeyHex = bytesToHex(child.publicKey);
      const pubKeyBytes = child.publicKey;

      // Generate address based on format
      let address: string;
      const purpose = DerivationPaths.getPurpose(addressFormat);
      const path = `m/${purpose}'/0'/${hardwareData.accountIndex}'/0/${i}`;

      // Import address encoding
      const { encodeAddress } = require('@/utils/blockchain/bitcoin/address');
      address = encodeAddress(pubKeyBytes, addressFormat);

      addresses.push({
        name: `Address ${i + 1}`,
        path,
        address,
        pubKey: pubKeyHex,
      });
    }

    return addresses;
  }

  /**
   * Sign a transaction using hardware wallet
   */
  private async signTransactionWithHardware(rawTxHex: string, wallet: Wallet, targetAddress: Address): Promise<string> {
    if (!wallet.hardwareData) {
      throw new Error('Hardware wallet data not available');
    }

    const adapter = await getHardwareAdapter(wallet.hardwareData.vendor);
    if (!adapter.isInitialized()) {
      await adapter.init();
    }

    // Parse the raw transaction to extract inputs and outputs
    const { Transaction } = await import('@scure/btc-signer');
    const rawTxBytes = hexToBytes(rawTxHex);
    const tx = Transaction.fromRaw(rawTxBytes, {
      allowUnknownInputs: true,
      allowUnknownOutputs: true,
      allowLegacyWitnessUtxo: true,
      disableScriptCheck: true,
    });

    // Get the address index from the path
    const pathParts = targetAddress.path.split('/');
    const addressIndex = parseInt(pathParts[pathParts.length - 1], 10);

    // Build inputs for Trezor
    const inputs: any[] = [];
    for (let i = 0; i < tx.inputsLength; i++) {
      const input = tx.getInput(i);
      if (!input?.txid) continue;

      // Extract input amount from witnessUtxo or nonWitnessUtxo
      // witnessUtxo contains { script, amount } for SegWit inputs
      // nonWitnessUtxo contains the full previous transaction for legacy inputs
      let inputAmount = '0';
      if (input.witnessUtxo?.amount !== undefined) {
        inputAmount = String(input.witnessUtxo.amount);
      } else if (input.nonWitnessUtxo) {
        // For legacy inputs, we need to look up the output from the previous tx
        // This is more complex and may require fetching the previous transaction
        // For now, log a warning if we can't determine the amount
        console.warn(`[WalletManager] Input ${i} has no witnessUtxo, amount may be incorrect`);
      }

      const scriptType = this.getHardwareScriptType(wallet.addressFormat, true);
      inputs.push({
        addressPath: DerivationPaths.getBip44Path(wallet.addressFormat, wallet.hardwareData.accountIndex, 0, addressIndex),
        prevTxHash: bytesToHex(input.txid),
        prevIndex: input.index ?? 0,
        amount: inputAmount,
        scriptType,
      });
    }

    // Build outputs for Trezor
    const outputs: any[] = [];
    for (let i = 0; i < tx.outputsLength; i++) {
      const output = tx.getOutput(i);
      if (!output?.script) continue;

      const scriptHex = bytesToHex(output.script);

      // Check if it's an OP_RETURN output
      if (scriptHex.startsWith('6a')) {
        outputs.push({
          scriptType: 'PAYTOOPRETURN',
          amount: '0',
          opReturnData: scriptHex.slice(2), // Remove OP_RETURN opcode
        });
      } else {
        // Regular output
        // Detect script type from the script hex to determine Trezor output type
        let outputScriptType = 'PAYTOADDRESS';

        // Detect script type and extract address
        if (scriptHex.startsWith('76a914') && scriptHex.endsWith('88ac') && scriptHex.length === 50) {
          // P2PKH: OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG
          const hashHex = scriptHex.slice(6, 46);
          // For now, we'll pass the address as undefined and let Trezor handle raw outputs
          outputScriptType = 'PAYTOADDRESS';
        } else if (scriptHex.startsWith('0014') && scriptHex.length === 44) {
          // P2WPKH: OP_0 <20 bytes>
          outputScriptType = 'PAYTOWITNESS';
        } else if (scriptHex.startsWith('a914') && scriptHex.endsWith('87') && scriptHex.length === 46) {
          // P2SH: OP_HASH160 <20 bytes> OP_EQUAL
          outputScriptType = 'PAYTOP2SHWITNESS';
        } else if (scriptHex.startsWith('5120') && scriptHex.length === 68) {
          // P2TR: OP_1 <32 bytes>
          outputScriptType = 'PAYTOTAPROOT';
        }

        outputs.push({
          address: undefined, // Let the calling code provide the address if needed
          amount: String(output.amount ?? 0),
          scriptType: outputScriptType,
        });
      }
    }

    // Sign with Trezor
    const result = await adapter.signTransaction({ inputs, outputs });
    return result.signedTxHex;
  }

  /**
   * Sign a message using hardware wallet
   */
  private async signMessageWithHardware(message: string, wallet: Wallet, targetAddress: Address): Promise<{ signature: string; address: string }> {
    if (!wallet.hardwareData) {
      throw new Error('Hardware wallet data not available');
    }

    const adapter = await getHardwareAdapter(wallet.hardwareData.vendor);
    if (!adapter.isInitialized()) {
      await adapter.init();
    }

    // Get the address index from the path
    const pathParts = targetAddress.path.split('/');
    const addressIndex = parseInt(pathParts[pathParts.length - 1], 10);

    const path = DerivationPaths.getBip44Path(wallet.addressFormat, wallet.hardwareData.accountIndex, 0, addressIndex);

    const result = await adapter.signMessage({
      message,
      path,
      coin: 'Bitcoin',
    });

    return {
      signature: result.signature,
      address: result.address,
    };
  }

  /**
   * Sign a PSBT using hardware wallet
   * Note: Hardware wallets typically return a fully signed raw transaction, not a PSBT
   */
  private async signPsbtWithHardware(
    psbtHex: string,
    wallet: Wallet,
    signInputs?: Record<string, number[]>
  ): Promise<string> {
    if (!wallet.hardwareData) {
      throw new Error('Hardware wallet data not available');
    }

    const adapter = await getHardwareAdapter(wallet.hardwareData.vendor);
    if (!adapter.isInitialized()) {
      await adapter.init();
    }

    // Build input paths map from signInputs or use all wallet addresses
    const inputPaths = new Map<number, number[]>();

    if (signInputs && Object.keys(signInputs).length > 0) {
      // Map addresses to their derivation paths for specified inputs
      for (const [address, inputIndices] of Object.entries(signInputs)) {
        const targetAddress = wallet.addresses.find(addr => addr.address === address);
        if (!targetAddress) {
          throw new Error(`Address ${address} not found in wallet`);
        }

        // Parse the path string to get address index
        const pathParts = targetAddress.path.split('/');
        const addressIndex = parseInt(pathParts[pathParts.length - 1], 10);

        // Get full derivation path as number array
        const fullPath = DerivationPaths.getBip44Path(
          wallet.addressFormat,
          wallet.hardwareData.accountIndex,
          0, // external chain
          addressIndex
        );

        // Map each input index to this path
        for (const inputIndex of inputIndices) {
          inputPaths.set(inputIndex, fullPath);
        }
      }
    } else {
      // No specific inputs specified - use first address for all inputs
      // The TrezorAdapter will figure out which inputs to sign based on the PSBT
      const firstAddress = wallet.addresses[0];
      if (!firstAddress) {
        throw new Error('No addresses in wallet');
      }

      const pathParts = firstAddress.path.split('/');
      const addressIndex = parseInt(pathParts[pathParts.length - 1], 10);

      const fullPath = DerivationPaths.getBip44Path(
        wallet.addressFormat,
        wallet.hardwareData.accountIndex,
        0,
        addressIndex
      );

      // We'll set path for input 0, TrezorAdapter will handle the rest
      inputPaths.set(0, fullPath);
    }

    const result = await adapter.signPsbt({
      psbtHex,
      inputPaths,
    });

    // Note: Trezor returns a fully signed raw transaction hex, not a PSBT
    // The caller should be aware of this
    return result.signedPsbtHex;
  }

  /**
   * Get Trezor script type for address format
   */
  private getHardwareScriptType(addressFormat: AddressFormat, isInput: boolean): string {
    switch (addressFormat) {
      case AddressFormat.P2PKH:
      case AddressFormat.Counterwallet:
        return isInput ? 'SPENDADDRESS' : 'PAYTOADDRESS';
      case AddressFormat.P2WPKH:
      case AddressFormat.CounterwalletSegwit:
        return isInput ? 'SPENDWITNESS' : 'PAYTOWITNESS';
      case AddressFormat.P2SH_P2WPKH:
        return isInput ? 'SPENDP2SHWITNESS' : 'PAYTOP2SHWITNESS';
      case AddressFormat.P2TR:
        return isInput ? 'SPENDTAPROOT' : 'PAYTOTAPROOT';
      default:
        return isInput ? 'SPENDADDRESS' : 'PAYTOADDRESS';
    }
  }
}

export const walletManager = new WalletManager();
