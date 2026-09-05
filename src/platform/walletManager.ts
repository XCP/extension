import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { AddressFormat, DEFAULT_ADDRESS_FORMAT, getAddressFromMnemonic, getDerivationPathForAddressFormat, isCounterwalletFormat, normalizeAddressForComparison } from '@/core/bitcoin/address';
import { signMessage } from '@/core/bitcoin/messageSigner';
import { decodeWIF, encodeWIF, getAddressFromPrivateKey, getPrivateKeyFromMnemonic, getPublicKeyFromPrivateKey, isWIF } from '@/core/bitcoin/privateKey';
import { signPSBT as btcSignPSBT, completePsbtWithInputValues, parsePSBT } from '@/core/bitcoin/psbt';
import { verifyPsbtPrevouts } from '@/core/bitcoin/psbtPrevouts';
import { broadcastTransaction as btcBroadcastTransaction } from '@/core/bitcoin/transactionBroadcaster';
import { assertTransactionMatchesReviewed, parseTransactionForIntegrity } from '@/core/bitcoin/transactionIntegrity';
import { signTransaction as btcSignTransaction } from '@/core/bitcoin/transactionSigner';
import { isValidCounterwalletMnemonic } from '@/core/counterwallet';
import { base64ToBuffer, bufferToBase64, generateRandomBytes } from '@/core/encryption/buffer';
import {
  DEFAULT_PBKDF2_ITERATIONS,
  decryptWithKey,
  deriveKey,
  deriveKeyAsync,
  encryptWithKey,
} from '@/core/encryption/encryption';
import { mapVerifiedInputPaths } from '@/core/hardware/inputPaths';
import { type AppSettings, DEFAULT_SETTINGS, getAutoLockTimeoutMs, setSettingsProvider } from '@/core/settings';
import {
  deriveAddressesFromSecret,
  deriveMnemonicAddress,
  deriveMnemonicAddresses,
  generateWalletId,
  generateWalletIdFromPrivateKey,
  getPairedAddressFormats,
} from '@/core/wallet/addressDeriver';
import { decryptKeychain, encryptKeychainRecord, KEYCHAIN_VERSION } from '@/core/wallet/keychainCrypto';
import { detectUtxoAddress, isUtxoAddressPath, parseUtxoAddressPath, utxoAddressPath } from '@/core/wallet/rarePepeWallet';
import * as sessionManager from '@/platform/auth/sessionManager';
import { SessionRecoveryState } from '@/platform/auth/sessionManager';
import { whenSessionRecovered } from '@/platform/auth/sessionReady';
import type { SigningIdentity } from '@/platform/auth/signingIdentity';
import {
  assertUnlockAllowed,
  clearUnlockAttempts,
  recordFailedUnlockAttempt,
} from '@/platform/auth/unlockRateLimiter';
import { getTrustedBroadcastPrevout } from '@/platform/provider/recentBroadcasts';
import { createWriteLock } from '@/platform/storage/mutex';
import {
  assertNoKeychainRecord,
  deleteKeychain,
  getKeychainRecord,
  saveKeychainRecord,
} from '@/platform/storage/walletStorage';
// Note: getTrezorAdapter is dynamically imported in createHardwareWalletWithDiscovery to avoid
// loading @trezor/connect-webextension at extension startup (it auto-initializes)

// Import types from centralized types module
import type { Address, HardwareWalletSecret, Keychain, PairedAddresses, SignTransactionOptions, Wallet, WalletRecord } from '@/types/wallet';

// Re-export types for backwards compatibility
export type { Address, Wallet };

// Import from constants for internal use
import { MAX_ADDRESSES_PER_WALLET, MAX_WALLETS } from '@/core/wallet/constants';

// Re-export from constants to maintain backwards compatibility
export { MAX_ADDRESSES_PER_WALLET, MAX_WALLETS };

/** How long a keychain load waits for session recovery before declining to load this time. */
const RECOVERY_WAIT_MS = 5_000;

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

  // Popup, side panel, and provider calls share this background owner. Only public entry points
  // join the queue; internal steps call their private counterparts, so nested mutations never
  // reacquire the lock. Locking itself is immediate and invalidates work already awaiting I/O.
  private readonly withVaultWriteLock = createWriteLock();
  private vaultGeneration = 0;
  private mutationGeneration: number | null = null;
  private lockInFlight: Promise<void> | null = null;

  private mutateVault<T>(operation: () => Promise<T>): Promise<T> {
    const generation = this.vaultGeneration;
    return this.withVaultWriteLock(async () => {
      if (this.lockInFlight) await this.lockInFlight;
      if (generation !== this.vaultGeneration) throw new Error('Wallet session changed; please try again.');
      this.mutationGeneration = generation;
      try {
        return await operation();
      } finally {
        this.mutationGeneration = null;
      }
    });
  }

  /** Check each asynchronous boundary before using a captured key or publishing wallet state. */
  private async mutationStep<T>(operation: Promise<T>): Promise<T> {
    const result = await operation;
    if (this.mutationGeneration !== this.vaultGeneration) {
      throw new Error('Wallet session changed; please try again.');
    }
    return result;
  }

  public async setLastActiveTime(): Promise<void> {
    await sessionManager.setLastActiveTime();
  }

  /**
   * In-flight refresh, so the several requests a waking worker takes at once share one.
   *
   * Not only to save the repeated decrypt: the failure branch clears `keychain` and `wallets`, so
   * one attempt failing could wipe state another had just populated.
   */
  private refreshInFlight: Promise<void> | null = null;

  public async refreshWallets(): Promise<void> {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = this.mutateVault(() => this.doRefreshWallets()).finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  /**
   * Load the keychain into memory from the session master key, if it is not there already.
   *
   * The master key outlives the worker in session storage; the decrypted keychain does not, so
   * until something re-decrypts, a wallet that is genuinely unlocked reports as locked.
   *
   * Waits on session recovery first: on expiry the metadata is cleared before the master key is,
   * so re-deriving inside that window would revive a session that had already timed out.
   */
  public async ensureKeychainLoaded(): Promise<void> {
    if (this.keychain) return;

    // Bounded here rather than at the gate, which stays unresolved so a later call still gets the
    // real verdict. Timing out means "not now", not "locked forever".
    const recovery = await Promise.race([
      whenSessionRecovered(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), RECOVERY_WAIT_MS)),
    ]);
    if (recovery === null || recovery === SessionRecoveryState.LOCKED) return;

    const masterKey = await sessionManager.getKeychainMasterKey();
    if (!masterKey) return;

    await this.refreshWallets();
  }

  private async doRefreshWallets(): Promise<void> {
    // If keychain is already loaded, just refresh addresses
    if (this.keychain) {
      await this.mutationStep(this.refreshWalletAddresses());
      return;
    }

    // Try to reload keychain from session
    const masterKey = await this.mutationStep(sessionManager.getKeychainMasterKey());
    if (!masterKey) return;

    const keychainRecord = await this.mutationStep(getKeychainRecord());
    if (!keychainRecord) return;

    try {
      const decryptedKeychain = await this.mutationStep(decryptKeychain(keychainRecord, masterKey));
      this.keychain = decryptedKeychain;
      this.wallets = decryptedKeychain.wallets.map((r) => this.walletFromRecord(r));
      await this.mutationStep(this.refreshWalletAddresses());

      // Restore active wallet — use selectWallet() instead of just setting activeWalletId
      // so the wallet secret is decrypted and addresses are derived.
      // After a service worker restart, in-memory secrets are lost even though
      // the master key survives in chrome.storage.session.
      const settings = this.getSettings();
      const walletId = settings.lastActiveWalletId || decryptedKeychain.wallets[0]?.id;
      if (walletId && this.getWalletById(walletId)) {
        await this.mutationStep(this.selectWalletInternal(walletId));
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
      extraPaths: record.extraPaths,
      addresses: [],
      isTestOnly: record.isTestOnly,
      previewAddress: record.previewAddress,
    };
  }

  /** Refreshes addresses for all wallets that have unlocked secrets */
  private async refreshWalletAddresses(): Promise<void> {
    if (!this.keychain) return;

    for (const wallet of this.wallets) {
      const secret = await this.mutationStep(sessionManager.getUnlockedSecret(wallet.id));
      if (!secret) {
        wallet.addresses = [];
        continue;
      }

      const record = this.keychain.wallets.find(r => r.id === wallet.id);
      if (!record) continue;

      wallet.addresses = deriveAddressesFromSecret(secret, record);
    }
  }

  public getWallets(): Wallet[] {
    return this.wallets;
  }

  public getActiveWallet(): Wallet | undefined {
    if (!this.activeWalletId) return undefined;
    return this.getWalletById(this.activeWalletId);
  }

  public getWalletById(id: string): Wallet | undefined {
    return this.wallets.find((w) => w.id === id);
  }

  public async isAddressInAnyWallet(address: string): Promise<boolean> {
    const normalizedAddress = address.toLowerCase();

    for (const wallet of this.wallets) {
      if (wallet.previewAddress?.toLowerCase() === normalizedAddress) {
        return true;
      }
      if (wallet.addresses.some((addr) => addr.address.toLowerCase() === normalizedAddress)) {
        return true;
      }
    }

    if (!this.keychain) {
      return false;
    }

    const masterKey = await sessionManager.getKeychainMasterKey();
    if (!masterKey) {
      return false;
    }

    for (const record of this.keychain.wallets) {
      const wallet = this.getWalletById(record.id);
      if (wallet?.addresses.length) {
        continue;
      }

      try {
        const secret = await decryptWithKey(record.encryptedSecret, masterKey);
        const addresses = deriveAddressesFromSecret(secret, record);
        if (addresses.some((addr) => addr.address.toLowerCase() === normalizedAddress)) {
          return true;
        }
      } catch {
        // Ignore wallets that cannot be checked and continue with the rest.
      }
    }

    return false;
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
    addressFormat: AddressFormat = DEFAULT_ADDRESS_FORMAT
  ): Promise<Wallet> {
    return this.mutateVault(() => this.createMnemonicWalletInternal(mnemonic, password, name, addressFormat));
  }

  private async createMnemonicWalletInternal(
    mnemonic: string,
    password: string,
    name?: string,
    addressFormat: AddressFormat = AddressFormat.P2WPKH
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
    const id = await this.mutationStep(generateWalletId(mnemonic, addressFormat));

    if (this.wallets.some((w) => w.id === id)) {
      throw new Error('A wallet with this mnemonic+addressType combination already exists.');
    }

    const masterKey = await this.mutationStep(this.getOrCreateKeychain(password));
    const encryptedSecret = await this.mutationStep(encryptWithKey(mnemonic, masterKey));

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
    await this.mutationStep(this.persistKeychain());

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
    await this.mutationStep(this.selectWalletInternal(id));

    return wallet;
  }

  public async createPrivateKeyWallet(
    privateKey: string,
    password: string,
    name?: string,
    addressFormat: AddressFormat = DEFAULT_ADDRESS_FORMAT
  ): Promise<Wallet> {
    return this.mutateVault(() => this.createPrivateKeyWalletInternal(privateKey, password, name, addressFormat));
  }

  private async createPrivateKeyWalletInternal(
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

    const id = await this.mutationStep(generateWalletIdFromPrivateKey(privateKeyHex, addressFormat));
    if (this.wallets.some((w) => w.id === id)) {
      throw new Error('A wallet with this private key already exists.');
    }

    const masterKey = await this.mutationStep(this.getOrCreateKeychain(password));
    const encryptedSecret = await this.mutationStep(encryptWithKey(secretJson, masterKey));

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
    await this.mutationStep(this.persistKeychain());

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
    await this.mutationStep(this.selectWalletInternal(id));

    return wallet;
  }

  public async importTestAddress(
    address: string,
    name?: string
  ): Promise<Wallet> {
    return this.mutateVault(() => this.importTestAddressInternal(address, name));
  }

  private async importTestAddressInternal(
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

    const masterKey = await this.mutationStep(sessionManager.getKeychainMasterKey());
    if (!masterKey) {
      throw new Error('Keychain must be unlocked to import test addresses');
    }

    // Encrypt test marker with master key (for consistency)
    const encryptedSecret = await this.mutationStep(encryptWithKey(testMarker, masterKey));

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
    await this.mutationStep(this.persistKeychain());

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
    await this.mutationStep(this.updateSettingsInternal({
      lastActiveWalletId: id,
      lastActiveAddress: address
    }));

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

    const masterKey = await this.mutationStep(sessionManager.getKeychainMasterKey());
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
    const encryptedSecret = await this.mutationStep(encryptWithKey(hardwareSecretJson, masterKey));

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
    await this.mutationStep(this.persistKeychain());

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
    await this.mutationStep(this.updateSettingsInternal({
      lastActiveWalletId: id,
      lastActiveAddress: account.address,
    }));

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
    return this.mutateVault(() => this.createHardwareWalletWithDiscoveryInternal(deviceType, name, usePassphrase));
  }

  private async createHardwareWalletWithDiscoveryInternal(
    deviceType: 'trezor' | 'ledger',
    name?: string,
    usePassphrase: boolean = false
  ): Promise<Wallet> {
    // Currently only Trezor is supported
    if (deviceType !== 'trezor') {
      throw new Error(`Hardware wallet type '${deviceType}' is not yet supported`);
    }

    // Dynamically import Trezor adapter
    const { getTrezorAdapter } = await this.mutationStep(import('@/core/hardware/trezorAdapter'));
    const trezor = getTrezorAdapter();

    // Initialize with settings
    const settings = this.getSettings();
    await this.mutationStep(trezor.init({ testMode: settings?.trezorEmulatorMode }));

    // Perform account discovery - this shows Trezor's account selection UI
    // discoverAccount validates the path internally and returns accountIndex
    // KEY: xpub is extracted from descriptor - NO separate getXpub() call needed!
    // This reduces TrezorConnect calls from 2 to 1, meaning fewer permission prompts.
    const discovered = await this.mutationStep(trezor.discoverAccount(usePassphrase));

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
    return this.mutateVault(() => this.unlockKeychainInternal(password));
  }

  private async unlockKeychainInternal(password: string): Promise<void> {
    // Throttle password guessing across service worker restarts
    await this.mutationStep(assertUnlockAllowed());

    const keychainRecord = await this.mutationStep(getKeychainRecord());
    if (!keychainRecord) {
      throw new Error('No keychain found. Create a wallet first.');
    }

    // Derive master key from password + salt (uses Web Worker for non-blocking UI)
    const salt = base64ToBuffer(keychainRecord.salt);
    const masterKey = await this.mutationStep(deriveKeyAsync(password, salt, keychainRecord.kdf.iterations));

    // Decrypt keychain
    let decryptedKeychain: Keychain;
    try {
      decryptedKeychain = await this.mutationStep(decryptKeychain(keychainRecord, masterKey));
    } catch {
      await this.mutationStep(recordFailedUnlockAttempt());
      throw new Error('Invalid password');
    }
    await this.mutationStep(clearUnlockAttempts());

    // Validate keychain version
    if (decryptedKeychain.version !== KEYCHAIN_VERSION) {
      throw new Error(`Unsupported keychain version: ${decryptedKeychain.version}. Expected: ${KEYCHAIN_VERSION}`);
    }

    // Establish a valid deadline before publishing the cached key. Otherwise a concurrent status
    // poll can observe the new key with old/absent metadata and correctly (but destructively) treat
    // it as expired while unlock is still in flight.
    const settings = decryptedKeychain.settings;
    const timeout = getAutoLockTimeoutMs(settings.autoLockTimer);
    await this.mutationStep(sessionManager.initializeSession(timeout));
    await this.mutationStep(sessionManager.scheduleSessionExpiry(timeout));
    await this.mutationStep(sessionManager.storeKeychainMasterKey(masterKey));

    // Publish the decrypted in-memory view only after the session is fully valid.
    this.keychain = decryptedKeychain;
    this.wallets = decryptedKeychain.wallets.map((record) => ({
      id: record.id,
      name: record.name,
      type: record.type,
      addressFormat: record.addressFormat,
      addressCount: record.addressCount,
      extraPaths: record.extraPaths,
      addresses: [], // Empty until selectWallet() is called
      isTestOnly: record.isTestOnly,
      previewAddress: record.previewAddress,
    }));

    // Auto-load last active wallet (from settings inside keychain)
    const walletId = settings.lastActiveWalletId || decryptedKeychain.wallets[0]?.id;
    if (walletId) {
      await this.mutationStep(this.selectWalletInternal(walletId));
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
    return this.mutateVault(() => this.selectWalletInternal(walletId));
  }

  private async selectWalletInternal(walletId: string): Promise<void> {
    const masterKey = await this.mutationStep(sessionManager.getKeychainMasterKey());
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
    const secret = await this.mutationStep(decryptWithKey(record.encryptedSecret, masterKey));
    sessionManager.storeUnlockedSecret(walletId, secret);
    wallet.addresses = deriveAddressesFromSecret(secret, record);
    // Extra paths are appended to the same list but are not part of the sequential run, so they
    // must not count here — `addAddress` derives the next index from this.
    wallet.addressCount = wallet.addresses.filter(
      (address) => !isUtxoAddressPath(address.path)
    ).length;
    this.activeWalletId = walletId;

    // Persist lastActiveWalletId in settings (only on explicit selection)
    if (this.getSettings().lastActiveWalletId !== walletId) {
      await this.mutationStep(this.updateSettingsInternal({ lastActiveWalletId: walletId }));
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
      return {
        ...DEFAULT_SETTINGS,
        providerCapabilities: { ...DEFAULT_SETTINGS.providerCapabilities },
      };
    }
    // DEFAULT_SETTINGS first backfills fields missing from keychains created
    // under an older schema; stored values override. Copy to prevent mutation.
    return {
      ...DEFAULT_SETTINGS,
      ...this.keychain.settings,
      connectedWebsites: [...(this.keychain.settings.connectedWebsites || [])],
      providerCapabilities: Object.fromEntries(
        Object.entries(this.keychain.settings.providerCapabilities ?? {}).map(
          ([origin, capability]) => [origin, { ...capability }]
        )
      ),
      pinnedAssets: [...(this.keychain.settings.pinnedAssets || [])],
    };
  }

  /**
   * Updates settings and persists the keychain.
   * Requires keychain to be unlocked.
   */
  public async updateSettings(updates: Partial<AppSettings>): Promise<void> {
    return this.mutateVault(() => this.updateSettingsInternal(updates));
  }

  private async updateSettingsInternal(updates: Partial<AppSettings>): Promise<void> {
    if (!this.keychain) {
      throw new Error('Cannot update settings: keychain not unlocked');
    }

    // Merge updates into settings
    this.keychain.settings = {
      ...this.keychain.settings,
      ...updates,
    };

    await this.mutationStep(this.persistKeychain());

    // Persist the new idle limit in session metadata too, so activity and worker recovery keep it.
    if (updates.autoLockTimer) {
      const timeoutMs = getAutoLockTimeoutMs(updates.autoLockTimer);
      await this.mutationStep(sessionManager.updateSessionTimeout(timeoutMs));
    }
  }

  /** Persist a connection and its optional paired-address grant in one keychain write. */
  public addConnectedWebsite(origin: string, pairedIdentity?: { walletId: string; address: string }): Promise<void> {
    return this.mutateVault(async () => {
      const settings = this.getSettings();
      const providerCapabilities = { ...settings.providerCapabilities };
      if (pairedIdentity) providerCapabilities[origin] = { pairedAddresses: true, ...pairedIdentity };
      else delete providerCapabilities[origin];
      await this.updateSettingsInternal({
        connectedWebsites: [...new Set([...settings.connectedWebsites, origin])],
        providerCapabilities,
      });
    });
  }

  public removeConnectedWebsite(origin: string): Promise<void> {
    return this.mutateVault(async () => {
      const settings = this.getSettings();
      const providerCapabilities = { ...settings.providerCapabilities };
      delete providerCapabilities[origin];
      await this.updateSettingsInternal({
        connectedWebsites: settings.connectedWebsites.filter(site => site !== origin),
        providerCapabilities,
      });
    });
  }

  public clearConnectedWebsites(): Promise<void> {
    return this.updateSettings({ connectedWebsites: [], providerCapabilities: {} });
  }

  /** A revoked connection cannot be recreated by an in-flight capability approval. */
  public setPairedAddressPermission(origin: string, identity: { walletId: string; address: string } | null): Promise<void> {
    return this.mutateVault(async () => {
      const settings = this.getSettings();
      if (identity && !settings.connectedWebsites.includes(origin)) {
        throw new Error('Site disconnected before paired address access was granted');
      }
      const providerCapabilities = { ...settings.providerCapabilities };
      if (identity) providerCapabilities[origin] = { pairedAddresses: true, ...identity };
      else delete providerCapabilities[origin];
      await this.updateSettingsInternal({ providerCapabilities });
    });
  }

  /**
   * Persists the current keychain state to storage.
   * Called after keychain modifications (wallet add/remove, settings changes).
   */
  private async persistKeychain(): Promise<void> {
    if (!this.keychain) {
      throw new Error('No keychain to persist');
    }

    // Snapshot before yielding: locking clears the live view, and no async crypto operation may
    // serialize that cleared view (or metadata from a subsequent session).
    const keychain = structuredClone(this.keychain);

    const masterKey = await this.mutationStep(sessionManager.getKeychainMasterKey());
    if (!masterKey) {
      throw new Error('Cannot persist keychain: keychain locked');
    }

    // Get existing keychain record for salt
    const existingRecord = await this.mutationStep(getKeychainRecord());
    if (!existingRecord) {
      throw new Error('Cannot persist keychain: no existing record');
    }

    const updatedRecord = await this.mutationStep(encryptKeychainRecord(
      keychain,
      masterKey,
      existingRecord.salt,
      existingRecord.kdf.iterations,
    ));

    await this.mutationStep(saveKeychainRecord(updatedRecord));
  }

  /**
   * Creates a new empty keychain with the given password.
   * Used during initial wallet creation.
   */
  private async createKeychain(password: string): Promise<{
    masterKey: CryptoKey;
    keychain: Keychain;
  }> {
    // A missing session key means "locked" as well as "first use". Prove absence on disk before
    // doing any work, then recheck immediately before the destructive write.
    await this.mutationStep(assertNoKeychainRecord());
    const salt = generateRandomBytes(16);
    const masterKey = await this.mutationStep(deriveKey(password, salt, DEFAULT_PBKDF2_ITERATIONS));

    const newKeychain: Keychain = {
      version: KEYCHAIN_VERSION,
      wallets: [],
      settings: { ...DEFAULT_SETTINGS },
    };

    const keychainRecord = await this.mutationStep(encryptKeychainRecord(
      newKeychain,
      masterKey,
      bufferToBase64(salt),
      DEFAULT_PBKDF2_ITERATIONS,
    ));

    await this.mutationStep(assertNoKeychainRecord());
    await this.mutationStep(saveKeychainRecord(keychainRecord));

    return { masterKey, keychain: newKeychain };
  }

  /**
   * Gets the master key, creating a new keychain if this is the first wallet.
   * Used by wallet creation methods to handle both first-wallet and subsequent-wallet cases.
   */
  private async getOrCreateKeychain(password: string): Promise<CryptoKey> {
    const existingKey = await this.mutationStep(sessionManager.getKeychainMasterKey());
    if (existingKey) {
      return existingKey;
    }

    // First wallet - create keychain and initialize session
    const { masterKey, keychain } = await this.mutationStep(this.createKeychain(password));

    // Settings are inside keychain, use default timeout for new keychain
    const timeout = getAutoLockTimeoutMs(keychain.settings.autoLockTimer);
    await this.mutationStep(sessionManager.initializeSession(timeout));
    await this.mutationStep(sessionManager.scheduleSessionExpiry(timeout));
    await this.mutationStep(sessionManager.storeKeychainMasterKey(masterKey));
    this.keychain = keychain;

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
    if (this.lockInFlight) return this.lockInFlight;
    ++this.vaultGeneration;
    // Clear the visible state before the first await. Pending crypto/storage reads cannot restore
    // it: every mutation continuation checks the generation before publishing its result.
    this.wallets.forEach((wallet) => { wallet.addresses = []; });
    this.keychain = null;
    const lock = this.finishLock().finally(() => {
      if (this.lockInFlight === lock) this.lockInFlight = null;
    });
    this.lockInFlight = lock;
    return lock;
  }

  private async finishLock(): Promise<void> {
    let cleanupError: unknown;
    try {
      await sessionManager.clearAllUnlockedSecrets();
    } catch (err) {
      cleanupError = err;
    }

    try {
      await sessionManager.clearSessionExpiry();
    } catch (err) {
      cleanupError ??= err;
    }

    if (cleanupError) throw cleanupError;
  }

  public async addAddress(walletId: string): Promise<Address> {
    return this.mutateVault(() => this.addAddressInternal(walletId));
  }

  private async addAddressInternal(walletId: string): Promise<Address> {
    const wallet = this.getWalletById(walletId);
    if (!wallet) throw new Error('Wallet not found.');
    if (wallet.type !== 'mnemonic')
      throw new Error('Can only add addresses to a mnemonic wallet.');
    const mnemonic = await this.mutationStep(sessionManager.getUnlockedSecret(walletId));
    if (!mnemonic)
      throw new Error('Wallet is locked. Please unlock first.');
    if (wallet.addressCount >= MAX_ADDRESSES_PER_WALLET) {
      throw new Error(`Cannot exceed ${MAX_ADDRESSES_PER_WALLET} addresses.`);
    }

    const index = wallet.addressCount;
    const newAddr = deriveMnemonicAddress(mnemonic, wallet.addressFormat, index);
    wallet.addresses.push(newAddr);
    wallet.addressCount++;

    // Update keychain record
    if (!this.keychain) throw new Error('Keychain not loaded');
    const keychainRecord = this.keychain.wallets.find((r) => r.id === walletId);
    if (!keychainRecord) throw new Error('Missing keychain record.');
    keychainRecord.addressCount = wallet.addressCount;
    await this.mutationStep(this.persistKeychain());

    return newAddr;
  }

  public async removeWallet(walletId: string): Promise<void> {
    return this.mutateVault(() => this.removeWalletInternal(walletId));
  }

  private async removeWalletInternal(walletId: string): Promise<void> {
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

    this.renumberWallets();
    await this.mutationStep(this.persistKeychain());
  }

  private renumberWallets(): void {
    if (!this.keychain) return;

    for (let i = 0; i < this.wallets.length; i++) {
      const wallet = this.wallets[i]!;
      if (!wallet.name.match(/^Wallet \d+$/)) continue;

      const newName = `Wallet ${i + 1}`;
      wallet.name = newName;

      const keychainRecord = this.keychain.wallets.find((r) => r.id === wallet.id);
      if (keychainRecord) keychainRecord.name = newName;
    }
  }

  public async verifyPassword(password: string): Promise<boolean> {
    return this.mutateVault(() => this.verifyPasswordInternal(password));
  }

  private async verifyPasswordInternal(password: string): Promise<boolean> {
    // Shares the unlock failure window: verifyPassword is the same oracle
    await this.mutationStep(assertUnlockAllowed());

    const keychainRecord = await this.mutationStep(getKeychainRecord());
    if (!keychainRecord) return false;

    // Try to decrypt the keychain with the given password
    try {
      const salt = base64ToBuffer(keychainRecord.salt);
      const masterKey = await this.mutationStep(deriveKey(password, salt, keychainRecord.kdf.iterations));
      await this.mutationStep(decryptKeychain(keychainRecord, masterKey));
      await this.mutationStep(clearUnlockAttempts());
      return true;
    } catch {
      await this.mutationStep(recordFailedUnlockAttempt());
      return false;
    }
  }

  public async resetKeychain(password: string): Promise<void> {
    return this.mutateVault(() => this.resetKeychainInternal(password));
  }

  private async resetKeychainInternal(password: string): Promise<void> {
    const valid = await this.mutationStep(this.verifyPasswordInternal(password));
    if (!valid) throw new Error('Invalid password');

    await this.mutationStep(deleteKeychain());
    await this.lockKeychain();

    this.wallets = [];
    this.keychain = null;
    this.activeWalletId = null;
  }

  public async updatePassword(currentPassword: string, newPassword: string): Promise<void> {
    return this.mutateVault(() => this.updatePasswordInternal(currentPassword, newPassword));
  }

  private async updatePasswordInternal(currentPassword: string, newPassword: string): Promise<void> {
    const valid = await this.mutationStep(this.verifyPasswordInternal(currentPassword));
    if (!valid) throw new Error('Current password is incorrect');

    const keychainRecord = await this.mutationStep(getKeychainRecord());
    if (!keychainRecord) throw new Error('No keychain found');

    // Decrypt keychain with current password
    const currentSalt = base64ToBuffer(keychainRecord.salt);
    const currentKey = await this.mutationStep(deriveKey(currentPassword, currentSalt, keychainRecord.kdf.iterations));
    const decryptedKeychain = await this.mutationStep(decryptKeychain(keychainRecord, currentKey));

    // Re-encrypt each wallet's secret with new key
    const newSalt = generateRandomBytes(16);
    const newKey = await this.mutationStep(deriveKey(newPassword, newSalt, DEFAULT_PBKDF2_ITERATIONS));

    // For each wallet, decrypt secret with current key, re-encrypt with new key
    for (const walletRecord of decryptedKeychain.wallets) {
      const secret = await this.mutationStep(decryptWithKey(walletRecord.encryptedSecret, currentKey));
      walletRecord.encryptedSecret = await this.mutationStep(encryptWithKey(secret, newKey));
    }

    // Re-encrypt the keychain with the new key (settings are inside, so they
    // are re-encrypted automatically).
    const newKeychainRecord = await this.mutationStep(encryptKeychainRecord(
      decryptedKeychain,
      newKey,
      bufferToBase64(newSalt),
      DEFAULT_PBKDF2_ITERATIONS,
    ));
    await this.mutationStep(saveKeychainRecord(newKeychainRecord));

    await this.lockKeychain();
  }

  public async updateWalletAddressFormat(walletId: string, newType: AddressFormat): Promise<void> {
    return this.mutateVault(() => this.updateWalletAddressFormatInternal(walletId, newType));
  }

  private async updateWalletAddressFormatInternal(walletId: string, newType: AddressFormat): Promise<void> {
    const wallet = this.getWalletById(walletId);
    if (!wallet) throw new Error('Wallet not found');
    if (wallet.type !== 'mnemonic') {
      throw new Error('Only mnemonic wallets can change address type.');
    }
    const mnemonic = await this.mutationStep(sessionManager.getUnlockedSecret(walletId));
    if (!mnemonic) {
      throw new Error('Wallet is locked. Please unlock first.');
    }

    // Address count belongs to the mnemonic wallet. A format switch changes the
    // derivation branch, not how many derivation indices the user has exposed.
    const activeAddress = wallet.addresses.find(
      address => address.address === this.getSettings().lastActiveAddress
    ) ?? wallet.addresses[0];
    const activeIndex = activeAddress
      ? Number(activeAddress.path.split('/').at(-1))
      : 0;
    const selectedIndex = Number.isSafeInteger(activeIndex) && activeIndex >= 0
      ? Math.min(activeIndex, Math.max(wallet.addressCount - 1, 0))
      : 0;

    wallet.addressFormat = newType;
    wallet.addresses = deriveMnemonicAddresses(
      mnemonic,
      newType,
      Math.max(wallet.addressCount, 1)
    );
    wallet.previewAddress = wallet.addresses[0]!.address;

    // Update keychain record
    if (!this.keychain) throw new Error('Keychain not loaded');
    const keychainRecord = this.keychain.wallets.find((r) => r.id === walletId);
    if (!keychainRecord) throw new Error('Missing keychain record.');

    keychainRecord.addressFormat = newType;
    keychainRecord.previewAddress = wallet.previewAddress;

    if (this.activeWalletId === walletId) {
      this.keychain.settings.lastActiveAddress = wallet.addresses[selectedIndex]!.address;
    }

    await this.mutationStep(this.persistKeychain());
  }

  /**
   * Looks for funded Rare Pepe Wallet UTXO addresses paired with the given address indexes.
   *
   * One pass: the lookups run together and anything found is written once, so a caller never pays
   * a persist per index. Indexes already kept are skipped, which is what keeps the automatic
   * callers honest — each address is checked exactly once, when it first appears, and no later
   * pass re-asks about an index that came back empty.
   */
  private async findUtxoAddresses(
    walletId: string,
    indexes: number[],
    onUnavailable: 'throw' | 'ignore'
  ): Promise<Address[]> {
    const wallet = this.getWalletById(walletId);
    if (!wallet) throw new Error('Wallet not found');
    if (wallet.type !== 'mnemonic') {
      throw new Error('Only mnemonic wallets have UTXO addresses.');
    }
    if (!isCounterwalletFormat(wallet.addressFormat)) {
      throw new Error('UTXO addresses exist only for Counterwallet address formats.');
    }

    const mnemonic = await this.mutationStep(sessionManager.getUnlockedSecret(walletId));
    if (!mnemonic) {
      throw new Error('Wallet is locked. Please unlock first.');
    }

    const kept = new Set(wallet.extraPaths ?? []);
    const pending = [...new Set(indexes)]
      .map((index) => utxoAddressPath(index))
      .filter((path) => !kept.has(path));
    if (pending.length === 0) {
      return wallet.addresses.filter((address) => kept.has(address.path));
    }

    const results = await this.mutationStep(Promise.all(
      pending.map(async (path) => ({
        path,
        result: await this.mutationStep(detectUtxoAddress(
          mnemonic,
          wallet.addressFormat,
          parseUtxoAddressPath(path) as number
        )),
      }))
    ));

    if (onUnavailable === 'throw' && results.some(({ result }) => result.status === 'unavailable')) {
      throw new Error('Could not check for a UTXO address. Please try again.');
    }

    const discovered = results
      .filter(({ result }) => result.status === 'found')
      .map(({ path }) => path);
    if (discovered.length === 0) return [];

    if (!this.keychain) throw new Error('Keychain not loaded');
    const keychainRecord = this.keychain.wallets.find((r) => r.id === walletId);
    if (!keychainRecord) throw new Error('Missing keychain record.');

    keychainRecord.extraPaths = [...(keychainRecord.extraPaths ?? []), ...discovered];
    wallet.extraPaths = keychainRecord.extraPaths;
    wallet.addresses = deriveAddressesFromSecret(mnemonic, keychainRecord);
    await this.mutationStep(this.persistKeychain());

    return wallet.addresses.filter((address) => discovered.includes(address.path));
  }

  /**
   * Looks for a funded Rare Pepe Wallet UTXO address paired with `index`, and keeps it if found.
   *
   * Returns the address, or null when the change address is empty — which is the ordinary answer,
   * since only someone who used Rare Pepe Wallet's UTXO-attached assets has one. Throws when the
   * lookup could not be made, so an outage is never reported as "you don't have one".
   */
  public async addUtxoAddress(walletId: string, index: number): Promise<Address | null> {
    return this.mutateVault(() => this.addUtxoAddressInternal(walletId, index));
  }

  private async addUtxoAddressInternal(walletId: string, index: number): Promise<Address | null> {
    const found = await this.mutationStep(this.findUtxoAddresses(walletId, [index], 'throw'));
    return found[0] ?? null;
  }

  /**
   * The same lookup, run for a wallet's addresses without being asked and without complaining.
   *
   * Called where an address first enters the wallet, so the automatic cost is one lookup per
   * address ever created and never a repeat. Silent by design: nothing was asked for, so an
   * unreachable API means only that nothing was found this time, and the address menu keeps the
   * deliberate check that does report an outage.
   */
  public async sweepUtxoAddresses(walletId: string, indexes?: number[]): Promise<Address[]> {
    return this.mutateVault(() => this.sweepUtxoAddressesInternal(walletId, indexes));
  }

  private async sweepUtxoAddressesInternal(walletId: string, indexes?: number[]): Promise<Address[]> {
    const wallet = this.getWalletById(walletId);
    if (!wallet || wallet.type !== 'mnemonic') return [];
    if (!isCounterwalletFormat(wallet.addressFormat)) return [];

    const targets = indexes ?? Array.from({ length: wallet.addressCount }, (_, index) => index);
    try {
      return await this.mutationStep(this.findUtxoAddresses(walletId, targets, 'ignore'));
    } catch (error) {
      console.warn('UTXO address sweep failed:', error);
      return [];
    }
  }

  /** Drops a kept UTXO address. The funds are unaffected; only the listing forgets it. */
  public async removeUtxoAddress(walletId: string, path: string): Promise<void> {
    return this.mutateVault(() => this.removeUtxoAddressInternal(walletId, path));
  }

  private async removeUtxoAddressInternal(walletId: string, path: string): Promise<void> {
    const wallet = this.getWalletById(walletId);
    if (!wallet) throw new Error('Wallet not found');
    if (!this.keychain) throw new Error('Keychain not loaded');
    const keychainRecord = this.keychain.wallets.find((r) => r.id === walletId);
    if (!keychainRecord) throw new Error('Missing keychain record.');

    const remaining = (keychainRecord.extraPaths ?? []).filter((kept) => kept !== path);
    if (remaining.length === (keychainRecord.extraPaths ?? []).length) return;

    keychainRecord.extraPaths = remaining;
    wallet.extraPaths = remaining;

    const mnemonic = await this.mutationStep(sessionManager.getUnlockedSecret(walletId));
    if (mnemonic) {
      wallet.addresses = deriveAddressesFromSecret(mnemonic, keychainRecord);
    } else {
      wallet.addresses = wallet.addresses.filter((address) => address.path !== path);
    }
    await this.mutationStep(this.persistKeychain());
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
      const { hex: privateKeyHex, compressed } = JSON.parse(secret);
      return getAddressFromPrivateKey(privateKeyHex, addressFormat, compressed);
    }
  }

  public async getPairedAddresses(): Promise<PairedAddresses> {
    if (!this.activeWalletId) throw new Error('No active wallet set');
    const wallet = this.getWalletById(this.activeWalletId);
    if (!wallet || wallet.type !== 'mnemonic') {
      throw new Error('Paired addresses are available only for mnemonic wallets');
    }
    const formats = getPairedAddressFormats(wallet.addressFormat);
    if (!formats) throw new Error('The active address format has no paired Legacy/SegWit format');
    const activeAddress = wallet.addresses.find(
      address => address.address === this.getSettings().lastActiveAddress
    ) ?? wallet.addresses[0];
    if (!activeAddress) throw new Error('No active address');
    const index = Number(activeAddress.path.split('/').at(-1));
    if (!Number.isSafeInteger(index) || index < 0) throw new Error('Invalid active derivation index');
    const secret = await sessionManager.getUnlockedSecret(wallet.id);
    if (!secret) throw new Error('Wallet is locked');
    return {
      legacy: { ...deriveMnemonicAddress(secret, formats.legacy, index), format: formats.legacy, type: 'p2pkh' },
      segwit: { ...deriveMnemonicAddress(secret, formats.segwit, index), format: formats.segwit, type: 'p2wpkh' },
    };
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
    trezor: import('@/core/hardware/trezorAdapter').TrezorAdapter;
    DerivationPaths: typeof import('@/core/hardware/types').DerivationPaths;
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
    const { getTrezorAdapter } = await import('@/core/hardware/trezorAdapter');
    const { DerivationPaths } = await import('@/core/hardware/types');
    const trezor = getTrezorAdapter();

    // Initialize with settings
    const settings = this.getSettings();
    await trezor.init({ testMode: settings?.trezorEmulatorMode });

    return { trezor, DerivationPaths, hardwareData };
  }

  /** Bind in-flight signing to the session and active identity captured before any awaited work. */
  private createSigningGuard(expectedIdentity?: SigningIdentity): () => void {
    const generation = sessionManager.getSessionGeneration();
    const wallet = this.getActiveWallet();
    const activeAddress = wallet?.addresses.find(
      address => address.address === this.getSettings().lastActiveAddress
    ) ?? wallet?.addresses[0];
    if (!wallet || !activeAddress) throw new Error('No active signing identity');
    const identity = { walletId: wallet.id, address: activeAddress.address };
    if (expectedIdentity && (
      expectedIdentity.walletId !== identity.walletId
      || normalizeAddressForComparison(expectedIdentity.address) !== normalizeAddressForComparison(identity.address)
    )) {
      throw new Error('The signing identity changed after this request was approved.');
    }
    const assertStillAuthorized = () => {
      sessionManager.assertSessionGeneration(generation);
      const currentWallet = this.getActiveWallet();
      const currentAddress = currentWallet?.addresses.find(
        address => address.address === this.getSettings().lastActiveAddress
      ) ?? currentWallet?.addresses[0];
      if (currentWallet?.id !== identity.walletId || currentAddress?.address !== identity.address) {
        throw new Error('The signing identity changed after this request was approved.');
      }
    };
    assertStillAuthorized();
    return assertStillAuthorized;
  }

  /** Sign the reviewed raw transaction; a hardware PSBT must describe those exact same bytes. */
  public async signTransaction(
    rawTxHex: string,
    sourceAddress: string,
    options?: SignTransactionOptions,
    expectedIdentity?: SigningIdentity,
  ): Promise<string> {
    const assertStillAuthorized = this.createSigningGuard(expectedIdentity);
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

      // Treat amounts/scripts shipped beside the PSBT as hints only. Resolve the raw parent
      // transaction for every input, bind the outpoint to it, and use those independently
      // verified values for both device display and signing.
      const verified = await verifyPsbtPrevouts(psbtHex, {
        resolveTrustedPrevout: getTrustedBroadcastPrevout,
      });
      const verifiedValues = verified.prevouts.map((prevout) => Number(prevout.amount));
      const verifiedScripts = verified.prevouts.map((prevout) => bytesToHex(prevout.script));
      if (
        inputValues
        && (
          inputValues.length !== verifiedValues.length
          || inputValues.some((value, index) => value !== verifiedValues[index])
        )
      ) {
        throw new Error('Counterparty input values do not match the real previous outputs');
      }
      if (
        lockScripts
        && (
          lockScripts.length !== verifiedScripts.length
          || lockScripts.some((script, index) => script.toLowerCase() !== verifiedScripts[index])
        )
      ) {
        throw new Error('Counterparty lock scripts do not match the real previous outputs');
      }
      const completedPsbtHex = completePsbtWithInputValues(
        verified.hex,
        verifiedValues,
        verifiedScripts,
      );

      const reviewed = parseTransactionForIntegrity(rawTxHex);
      assertTransactionMatchesReviewed(parsePSBT(completedPsbtHex), reviewed);

      const { trezor, DerivationPaths } = await this.getInitializedTrezor(wallet.id);
      const inputPaths = mapVerifiedInputPaths(
        verified.prevouts,
        wallet.addresses,
        (path) => DerivationPaths.stringToPath(path),
      );

      // Sign PSBT with hardware wallet - returns fully signed raw tx
      assertStillAuthorized();
      const result = await trezor.signPsbt({
        psbtHex: completedPsbtHex,
        inputPaths,
      });

      assertStillAuthorized();
      assertTransactionMatchesReviewed(parseTransactionForIntegrity(result.signedTxHex), reviewed);
      return result.signedTxHex;
    }

    // Software wallet signing path (mnemonic or private key)
    // Pass input values and lock scripts when available to avoid fetching previous transactions
    const privateKeyResult = await this.getPrivateKey(wallet.id, targetAddress.path);
    assertStillAuthorized();
    const signedTxHex = await btcSignTransaction(
      rawTxHex,
      wallet,
      targetAddress,
      privateKeyResult.hex,
      privateKeyResult.compressed,
      inputValues,
      lockScripts,
      getTrustedBroadcastPrevout,
      assertStillAuthorized,
    );
    assertStillAuthorized();
    return signedTxHex;
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
  public async signMessage(message: string, address: string, expectedIdentity?: SigningIdentity): Promise<{ signature: string; address: string }> {
    const assertStillAuthorized = this.createSigningGuard(expectedIdentity);
    if (!this.activeWalletId) throw new Error("No active wallet set");
    const wallet = this.getWalletById(this.activeWalletId);
    if (!wallet) throw new Error("Wallet not found");

    const normalizedAddress = normalizeAddressForComparison(address);
    const paired = wallet.type === 'mnemonic' && getPairedAddressFormats(wallet.addressFormat)
      ? await this.getPairedAddresses()
      : null;
    const pairedTarget = paired
      ? [paired.legacy, paired.segwit].find(
          candidate => normalizeAddressForComparison(candidate.address) === normalizedAddress
        )
      : undefined;
    const targetAddress = wallet.addresses.find(
      candidate => normalizeAddressForComparison(candidate.address) === normalizedAddress
    ) ?? pairedTarget;
    if (!targetAddress) throw new Error("Address not found in wallet");
    const targetFormat = pairedTarget?.format ?? wallet.addressFormat;

    // Hardware wallet signing path
    if (wallet.type === 'hardware') {
      // Trezor does not support message signing for Taproot (P2TR) addresses
      // Check both wallet format and address prefix (bc1p = Taproot)
      if (targetFormat === AddressFormat.P2TR || address.startsWith('bc1p')) {
        throw new Error(
          "Trezor does not support message signing for Taproot (P2TR) addresses. " +
          "This is a hardware limitation. To sign messages, use a wallet with a different address type (e.g., Native SegWit bc1q...)."
        );
      }

      const { trezor, DerivationPaths } = await this.getInitializedTrezor(wallet.id);

      // Convert derivation path string to number array
      const pathArray = DerivationPaths.stringToPath(targetAddress.path);

      // Sign message with hardware wallet
      assertStillAuthorized();
      const result = await trezor.signMessage({
        message,
        path: pathArray,
        coin: 'Bitcoin',
      });

      assertStillAuthorized();
      return {
        signature: result.signature,
        address: result.address,
      };
    }

    // Software wallet signing path
    const privateKeyResult = await this.getPrivateKey(wallet.id, targetAddress.path);

    // Use the signMessage function
    assertStillAuthorized();
    const result = await signMessage(message, privateKeyResult.hex, targetFormat, privateKeyResult.compressed);
    assertStillAuthorized();
    return result;
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
    sighashTypes?: number[],
    expectedIdentity?: SigningIdentity,
  ): Promise<string> {
    const assertStillAuthorized = this.createSigningGuard(expectedIdentity);
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

    // The PSBT may contain witnessUtxo metadata supplied by an untrusted dApp. Validate every
    // input against its actual parent transaction before selecting keys or producing signatures.
    const requestedInputIndices = signInputs && Object.keys(signInputs).length > 0
      ? Object.values(signInputs).flat()
      : undefined;
    const verified = await verifyPsbtPrevouts(psbtHex, {
      resolveTrustedPrevout: getTrustedBroadcastPrevout,
      ...(requestedInputIndices ? { inputIndices: requestedInputIndices } : {}),
    });
    psbtHex = verified.hex;

    // If signInputs is provided, sign only the specified inputs
    // Otherwise, sign all inputs we can (using the active address)
    if (signInputs && Object.keys(signInputs).length > 0) {
      let signedPsbtHex = psbtHex;

      const paired = wallet.type === 'mnemonic' && getPairedAddressFormats(wallet.addressFormat)
        ? await this.getPairedAddresses()
        : null;
      for (const [address, inputIndices] of Object.entries(signInputs)) {
        const normalizedAddress = normalizeAddressForComparison(address);
        const pairedTarget = paired
          ? [paired.legacy, paired.segwit].find(
              addr => normalizeAddressForComparison(addr.address) === normalizedAddress
            )
          : undefined;
        const targetAddress = wallet.addresses.find(
          addr => normalizeAddressForComparison(addr.address) === normalizedAddress
        ) ?? pairedTarget;
        if (!targetAddress) {
          throw new Error(`Address ${address} not found in wallet`);
        }

        const targetFormat = pairedTarget?.format ?? wallet.addressFormat;
        const secret = await sessionManager.getUnlockedSecret(wallet.id);
        if (!secret) throw new Error('Wallet is locked');
        const privateKeyHex = targetFormat === wallet.addressFormat
          ? (await this.getPrivateKey(wallet.id, targetAddress.path)).hex
          : getPrivateKeyFromMnemonic(secret, targetAddress.path, targetFormat);
        assertStillAuthorized();
        signedPsbtHex = btcSignPSBT(
          signedPsbtHex,
          privateKeyHex,
          inputIndices,
          targetFormat,
          sighashTypes
        );
      }

      return signedPsbtHex;
    } else {
      // Preserve legacy best-effort signing, but only with the connected active address.
      const activeAddress = wallet.addresses.find(
        address => address.address === this.getSettings().lastActiveAddress
      ) ?? wallet.addresses[0];
      if (!activeAddress) {
        throw new Error("No addresses in wallet");
      }

      const privateKeyResult = await this.getPrivateKey(wallet.id, activeAddress.path);
      assertStillAuthorized();
      return btcSignPSBT(
        psbtHex,
        privateKeyResult.hex,
        [], // Empty array means try all inputs
        wallet.addressFormat,
        sighashTypes
      );
    }
  }

}

export const walletManager = new WalletManager();

// Expose read-only settings to modules that must not import the wallet singleton.
setSettingsProvider(() => walletManager.getSettings());
