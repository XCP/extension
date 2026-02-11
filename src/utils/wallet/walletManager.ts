import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes, bytesToHex } from '@noble/hashes/utils.js';
import { HDKey } from '@scure/bip32';
import { validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import * as sessionManager from '@/utils/auth/sessionManager';
import {
  getKeychainRecord,
  saveKeychainRecord,
  deleteKeychain,
} from '@/utils/storage/walletStorage';
import {
  deriveKey,
  deriveKeyAsync,
  encryptWithKey,
  decryptWithKey,
  encryptJsonWithKey,
  decryptJsonWithKey,
  DEFAULT_PBKDF2_ITERATIONS,
} from '@/utils/encryption/encryption';
import { base64ToBuffer, generateRandomBytes, bufferToBase64 } from '@/utils/encryption/buffer';
import { getAddressFromMnemonic, getDerivationPathForAddressFormat, AddressFormat, isCounterwalletFormat, getSeedFromMnemonic } from '@/utils/blockchain/bitcoin/address';
import { getPrivateKeyFromMnemonic, getAddressFromPrivateKey, getPublicKeyFromPrivateKey, decodeWIF, isWIF, encodeWIF } from '@/utils/blockchain/bitcoin/privateKey';
import { signMessage } from '@/utils/blockchain/bitcoin/messageSigner';
import { isValidCounterwalletMnemonic } from '@/utils/blockchain/counterwallet';
import { DEFAULT_SETTINGS, getAutoLockTimeoutMs, type AppSettings } from '@/utils/settings';
import { signTransaction as btcSignTransaction } from '@/utils/blockchain/bitcoin/transactionSigner';
import { broadcastTransaction as btcBroadcastTransaction } from '@/utils/blockchain/bitcoin/transactionBroadcaster';
import { signPSBT as btcSignPSBT, extractPsbtDetails, completePsbtWithInputValues } from '@/utils/blockchain/bitcoin/psbt';
// Note: getTrezorAdapter is dynamically imported in createHardwareWalletWithDiscovery to avoid
// loading @trezor/connect-webextension at extension startup (it auto-initializes)

// Import types from centralized types module
import type { Address, Wallet, Keychain, KeychainRecord, WalletRecord, HardwareWalletSecret, SignTransactionOptions } from '@/types/wallet';

// Re-export types for backwards compatibility
export type { Address, Wallet };

// Import from constants for internal use
import { MAX_WALLETS, MAX_ADDRESSES_PER_WALLET } from './constants';

// Re-export from constants to maintain backwards compatibility
export { MAX_WALLETS, MAX_ADDRESSES_PER_WALLET };

/** Current keychain schema version */
const KEYCHAIN_VERSION = 1;

/**
 * WalletManager - Core wallet state management (ADR-015)
 *
 * ## Architecture: Unified Keychain
 *
 * Previous design had separate encryption for settings and each wallet, requiring
 * password entry for each wallet switch. The unified keychain design:
 *
 * 1. Single password unlocks entire keychain (better UX)
 * 2. Master key derived once, stored in session (survives SW restart)
 * 3. Wallet secrets still individually encrypted with master key (defense in depth)
 * 4. Settings encryption shares the same unlock flow
 *
 * ## Three-Level Hierarchy
 *
 * - **Keychain**: Password-protected vault containing all wallets
 * - **Wallet**: Mnemonic or private key with derived addresses
 * - **Address**: Single Bitcoin address (just a pointer, no crypto)
 *
 * ## Security Trade-off
 *
 * Master key in session = password-equivalent capability while unlocked.
 * This is unavoidable if you want wallet switching without re-entering password.
 * Mitigated by: auto-lock timeout, session cleared on browser close.
 *
 * ## State Invariants
 *
 * - When locked: keychain=null, wallets=[], masterKey not in session
 * - When unlocked: keychain!=null, wallets synced with keychain.wallets, masterKey in session
 * - Only one wallet's secret is decrypted at a time (the active wallet)
 *
 * ## Storage Layers
 *
 * - chrome.storage.local: encrypted keychain (persisted)
 * - chrome.storage.session: master key bytes (survives SW restart, cleared on browser close)
 * - In-memory: keychain metadata, wallet list, active wallet's decrypted secret
 */
export class WalletManager {
  /** Runtime wallet list (addresses populated only for active wallet) */
  private wallets: Wallet[] = [];
  /** Currently active wallet ID */
  private activeWalletId: string | null = null;
  /** Decrypted keychain metadata; null when locked */
  private keychain: Keychain | null = null;

  public async setLastActiveTime(): Promise<void> {
    await sessionManager.setLastActiveTime();
  }

  public async refreshWallets(): Promise<void> {
    // If keychain is already loaded, just refresh addresses
    if (this.keychain) {
      await this.refreshWalletAddresses();
      return;
    }

    // Try to reload keychain from session
    const masterKey = await sessionManager.getKeychainMasterKey();
    if (!masterKey) return;

    const keychainRecord = await getKeychainRecord();
    if (!keychainRecord) return;

    try {
      const decryptedKeychain = await decryptJsonWithKey<Keychain>(keychainRecord.encryptedKeychain, masterKey);
      this.keychain = decryptedKeychain;
      this.wallets = decryptedKeychain.wallets.map((r) => this.walletFromRecord(r));
      await this.refreshWalletAddresses();

      const settings = this.getSettings();
      if (settings.lastActiveWalletId && this.getWalletById(settings.lastActiveWalletId)) {
        this.activeWalletId = settings.lastActiveWalletId;
      }
    } catch {
      this.wallets = [];
      this.keychain = null;
    }
  }

  /** Converts a keychain record to a runtime wallet object */
  private walletFromRecord(record: WalletRecord): Wallet {
    return {
      id: record.id,
      name: record.name,
      type: record.type,
      addressFormat: record.addressFormat,
      addressCount: record.addressCount,
      addresses: [],
      isTestOnly: record.isTestOnly,
      previewAddress: record.previewAddress,
    };
  }

  /** Refreshes addresses for all wallets that have unlocked secrets */
  private async refreshWalletAddresses(): Promise<void> {
    if (!this.keychain) return;

    for (const wallet of this.wallets) {
      const secret = await sessionManager.getUnlockedSecret(wallet.id);
      if (!secret) {
        wallet.addresses = [];
        continue;
      }

      const record = this.keychain.wallets.find(r => r.id === wallet.id);
      if (!record) continue;

      wallet.addresses = this.deriveAddressesFromSecret(secret, record);
    }
  }

  /** Derives addresses from a decrypted secret based on wallet type */
  private deriveAddressesFromSecret(secret: string, record: WalletRecord): Address[] {
    if (record.type === 'mnemonic') {
      const count = record.addressCount || 1;
      return Array.from({ length: count }, (_, i) =>
        this.deriveMnemonicAddress(secret, record.addressFormat, i)
      );
    }

    if (record.type === 'hardware') {
      // Hardware wallet secret contains metadata, not private keys
      // The address is stored in the secret, no derivation needed
      try {
        const hardwareData: HardwareWalletSecret = JSON.parse(secret);
        // We need the address from the record's previewAddress since
        // hardware secrets don't store the address directly
        return [{
          name: 'Address 1',
          path: hardwareData.derivationPath,
          address: record.previewAddress,
          pubKey: hardwareData.publicKey,
        }];
      } catch {
        return [];
      }
    }

    if (record.isTestOnly) {
      try {
        const testData = JSON.parse(secret);
        if (testData.isTestWallet && testData.address) {
          return [{ name: "Test Address", path: "m/test", address: testData.address, pubKey: '' }];
        }
      } catch {
        return [];
      }
    }

    return [this.deriveAddressFromPrivateKey(secret, record.addressFormat)];
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
    await this.updateSettings({ lastActiveWalletId: walletId });
  }

  public getWalletById(id: string): Wallet | undefined {
    return this.wallets.find((w) => w.id === id);
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

    // Validate mnemonic
    const isValid = isCounterwalletFormat(addressFormat)
      ? isValidCounterwalletMnemonic(mnemonic)
      : validateMnemonic(mnemonic, wordlist);

    if (!isValid) {
      throw new Error(`Invalid mnemonic for address format: ${addressFormat}`);
    }

    const walletName = name || `Wallet ${this.wallets.length + 1}`;
    const id = await this.generateWalletId(mnemonic, addressFormat);

    if (this.wallets.some((w) => w.id === id)) {
      throw new Error('A wallet with this mnemonic+addressType combination already exists.');
    }

    const masterKey = await this.getOrCreateKeychain(password);
    const encryptedSecret = await encryptWithKey(mnemonic, masterKey);

    // Derive first address for preview display
    const derivationPath = `${getDerivationPathForAddressFormat(addressFormat)}/0`;
    const previewAddress = getAddressFromMnemonic(mnemonic, derivationPath, addressFormat);

    // Create wallet record for keychain
    const walletRecord: WalletRecord = {
      id,
      name: walletName,
      type: 'mnemonic',
      addressFormat,
      addressCount: 1,
      encryptedSecret,
      previewAddress,
      createdAt: Date.now(),
    };

    // Add to keychain
    if (!this.keychain) {
      throw new Error('Keychain not initialized');
    }
    this.keychain.wallets.push(walletRecord);
    await this.persistKeychain();

    // Add to runtime wallet list
    const wallet: Wallet = {
      id,
      name: walletName,
      type: 'mnemonic',
      addressFormat,
      addressCount: 1,
      addresses: [],
      previewAddress,
    };
    this.wallets.push(wallet);

    // Select the newly created wallet
    await this.selectWallet(id);

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

    const masterKey = await this.getOrCreateKeychain(password);
    const encryptedSecret = await encryptWithKey(secretJson, masterKey);

    // Derive address for preview display
    const previewAddress = getAddressFromPrivateKey(privateKeyHex, addressFormat, compressed);

    // Create wallet record for keychain
    const walletRecord: WalletRecord = {
      id,
      name: walletName,
      type: 'privateKey',
      addressFormat,
      addressCount: 1,
      encryptedSecret,
      previewAddress,
      createdAt: Date.now(),
    };

    // Add to keychain
    if (!this.keychain) {
      throw new Error('Keychain not initialized');
    }
    this.keychain.wallets.push(walletRecord);
    await this.persistKeychain();

    // Add to runtime wallet list
    const wallet: Wallet = {
      id,
      name: walletName,
      type: 'privateKey',
      addressFormat,
      addressCount: 1,
      addresses: [],
      previewAddress,
    };
    this.wallets.push(wallet);

    // Select the newly created wallet
    await this.selectWallet(id);

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

    // Generate proper SHA-256 hash ID for test wallet
    const testData = `TEST_WALLET_${address}_${addressFormat}_${Date.now()}`;
    const hash = sha256(utf8ToBytes(testData));
    const id = bytesToHex(hash);
    const walletName = name || `Test: ${address.slice(0, 8)}...`;

    // Create test marker data
    const testMarker = JSON.stringify({
      isTestWallet: true,
      address: address,
      warning: 'This is a test wallet for UI development only. It cannot sign transactions.'
    });

    // Check if keychain exists - test wallets need an unlocked keychain
    if (!this.keychain) {
      throw new Error('Keychain must be unlocked to import test addresses');
    }

    const masterKey = await sessionManager.getKeychainMasterKey();
    if (!masterKey) {
      throw new Error('Keychain must be unlocked to import test addresses');
    }

    // Encrypt test marker with master key (for consistency)
    const encryptedSecret = await encryptWithKey(testMarker, masterKey);

    // Create wallet record for keychain
    const walletRecord: WalletRecord = {
      id,
      name: walletName,
      type: 'privateKey',
      addressFormat,
      addressCount: 1,
      encryptedSecret,
      previewAddress: address,
      createdAt: Date.now(),
      isTestOnly: true,
    };

    // Add to keychain
    this.keychain.wallets.push(walletRecord);
    await this.persistKeychain();

    // Create wallet object with the test address
    const wallet: Wallet = {
      id,
      name: walletName,
      type: 'privateKey',
      addressFormat,
      addressCount: 1,
      addresses: [{
        name: "Test Address",
        path: "m/test",
        address: address,
        pubKey: ''
      }],
      isTestOnly: true,
      previewAddress: address,
    };

    this.wallets.push(wallet);

    // Set as active wallet
    this.activeWalletId = id;

    // Set the test address as the last active address
    await this.updateSettings({
      lastActiveWalletId: id,
      lastActiveAddress: address
    });

    // Store test marker as "unlocked" secret
    sessionManager.storeUnlockedSecret(id, testMarker);

    return wallet;
  }

  /**
   * Internal helper to finalize hardware wallet creation.
   * Handles all the common logic: ID generation, duplicate check, encryption,
   * persistence, and state updates.
   *
   * @param account - Discovered or derived account info
   * @param name - Optional wallet name
   * @returns The created wallet
   */
  private async finalizeHardwareWallet(account: {
    deviceType: 'trezor' | 'ledger';
    address: string;
    publicKey: string;
    derivationPath: string;
    addressFormat: AddressFormat;
    accountIndex: number;
    usePassphrase: boolean;
    xpub?: string;
    idSuffix: string; // Unique identifier suffix for wallet ID
  }, name?: string): Promise<Wallet> {
    // Check wallet limit
    if (this.wallets.length >= MAX_WALLETS) {
      throw new Error(`Maximum number of wallets (${MAX_WALLETS}) reached`);
    }

    // Check if keychain exists
    if (!this.keychain) {
      throw new Error('Keychain must be unlocked to add hardware wallets');
    }

    const masterKey = await sessionManager.getKeychainMasterKey();
    if (!masterKey) {
      throw new Error('Keychain must be unlocked to add hardware wallets');
    }

    // Generate wallet ID
    const idData = `HARDWARE_${account.deviceType}_${account.idSuffix}_${account.addressFormat}`;
    const hash = sha256(utf8ToBytes(idData));
    const id = bytesToHex(hash);

    // Check for duplicate
    if (this.wallets.some((w) => w.id === id)) {
      throw new Error('This hardware wallet account is already connected.');
    }

    // Use provided name if non-empty, otherwise just "Trezor"
    // Hardware wallets don't use incremental numbering like software wallets
    const walletName = name?.trim() || 'Trezor';

    // Build hardware secret (public metadata only - private keys never leave device)
    const hardwareSecret: HardwareWalletSecret = {
      deviceType: account.deviceType,
      publicKey: account.publicKey,
      derivationPath: account.derivationPath,
      accountIndex: account.accountIndex,
      usePassphrase: account.usePassphrase,
    };
    if (account.xpub) {
      hardwareSecret.xpub = account.xpub;
    }

    const hardwareSecretJson = JSON.stringify(hardwareSecret);

    // Encrypt and persist
    const encryptedSecret = await encryptWithKey(hardwareSecretJson, masterKey);

    const walletRecord: WalletRecord = {
      id,
      name: walletName,
      type: 'hardware',
      addressFormat: account.addressFormat,
      addressCount: 1,
      encryptedSecret,
      previewAddress: account.address,
      createdAt: Date.now(),
    };

    this.keychain.wallets.push(walletRecord);
    await this.persistKeychain();

    // Create runtime wallet object
    const wallet: Wallet = {
      id,
      name: walletName,
      type: 'hardware',
      addressFormat: account.addressFormat,
      addressCount: 1,
      addresses: [{
        // Use "Address 1" to match software wallet UX (1-indexed for users)
        name: 'Address 1',
        path: account.derivationPath,
        address: account.address,
        pubKey: account.publicKey,
      }],
      previewAddress: account.address,
    };

    this.wallets.push(wallet);
    this.activeWalletId = id;

    // Store secret as "unlocked" (contains no private keys, just metadata)
    sessionManager.storeUnlockedSecret(id, hardwareSecretJson);

    // Update settings
    await this.updateSettings({
      lastActiveWalletId: id,
      lastActiveAddress: account.address,
    });

    return wallet;
  }

  /**
   * Creates a hardware wallet using BIP-44 account discovery.
   *
   * This method triggers Trezor's account discovery UI, which scans all address
   * types (legacy, segwit, taproot) and finds accounts with existing funds.
   * The user selects their account in Trezor's interface.
   *
   * @param deviceType - Hardware wallet vendor ('trezor' or 'ledger')
   * @param name - Optional wallet name
   * @param usePassphrase - Whether to use passphrase-protected wallet
   * @returns The created wallet with discovered account
   */
  public async createHardwareWalletWithDiscovery(
    deviceType: 'trezor' | 'ledger',
    name?: string,
    usePassphrase: boolean = false
  ): Promise<Wallet> {
    // Currently only Trezor is supported
    if (deviceType !== 'trezor') {
      throw new Error(`Hardware wallet type '${deviceType}' is not yet supported`);
    }

    // Dynamically import Trezor adapter
    const { getTrezorAdapter } = await import('@/utils/hardware/trezorAdapter');
    const trezor = getTrezorAdapter();

    // Initialize with settings
    const settings = this.getSettings();
    await trezor.init({ testMode: settings?.trezorEmulatorMode });

    // Perform account discovery - this shows Trezor's account selection UI
    // discoverAccount validates the path internally and returns accountIndex
    // KEY: xpub is extracted from descriptor - NO separate getXpub() call needed!
    // This reduces TrezorConnect calls from 2 to 1, meaning fewer permission prompts.
    const discovered = await trezor.discoverAccount(usePassphrase);

    return this.finalizeHardwareWallet({
      deviceType,
      address: discovered.address,
      publicKey: discovered.xpub, // Use xpub as the account-level public key
      derivationPath: `${discovered.path}/0/0`, // Full path to first address
      addressFormat: discovered.addressFormat,
      accountIndex: discovered.accountIndex,
      usePassphrase,
      xpub: discovered.xpub,
      idSuffix: discovered.xpub, // Use xpub for unique ID (shorter than descriptor)
    }, name);
  }

  // ============================================================================
  // New Keychain-Based API
  // ============================================================================

  /**
   * Unlocks the wallet keychain with the user's password.
   * This decrypts the keychain metadata (names, formats, preview addresses)
   * but individual wallet secrets remain encrypted until selectWallet() is called.
   *
   * @param password - User's keychain password
   */
  public async unlockKeychain(password: string): Promise<void> {
    const keychainRecord = await getKeychainRecord();
    if (!keychainRecord) {
      throw new Error('No keychain found. Create a wallet first.');
    }

    // Derive master key from password + salt (uses Web Worker for non-blocking UI)
    const salt = base64ToBuffer(keychainRecord.salt);
    const masterKey = await deriveKeyAsync(password, salt, keychainRecord.kdf.iterations);

    // Decrypt keychain
    let decryptedKeychain: Keychain;
    try {
      decryptedKeychain = await decryptJsonWithKey<Keychain>(keychainRecord.encryptedKeychain, masterKey);
    } catch {
      throw new Error('Invalid password');
    }

    // Validate keychain version
    if (decryptedKeychain.version !== KEYCHAIN_VERSION) {
      throw new Error(`Unsupported keychain version: ${decryptedKeychain.version}. Expected: ${KEYCHAIN_VERSION}`);
    }

    // Store master key in session (survives service worker restarts)
    await sessionManager.storeKeychainMasterKey(masterKey);

    // Store decrypted keychain in memory (secrets still encrypted)
    this.keychain = decryptedKeychain;

    // Build runtime wallet array from keychain
    this.wallets = decryptedKeychain.wallets.map((record) => ({
      id: record.id,
      name: record.name,
      type: record.type,
      addressFormat: record.addressFormat,
      addressCount: record.addressCount,
      addresses: [], // Empty until selectWallet() is called
      isTestOnly: record.isTestOnly,
      previewAddress: record.previewAddress,
    }));

    // Setup session with timeout from keychain settings
    const settings = this.getSettings();
    const timeout = getAutoLockTimeoutMs(settings.autoLockTimer);
    await sessionManager.initializeSession(timeout);
    await sessionManager.scheduleSessionExpiry(timeout);

    // Auto-load last active wallet (from settings inside keychain)
    const walletId = settings.lastActiveWalletId || decryptedKeychain.wallets[0]?.id;
    if (walletId) {
      await this.selectWallet(walletId);
    }
  }

  /**
   * Loads a specific wallet by decrypting its secret and deriving addresses.
   * Requires keychain to be unlocked first (via unlockKeychain).
   * Only one wallet's secret is held in memory at a time.
   *
   * @param walletId - ID of the wallet to load
   */
  public async selectWallet(walletId: string): Promise<void> {
    const masterKey = await sessionManager.getKeychainMasterKey();
    if (!masterKey) {
      throw new Error('Keychain not unlocked');
    }

    if (!this.keychain) {
      throw new Error('Keychain not loaded');
    }

    const record = this.keychain.wallets.find((w) => w.id === walletId);
    if (!record) {
      throw new Error('Wallet not found in keychain');
    }

    const wallet = this.getWalletById(walletId);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    // Clear previous active wallet's secret
    if (this.activeWalletId && this.activeWalletId !== walletId) {
      sessionManager.clearUnlockedSecret(this.activeWalletId);
      const prevWallet = this.getWalletById(this.activeWalletId);
      if (prevWallet) {
        prevWallet.addresses = [];
      }
    }

    // Decrypt and derive addresses
    const secret = await decryptWithKey(record.encryptedSecret, masterKey);
    sessionManager.storeUnlockedSecret(walletId, secret);
    wallet.addresses = this.deriveAddressesFromSecret(secret, record);
    wallet.addressCount = wallet.addresses.length;
    this.activeWalletId = walletId;

    // Persist lastActiveWalletId in settings (only on explicit selection)
    if (this.getSettings().lastActiveWalletId !== walletId) {
      await this.updateSettings({ lastActiveWalletId: walletId });
    }
  }

  /**
   * Checks if the keychain is unlocked (keychain decrypted and master key available).
   */
  public async isKeychainUnlocked(): Promise<boolean> {
    const masterKey = await sessionManager.getKeychainMasterKey();
    return masterKey !== null && this.keychain !== null;
  }

  // ============================================================================
  // Settings API (stored inside keychain)
  // ============================================================================

  /**
   * Gets a copy of the current settings.
   * Returns default settings if keychain is not unlocked.
   */
  public getSettings(): AppSettings {
    if (!this.keychain) {
      return { ...DEFAULT_SETTINGS };
    }
    // Return a copy to prevent direct mutation
    return {
      ...this.keychain.settings,
      connectedWebsites: [...(this.keychain.settings.connectedWebsites || [])],
      pinnedAssets: [...(this.keychain.settings.pinnedAssets || [])],
    };
  }

  /**
   * Updates settings and persists the keychain.
   * Requires keychain to be unlocked.
   */
  public async updateSettings(updates: Partial<AppSettings>): Promise<void> {
    if (!this.keychain) {
      throw new Error('Cannot update settings: keychain not unlocked');
    }

    // Merge updates into settings
    this.keychain.settings = {
      ...this.keychain.settings,
      ...updates,
    };

    await this.persistKeychain();

    // If autoLockTimer changed, reschedule the session expiry alarm
    if (updates.autoLockTimer) {
      const timeoutMs = getAutoLockTimeoutMs(updates.autoLockTimer);
      await sessionManager.scheduleSessionExpiry(timeoutMs);
    }
  }

  /**
   * Persists the current keychain state to storage.
   * Called after keychain modifications (wallet add/remove, settings changes).
   */
  private async persistKeychain(): Promise<void> {
    if (!this.keychain) {
      throw new Error('No keychain to persist');
    }

    const masterKey = await sessionManager.getKeychainMasterKey();
    if (!masterKey) {
      throw new Error('Cannot persist keychain: keychain locked');
    }

    // Get existing keychain record for salt
    const existingRecord = await getKeychainRecord();
    if (!existingRecord) {
      throw new Error('Cannot persist keychain: no existing record');
    }

    // Re-encrypt keychain with master key
    const encryptedKeychain = await encryptJsonWithKey(this.keychain, masterKey);

    const updatedRecord: KeychainRecord = {
      version: KEYCHAIN_VERSION,
      kdf: existingRecord.kdf,
      salt: existingRecord.salt,
      encryptedKeychain,
    };

    await saveKeychainRecord(updatedRecord);
  }

  /**
   * Creates a new empty keychain with the given password.
   * Used during initial wallet creation.
   */
  private async createKeychain(password: string): Promise<CryptoKey> {
    const salt = generateRandomBytes(16);
    const masterKey = await deriveKey(password, salt, DEFAULT_PBKDF2_ITERATIONS);

    const newKeychain: Keychain = {
      version: KEYCHAIN_VERSION,
      wallets: [],
      settings: { ...DEFAULT_SETTINGS },
    };

    const encryptedKeychain = await encryptJsonWithKey(newKeychain, masterKey);
    const keychainRecord: KeychainRecord = {
      version: KEYCHAIN_VERSION,
      kdf: { iterations: DEFAULT_PBKDF2_ITERATIONS },
      salt: bufferToBase64(salt),
      encryptedKeychain,
    };

    await saveKeychainRecord(keychainRecord);
    await sessionManager.storeKeychainMasterKey(masterKey);
    this.keychain = newKeychain;

    return masterKey;
  }

  /**
   * Gets the master key, creating a new keychain if this is the first wallet.
   * Used by wallet creation methods to handle both first-wallet and subsequent-wallet cases.
   */
  private async getOrCreateKeychain(password: string): Promise<CryptoKey> {
    const existingKey = await sessionManager.getKeychainMasterKey();
    if (existingKey) {
      return existingKey;
    }

    // First wallet - create keychain and initialize session
    const masterKey = await this.createKeychain(password);

    // Settings are inside keychain, use default timeout for new keychain
    const timeout = getAutoLockTimeoutMs(this.keychain?.settings?.autoLockTimer ?? '5m');
    await sessionManager.initializeSession(timeout);
    await sessionManager.scheduleSessionExpiry(timeout);

    return masterKey;
  }

  /**
   * Clears the decrypted secret for a specific wallet from memory.
   * Used when switching wallets (only one wallet's secret is held at a time).
   */
  public clearWalletSecret(walletId: string): void {
    sessionManager.clearUnlockedSecret(walletId);
    const wallet = this.getWalletById(walletId);
    if (wallet) {
      wallet.addresses = [];
    }
  }

  public async lockKeychain(): Promise<void> {
    await sessionManager.clearAllUnlockedSecrets();
    this.wallets.forEach((wallet) => (wallet.addresses = []));

    // Clear keychain from memory (settings are inside keychain)
    this.keychain = null;

    // Clear session expiry alarm (sessionManager owns the alarm)
    await sessionManager.clearSessionExpiry();
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

    // Update keychain record
    if (!this.keychain) throw new Error('Keychain not loaded');
    const keychainRecord = this.keychain.wallets.find((r) => r.id === walletId);
    if (!keychainRecord) throw new Error('Missing keychain record.');
    keychainRecord.addressCount = wallet.addressCount;
    await this.persistKeychain();

    return newAddr;
  }

  public async removeWallet(walletId: string): Promise<void> {
    const idx = this.wallets.findIndex((w) => w.id === walletId);
    if (idx === -1) throw new Error('Wallet not found in memory.');

    // Remove from memory
    this.wallets.splice(idx, 1);
    sessionManager.clearUnlockedSecret(walletId);

    // Remove from keychain
    if (!this.keychain) throw new Error('Keychain not loaded');
    const keychainIdx = this.keychain.wallets.findIndex((w) => w.id === walletId);
    if (keychainIdx !== -1) {
      this.keychain.wallets.splice(keychainIdx, 1);
    }

    if (this.activeWalletId === walletId) {
      this.activeWalletId = null;
    }

    await this.renumberWallets();
    await this.persistKeychain();
  }

  private renumberWallets(): void {
    if (!this.keychain) return;

    for (let i = 0; i < this.wallets.length; i++) {
      const wallet = this.wallets[i];
      if (!wallet.name.match(/^Wallet \d+$/)) continue;

      const newName = `Wallet ${i + 1}`;
      wallet.name = newName;

      const keychainRecord = this.keychain.wallets.find((r) => r.id === wallet.id);
      if (keychainRecord) keychainRecord.name = newName;
    }
  }

  public async verifyPassword(password: string): Promise<boolean> {
    const keychainRecord = await getKeychainRecord();
    if (!keychainRecord) return false;

    // Try to decrypt the keychain with the given password
    try {
      const salt = base64ToBuffer(keychainRecord.salt);
      const masterKey = await deriveKey(password, salt, keychainRecord.kdf.iterations);
      await decryptJsonWithKey<Keychain>(keychainRecord.encryptedKeychain, masterKey);
      return true;
    } catch {
      return false;
    }
  }

  public async resetKeychain(password: string): Promise<void> {
    const valid = await this.verifyPassword(password);
    if (!valid) throw new Error('Invalid password');

    await this.lockKeychain();
    await deleteKeychain();

    this.wallets = [];
    this.keychain = null;
    this.activeWalletId = null;
  }

  public async updatePassword(currentPassword: string, newPassword: string): Promise<void> {
    const valid = await this.verifyPassword(currentPassword);
    if (!valid) throw new Error('Current password is incorrect');

    const keychainRecord = await getKeychainRecord();
    if (!keychainRecord) throw new Error('No keychain found');

    // Decrypt keychain with current password
    const currentSalt = base64ToBuffer(keychainRecord.salt);
    const currentKey = await deriveKey(currentPassword, currentSalt, keychainRecord.kdf.iterations);
    const decryptedKeychain = await decryptJsonWithKey<Keychain>(keychainRecord.encryptedKeychain, currentKey);

    // Re-encrypt each wallet's secret with new key
    const newSalt = generateRandomBytes(16);
    const newKey = await deriveKey(newPassword, newSalt, DEFAULT_PBKDF2_ITERATIONS);

    // For each wallet, decrypt secret with current key, re-encrypt with new key
    for (const walletRecord of decryptedKeychain.wallets) {
      const secret = await decryptWithKey(walletRecord.encryptedSecret, currentKey);
      walletRecord.encryptedSecret = await encryptWithKey(secret, newKey);
    }

    // Re-encrypt keychain with new key
    const encryptedKeychain = await encryptJsonWithKey(decryptedKeychain, newKey);

    // Save updated keychain (settings are inside, so they're re-encrypted automatically)
    const newKeychainRecord: KeychainRecord = {
      version: KEYCHAIN_VERSION,
      kdf: { iterations: DEFAULT_PBKDF2_ITERATIONS },
      salt: bufferToBase64(newSalt),
      encryptedKeychain,
    };
    await saveKeychainRecord(newKeychainRecord);

    await this.lockKeychain();
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
    // Update preview address to match new format
    const derivationPath = `${getDerivationPathForAddressFormat(newType)}/0`;
    wallet.previewAddress = getAddressFromMnemonic(mnemonic, derivationPath, newType);

    // Update keychain record
    if (!this.keychain) throw new Error('Keychain not loaded');
    const keychainRecord = this.keychain.wallets.find((r) => r.id === walletId);
    if (!keychainRecord) throw new Error('Missing keychain record.');

    keychainRecord.addressFormat = newType;
    keychainRecord.addressCount = 1;
    keychainRecord.previewAddress = wallet.previewAddress;

    await this.persistKeychain();

    if (this.activeWalletId === walletId) {
      await this.setActiveWallet(walletId);
    }
  }

  /**
   * Updates the pinned assets in the global settings.
   * This method is kept for backward compatibility.
   *
   * @param pinnedAssets - Array of asset IDs to pin
   */
  public async updateWalletPinnedAssets(pinnedAssets: string[]): Promise<void> {
    await this.updateSettings({ pinnedAssets });
  }

  public async getPrivateKey(walletId: string, derivationPath?: string): Promise<{ wif: string; hex: string; compressed: boolean }> {
    const wallet = this.getWalletById(walletId);
    if (!wallet) {
      throw new Error(`Wallet not found: ${walletId}`);
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

  /**
   * Get an initialized Trezor adapter for a hardware wallet.
   *
   * Centralizes the common pattern of:
   * 1. Getting hardware wallet secret from session
   * 2. Validating it's a Trezor device
   * 3. Dynamically importing and initializing the adapter
   *
   * @param walletId - The hardware wallet ID
   * @returns Initialized Trezor adapter and DerivationPaths utility
   * @throws Error if wallet is not unlocked or not a Trezor
   */
  private async getInitializedTrezor(walletId: string): Promise<{
    trezor: import('@/utils/hardware/trezorAdapter').TrezorAdapter;
    DerivationPaths: typeof import('@/utils/hardware/types').DerivationPaths;
    hardwareData: HardwareWalletSecret;
  }> {
    const secret = await sessionManager.getUnlockedSecret(walletId);
    if (!secret) {
      throw new Error("Hardware wallet not unlocked");
    }

    const hardwareData: HardwareWalletSecret = JSON.parse(secret);

    if (hardwareData.deviceType !== 'trezor') {
      throw new Error(`Hardware wallet type '${hardwareData.deviceType}' is not yet supported`);
    }

    // Dynamically import to avoid loading @trezor/connect-webextension at startup
    const { getTrezorAdapter } = await import('@/utils/hardware/trezorAdapter');
    const { DerivationPaths } = await import('@/utils/hardware/types');
    const trezor = getTrezorAdapter();

    // Initialize with settings
    const settings = this.getSettings();
    await trezor.init({ testMode: settings?.trezorEmulatorMode });

    return { trezor, DerivationPaths, hardwareData };
  }

  /**
   * Sign a Bitcoin transaction.
   *
   * For software wallets (mnemonic/privateKey), signs the raw transaction hex.
   * For hardware wallets, requires PSBT and signs via the hardware device.
   *
   * @param rawTxHex - Raw transaction hex (used for software wallets)
   * @param sourceAddress - Address signing the transaction
   * @param options - Optional signing options (psbtHex, inputValues, lockScripts for hardware wallets)
   * @returns Signed transaction hex ready for broadcast
   */
  public async signTransaction(
    rawTxHex: string,
    sourceAddress: string,
    options?: SignTransactionOptions
  ): Promise<string> {
    const { psbtHex, inputValues, lockScripts } = options ?? {};
    if (!this.activeWalletId) throw new Error("No active wallet set");
    const wallet = this.getWalletById(this.activeWalletId);
    if (!wallet) throw new Error("Wallet not found");

    const targetAddress = wallet.addresses.find(addr => addr.address === sourceAddress);
    if (!targetAddress) throw new Error("Source address not found in wallet");

    // Hardware wallet signing path
    if (wallet.type === 'hardware') {
      if (!psbtHex) {
        throw new Error("Hardware wallet signing requires a PSBT. The transaction cannot be signed without PSBT data.");
      }

      const { trezor, DerivationPaths } = await this.getInitializedTrezor(wallet.id);

      // Convert derivation path string to number array
      const pathArray = DerivationPaths.stringToPath(targetAddress.path);

      // Complete the PSBT with input values - required for hardware wallet signing
      // The Counterparty API returns PSBTs without witnessUtxo data, providing
      // inputs_values and lock_scripts separately. We need to combine them.
      if (!inputValues || !lockScripts || inputValues.length === 0 || lockScripts.length === 0) {
        throw new Error(
          "Hardware wallet signing requires input values and lock scripts from the API. " +
          "The transaction data appears incomplete. Please try again."
        );
      }
      const completedPsbtHex = completePsbtWithInputValues(psbtHex, inputValues, lockScripts);

      // Create input paths map - all inputs use the same path for single-address wallets
      // For multi-input transactions, we'd need to map each input to its path
      const inputPaths = new Map<number, number[]>();

      // Parse PSBT to find how many inputs there are
      const psbtDetails = extractPsbtDetails(completedPsbtHex);

      // For now, assume all inputs are from our address (single-signer scenario)
      for (let i = 0; i < psbtDetails.inputs.length; i++) {
        inputPaths.set(i, pathArray);
      }

      // Sign PSBT with hardware wallet - returns fully signed raw tx
      const result = await trezor.signPsbt({
        psbtHex: completedPsbtHex,
        inputPaths,
      });

      return result.signedTxHex;
    }

    // Software wallet signing path (mnemonic or private key)
    // Pass input values and lock scripts when available to avoid fetching previous transactions
    const privateKeyResult = await this.getPrivateKey(wallet.id, targetAddress.path);
    return btcSignTransaction(
      rawTxHex,
      wallet,
      targetAddress,
      privateKeyResult.hex,
      privateKeyResult.compressed,
      inputValues,
      lockScripts
    );
  }

  public async broadcastTransaction(signedTxHex: string): Promise<{ txid: string; fees?: number }> {
    return btcBroadcastTransaction(signedTxHex);
  }

  /**
   * Sign a message with the wallet's private key.
   *
   * For software wallets, signs locally with the private key.
   * For hardware wallets, signs via the hardware device.
   *
   * @param message - Message to sign
   * @param address - Address to sign with
   * @returns Signature and signing address
   */
  public async signMessage(message: string, address: string): Promise<{ signature: string; address: string }> {
    if (!this.activeWalletId) throw new Error("No active wallet set");
    const wallet = this.getWalletById(this.activeWalletId);
    if (!wallet) throw new Error("Wallet not found");

    const targetAddress = wallet.addresses.find(addr => addr.address === address);
    if (!targetAddress) throw new Error("Address not found in wallet");

    // Hardware wallet signing path
    if (wallet.type === 'hardware') {
      // Trezor does not support message signing for Taproot (P2TR) addresses
      // Check both wallet format and address prefix (bc1p = Taproot)
      if (wallet.addressFormat === AddressFormat.P2TR || address.startsWith('bc1p')) {
        throw new Error(
          "Trezor does not support message signing for Taproot (P2TR) addresses. " +
          "This is a hardware limitation. To sign messages, use a wallet with a different address type (e.g., Native SegWit bc1q...)."
        );
      }

      const { trezor, DerivationPaths } = await this.getInitializedTrezor(wallet.id);

      // Convert derivation path string to number array
      const pathArray = DerivationPaths.stringToPath(targetAddress.path);

      // Sign message with hardware wallet
      const result = await trezor.signMessage({
        message,
        path: pathArray,
        coin: 'Bitcoin',
      });

      return {
        signature: result.signature,
        address: result.address,
      };
    }

    // Software wallet signing path
    const privateKeyResult = await this.getPrivateKey(wallet.id, targetAddress.path);

    // Use the signMessage function
    return signMessage(message, privateKeyResult.hex, wallet.addressFormat, privateKeyResult.compressed);
  }

  /**
   * Sign a PSBT (Partially Signed Bitcoin Transaction)
   *
   * This method is used by the web provider API (window.bitcoin.signPsbt) for external dApps.
   * It returns a signed PSBT hex (not finalized) that can be combined with other signatures.
   *
   * Note: Hardware wallets cannot use this method because they return fully signed
   * transactions, not PSBTs. For hardware wallet PSBT signing that produces a final
   * transaction, use signTransaction() with a PSBT parameter instead.
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

    // Hardware wallets cannot return signed PSBTs - they return fully signed transactions
    // For PSBT signing that produces a final transaction, use signTransaction() with psbt param
    if (wallet.type === 'hardware') {
      throw new Error(
        "Hardware wallets cannot sign PSBTs through this API. " +
        "Hardware wallets produce fully signed transactions, not signed PSBTs. " +
        "Use the built-in transaction composer or your hardware wallet's native dApp connector."
      );
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
    const seed = getSeedFromMnemonic(mnemonic, addressFormat);
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
    const seed = getSeedFromMnemonic(mnemonic, addressFormat);
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
}

export const walletManager = new WalletManager();
