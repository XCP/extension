import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { getAddressFromMnemonic, getDerivationPathForAddressFormat } from '@/core/bitcoin/address';
import { AddressFormat, DEFAULT_ADDRESS_FORMAT, isCounterwalletFormat } from '@/core/bitcoin/addressFormat';
import type { ConsolidationResult } from '@/core/bitcoin/consolidateBatch';
import type { ConsolidationData } from '@/core/bitcoin/consolidationApi';
import { decodeWIF, encodeWIF, getAddressFromPrivateKey, getPublicKeyFromPrivateKey, isWIF } from '@/core/bitcoin/privateKey';
import { broadcastTransaction as btcBroadcastTransaction } from '@/core/bitcoin/transactionBroadcaster';
import { isValidCounterwalletMnemonic } from '@/core/counterwallet/mnemonic';
import { base64ToBuffer, bufferToBase64, generateRandomBytes } from '@/core/encryption/buffer';
import {
  DEFAULT_PBKDF2_ITERATIONS,
  decryptWithKey,
  deriveKey,
  deriveKeyAsync,
  encryptWithKey,
} from '@/core/encryption/encryption';
import { type AppSettings, DEFAULT_SETTINGS, getAutoLockTimeoutMs, setSettingsProvider } from '@/core/settings';
import {
  deriveAddressesFromSecret,
  deriveHardwareAddress,
  deriveMnemonicAddress,
  deriveMnemonicAddresses,
  generateWalletId,
  generateWalletIdFromPrivateKey,
  getPairedAddressFormats,
  type HdNodeCache,
  mnemonicPrivateKeyAt,
} from '@/core/wallet/addressDeriver';
import { addressIndexKeptBySwitch } from '@/core/wallet/addressFormatChoices';
import { decryptKeychain, encryptKeychainRecord, KEYCHAIN_VERSION } from '@/core/wallet/keychainCrypto';
import { detectUtxoAddress, isUtxoAddressPath, parseUtxoAddressPath, utxoAddressPath } from '@/core/wallet/rarePepeWallet';
import { type KnownZeldOutpoint, knownZeldOutpoints, parseZeldOutpointUpdate, withZeldOutpoints } from '@/core/zeld/knownOutpoints';
import { isValidZeldHuntSeconds, MAX_ZELD_HUNT_SECONDS } from '@/core/zeld/protocol';
import * as sessionManager from '@/platform/auth/sessionManager';
import { SessionRecoveryState } from '@/platform/auth/sessionManager';
import { whenSessionRecovered } from '@/platform/auth/sessionReady';
import type { SigningIdentity } from '@/platform/auth/signingIdentity';
import {
  assertUnlockAllowed,
  clearUnlockAttempts,
  recordFailedUnlockAttempt,
} from '@/platform/auth/unlockRateLimiter';
import { createWriteLock } from '@/platform/storage/mutex';
import {
  assertNoKeychainRecord,
  deleteKeychain,
  getKeychainRecord,
  saveKeychainRecord,
} from '@/platform/storage/walletStorage';
import { assertTrezorSuiteAccess } from '@/platform/suiteAccess';
import { WalletSigner } from '@/platform/walletSigner';
// Note: getTrezorAdapter is dynamically imported in createHardwareWalletWithDiscovery to avoid
// loading @trezor/connect-webextension at extension startup (it auto-initializes)

import { MAX_ADDRESSES_PER_WALLET, MAX_WALLETS } from '@/core/wallet/constants';
// Import types from centralized types module
import type { Address, HardwareWalletSecret, Keychain, PairedAddresses, RevealSecretRequest, SignPsbtOptions, SignTransactionOptions, Wallet, WalletRecord } from '@/types/wallet';

/** How long a keychain load waits for session recovery before declining to load this time. */
const RECOVERY_WAIT_MS = 5_000;

/**
 * WalletManager - Core wallet state management
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
 * - When locked: keychain=null and no wallet secret is in memory; the master key and session
 *   metadata are gone from session storage. A worker that locked keeps its wallet list (ids, names,
 *   types) with every wallet's addresses=[]; a worker that never loaded the keychain has wallets=[].
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

  /**
   * Each wallet's derived addresses, by wallet ID, with the record facts they were derived from.
   *
   * Public data: the same addresses the wallet list shows. Kept so a popup open, a keychain write,
   * an unlock or a switch that finds the record unchanged reuses the list instead of re-deriving
   * it, and so the send form's "is this one of my addresses" check stops decrypting and deriving
   * every other wallet on each submit. Cleared on lock and when the keychain is reloaded; an entry
   * whose record changed (count, format, extra paths, secret) simply misses.
   */
  private readonly derivedAddressSets = new Map<string, { fingerprint: string; addresses: Address[] }>();

  /** Paired Legacy/SegWit addresses by wallet, format and index. Public; cleared with the above. */
  private readonly pairedAddressMemo = new Map<string, Address>();

  /**
   * Signing lives in WalletSigner. It reads wallet state only through these accessors, each at the
   * moment it asks, so it sees a lock or a switch exactly when code here would. It holds no wallet state or key.
   */
  private readonly signer = new WalletSigner({
    activeWalletId: () => this.activeWalletId,
    getWalletById: (id) => this.getWalletById(id),
    getActiveWallet: () => this.getActiveWallet(),
    lastActiveAddress: () => this.getSettings().lastActiveAddress,
    getPrivateKey: (walletId, derivationPath) => this.getPrivateKey(walletId, derivationPath),
    getPairedAddresses: () => this.getPairedAddresses(),
  });

  private clearDerivedAddressCaches(): void {
    this.derivedAddressSets.clear();
    this.pairedAddressMemo.clear();
  }

  /** What an address list depends on besides the secret itself (which `encryptedSecret` stands for). */
  private static addressFingerprint(record: WalletRecord): string {
    return JSON.stringify([
      record.type, record.addressFormat, record.addressCount, record.extraPaths ?? [],
      record.previewAddress, record.isTestOnly ?? false, record.encryptedSecret,
    ]);
  }

  private static copyAddresses(addresses: Address[]): Address[] {
    return addresses.map((address) => ({ ...address }));
  }

  private cachedAddressesFor(record: WalletRecord): Address[] | undefined {
    const hit = this.derivedAddressSets.get(record.id);
    if (!hit || hit.fingerprint !== WalletManager.addressFingerprint(record)) return undefined;
    return WalletManager.copyAddresses(hit.addresses);
  }

  /**
   * The record's addresses, derived only when the record changed since they were last derived.
   * `generation` is the vault generation the secret was read under; a lock since then keeps the
   * result out of the cache.
   */
  private addressesFor(
    secret: string,
    record: WalletRecord,
    generation = this.vaultGeneration,
    cache?: HdNodeCache,
  ): Address[] {
    const cached = this.cachedAddressesFor(record);
    if (cached) return cached;
    const addresses = deriveAddressesFromSecret(secret, record, cache);
    if (generation === this.vaultGeneration && this.keychain) {
      this.derivedAddressSets.set(record.id, {
        fingerprint: WalletManager.addressFingerprint(record),
        addresses: WalletManager.copyAddresses(addresses),
      });
    }
    return addresses;
  }

  /**
   * The session's node cache for this wallet's unlocked secret. Nodes are held in the session
   * manager beside the secret and cleared with it on lock, switch, removal and reset.
   */
  private static nodeCache(walletId: string, secret: string): HdNodeCache | undefined {
    return sessionManager.unlockedHdNodeCache(walletId, secret);
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
      this.clearDerivedAddressCaches();
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
      this.clearDerivedAddressCaches();
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

      // Runs on every popup open and every keychain write. The addresses only change when the
      // record does, so an unchanged record reuses the list rather than re-deriving it.
      wallet.addresses = this.addressesFor(secret, record, undefined, WalletManager.nodeCache(wallet.id, secret));
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

    const generation = this.vaultGeneration;
    const masterKey = await sessionManager.getKeychainMasterKey();
    if (!masterKey || !this.keychain || generation !== this.vaultGeneration) {
      return false;
    }

    const matches = (addresses: Address[]) =>
      addresses.some((addr) => addr.address.toLowerCase() === normalizedAddress);

    for (const record of this.keychain.wallets) {
      const wallet = this.getWalletById(record.id);
      if (wallet?.addresses.length) {
        continue;
      }

      // Public addresses derived earlier this session need no decrypt and no derivation.
      const cached = this.cachedAddressesFor(record);
      if (cached) {
        if (matches(cached)) return true;
        continue;
      }

      try {
        const secret = await decryptWithKey(record.encryptedSecret, masterKey);
        // No node cache: this wallet's secret is not the unlocked one and must not be kept.
        if (matches(this.addressesFor(secret, record, generation))) {
          return true;
        }
      } catch {
        // Ignore wallets that cannot be checked and continue with the rest.
      }
    }

    return false;
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
    await this.commitKeychain((draft) => { draft.wallets.push(walletRecord); });

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
    await this.commitKeychain((draft) => { draft.wallets.push(walletRecord); });

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
    await this.commitKeychain((draft) => { draft.wallets.push(walletRecord); });

    // Create the runtime wallet; activating it derives the test address from the stored marker.
    const wallet: Wallet = {
      id,
      name: walletName,
      type: 'privateKey',
      addressFormat,
      addressCount: 1,
      addresses: [],
      isTestOnly: true,
      previewAddress: address,
    };

    this.wallets.push(wallet);

    // Activate it the way every wallet is activated, with the test address as the active address
    await this.mutationStep(this.selectWalletInternal(id, address));

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

    await this.commitKeychain((draft) => { draft.wallets.push(walletRecord); });

    // Create the runtime wallet; activating it derives Address 1 from the record, exactly as every
    // later unlock or switch does.
    const wallet: Wallet = {
      id,
      name: walletName,
      type: 'hardware',
      addressFormat: account.addressFormat,
      addressCount: 1,
      addresses: [],
      previewAddress: account.address,
    };

    this.wallets.push(wallet);

    // Activate it the way every wallet is activated: the previously active wallet's secret and HD
    // nodes are cleared, and the device's address becomes the active address.
    await this.mutationStep(this.selectWalletInternal(id, account.address));

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

    await this.mutationStep(assertTrezorSuiteAccess());
    // Dynamically import Trezor adapter
    const { getTrezorAdapter, resetTrezorAdapter } = await this.mutationStep(import('@/core/hardware/trezorAdapter'));
    await this.mutationStep(resetTrezorAdapter());
    const trezor = getTrezorAdapter();

    await this.mutationStep(trezor.init());

    // Perform account discovery - this shows Trezor's account selection UI
    // discoverAccount validates the path internally and returns accountIndex
    // The selected account includes its xpub; discoverAccount resolves its /0/0 address.
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

  /**
   * The one way a wallet becomes active: selection, unlock, worker recovery, and every create or
   * connect. `lastActiveAddress`, when given, is saved as the active address in the same write.
   */
  private async selectWalletInternal(walletId: string, lastActiveAddress?: string): Promise<void> {
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
    wallet.addresses = this.addressesFor(secret, record, undefined, WalletManager.nodeCache(walletId, secret));
    // Extra paths are appended to the same list but are not part of the sequential run, so they
    // must not count here — `addAddress` derives the next index from this.
    wallet.addressCount = wallet.addresses.filter(
      (address) => !isUtxoAddressPath(address.path)
    ).length;
    this.activeWalletId = walletId;

    // Persist lastActiveWalletId in settings (only on explicit selection)
    const settings = this.getSettings();
    const updates: Partial<AppSettings> = {};
    if (settings.lastActiveWalletId !== walletId) updates.lastActiveWalletId = walletId;
    if (lastActiveAddress !== undefined && settings.lastActiveAddress !== lastActiveAddress) {
      updates.lastActiveAddress = lastActiveAddress;
    }
    if (Object.keys(updates).length > 0) {
      await this.mutationStep(this.updateSettingsInternal(updates));
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

    // The hunt budget is a hard bound on how long signing waits, so it is enforced where settings
    // are persisted rather than trusted from the page that edited it.
    if (updates.zeldHuntSeconds !== undefined && !isValidZeldHuntSeconds(updates.zeldHuntSeconds)) {
      throw new Error(`ZELD hunt time must be a whole number of seconds from 0 to ${MAX_ZELD_HUNT_SECONDS}`);
    }

    // getSettings() is also the foreground's rollback source, so a failed write must never show
    // in it: the change is published only once it is saved.
    await this.commitKeychain((draft) => {
      draft.settings = { ...draft.settings, ...updates };
    });

    // Persist the new idle limit in session metadata too, so activity and worker recovery keep it.
    // This follows the committed keychain write: a session-metadata failure must not roll it back.
    if (updates.autoLockTimer) {
      const timeoutMs = getAutoLockTimeoutMs(updates.autoLockTimer);
      await this.mutationStep(sessionManager.updateSessionTimeout(timeoutMs));
    }
  }

  /**
   * The outputs `address` was last known to hold ZELD on (see core/zeld/knownOutpoints). Read
   * only when the indexer cannot be. Empty while locked.
   */
  public getKnownZeldOutpoints(address: string): KnownZeldOutpoint[] {
    if (typeof address !== 'string' || !this.keychain) return [];
    return knownZeldOutpoints(this.keychain.zeldOutpoints ?? [], address);
  }

  /**
   * Update the record of `address`'s ZELD outputs in the encrypted keychain: the indexer's latest
   * answer, or what one of the wallet's own transactions spent and left. Writes nothing when the
   * record already says the same, so a repeated balance read costs nothing. A locked wallet
   * records nothing.
   */
  public async recordZeldOutpoints(address: string, update: unknown): Promise<void> {
    if (typeof address !== 'string' || address.length === 0 || address.length > 128) {
      throw new Error('Invalid ZELD outpoint address');
    }
    const parsed = parseZeldOutpointUpdate(update);
    if (!this.keychain) return;
    return this.mutateVault(async () => {
      if (!this.keychain) return;
      const next = withZeldOutpoints(this.keychain.zeldOutpoints ?? [], address, parsed);
      if (!next) return;
      await this.commitKeychain((draft) => { draft.zeldOutpoints = next; });
    });
  }

  /**
   * Persist a connection and its optional paired-address grant in one keychain write.
   *
   * A paired grant this replaces or drops is withdrawn from memory before the write (see
   * `revokeInMemory`); the new connection and grant take effect only once saved.
   */
  public addConnectedWebsite(origin: string, pairedIdentity?: { walletId: string; address: string; pairedAddress?: string }): Promise<void> {
    return this.mutateVault(async () => {
      const capability = pairedIdentity ? { pairedAddresses: true, ...pairedIdentity } : undefined;
      this.withdrawReplacedCapability(origin, capability);
      await this.commitKeychain((draft) => {
        draft.settings = { ...draft.settings, connectedWebsites: [...new Set([...draft.settings.connectedWebsites, origin])] };
        WalletManager.setCapability(draft, origin, capability);
      });
    });
  }

  /** Revokes a connection and its paired grant. Refused in memory at once, then saved. */
  public removeConnectedWebsite(origin: string): Promise<void> {
    return this.mutateVault(() => this.commitKeychain((draft) => {
      draft.settings = {
        ...draft.settings,
        connectedWebsites: draft.settings.connectedWebsites.filter(site => site !== origin),
      };
      WalletManager.setCapability(draft, origin, undefined);
    }, { restrictive: true }));
  }

  /**
   * Grants (`identity`) or revokes (null) a site's paired-address access. A revocation, or the grant a
   * new one replaces, is withdrawn from memory before the write; a grant takes effect once saved.
   * A revoked connection cannot be recreated by an in-flight capability approval.
   */
  public setPairedAddressPermission(origin: string, identity: { walletId: string; address: string; pairedAddress?: string } | null): Promise<void> {
    return this.mutateVault(async () => {
      if (!identity) {
        await this.commitKeychain((draft) => { WalletManager.setCapability(draft, origin, undefined); }, { restrictive: true });
        return;
      }
      if (!this.getSettings().connectedWebsites.includes(origin)) {
        throw new Error('Site disconnected before paired address access was granted');
      }
      const capability = { pairedAddresses: true, ...identity };
      this.withdrawReplacedCapability(origin, capability);
      await this.commitKeychain((draft) => { WalletManager.setCapability(draft, origin, capability); });
    });
  }

  private static setCapability(keychain: Keychain, origin: string, capability: NonNullable<AppSettings['providerCapabilities']>[string] | undefined): void {
    const providerCapabilities = { ...keychain.settings.providerCapabilities };
    if (capability) providerCapabilities[origin] = capability;
    else delete providerCapabilities[origin];
    keychain.settings = { ...keychain.settings, providerCapabilities };
  }

  /** Withdraws the origin's current paired grant from memory now if `next` would not keep it as is. */
  private withdrawReplacedCapability(origin: string, next: NonNullable<AppSettings['providerCapabilities']>[string] | undefined): void {
    const current = this.keychain?.settings.providerCapabilities?.[origin];
    if (!current || JSON.stringify(current) === JSON.stringify(next)) return;
    this.revokeInMemory((draft) => { WalletManager.setCapability(draft, origin, undefined); });
  }

  /**
   * Applies a change that only removes access (a connection, a paired grant) to the live keychain
   * immediately, before anything is written. Permission and delivery checks read the live keychain
   * synchronously, so they refuse from this moment rather than once the write completes. Memory
   * more restrictive than disk is safe: if the write then fails, the revocation stays in memory and
   * the next successful write saves it. Never use it for a change that grants anything.
   */
  private revokeInMemory(change: (draft: Keychain) => void): void {
    const current = this.keychain;
    if (!current) throw new Error('Keychain not loaded');
    const draft = structuredClone(current);
    change(draft);
    this.keychain = draft;
  }

  /**
   * The only way the keychain changes: apply `change` to a copy, persist the copy, and publish it
   * as the live keychain only once it is on disk under the session that made it.
   *
   * Changing the live keychain first and persisting after left a failed write in memory, where the
   * next unrelated write committed it, and let a retried create add a second record with the same
   * ID. Here a failure (encryption, storage, or a lock while the write was pending) leaves memory
   * exactly as the disk has it. Callers update their runtime state (wallet list, active wallet,
   * unlocked secrets) after this returns, never before, so that follows the disk too.
   *
   * `change` runs synchronously on the copy and may throw to abandon the change.
   *
   * `restrictive` is for a change that only removes access: it fails closed instead. The change is
   * published before the write (`revokeInMemory`) and kept in memory if the write fails, so no check
   * can still pass on the grant while it is being revoked.
   */
  private async commitKeychain<T>(change: (draft: Keychain) => T, options: { restrictive?: boolean } = {}): Promise<T> {
    if (options.restrictive) {
      let result!: T;
      this.revokeInMemory((draft) => { result = change(draft); });
      await this.mutationStep(this.persistKeychain(this.keychain!));
      return result;
    }
    const current = this.keychain;
    if (!current) throw new Error('Keychain not loaded');
    const draft = structuredClone(current);
    const result = change(draft);
    await this.mutationStep(this.persistKeychain(draft));
    // mutationStep has checked the vault generation; this also refuses a keychain that was
    // replaced another way while the write was pending.
    if (this.keychain !== current) throw new Error('Wallet session changed; please try again.');
    this.keychain = draft;
    return result;
  }

  /**
   * Encrypts and saves `keychain`. Only `commitKeychain` calls this: it decides when the saved
   * keychain becomes the live one.
   */
  private async persistKeychain(next: Keychain): Promise<void> {
    // Snapshot before yielding: no async crypto operation may serialize a view that changes
    // underneath it (or metadata from a subsequent session).
    const keychain = structuredClone(next);

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
    this.clearDerivedAddressCaches();
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
    if (wallet.type !== 'mnemonic' && wallet.type !== 'hardware')
      throw new Error('Can only add addresses to a mnemonic or hardware wallet.');
    const secret = await this.mutationStep(sessionManager.getUnlockedSecret(walletId));
    if (!secret)
      throw new Error('Wallet is locked. Please unlock first.');
    if (wallet.addressCount >= MAX_ADDRESSES_PER_WALLET) {
      throw new Error(`Cannot exceed ${MAX_ADDRESSES_PER_WALLET} addresses.`);
    }
    if (!this.keychain) throw new Error('Keychain not loaded');
    const keychainRecord = this.keychain.wallets.find((r) => r.id === walletId);
    if (!keychainRecord) throw new Error('Missing keychain record.');

    const index = wallet.addressCount;
    const newAddr = wallet.type === 'hardware'
      ? deriveHardwareAddress(secret, keychainRecord, index)
      : deriveMnemonicAddress(secret, wallet.addressFormat, index, WalletManager.nodeCache(walletId, secret));
    if (!newAddr) throw new Error('Cannot derive another address for this hardware wallet.');

    await this.commitKeychain((draft) => {
      WalletManager.recordIn(draft, walletId).addressCount = index + 1;
    });
    wallet.addresses.push(newAddr);
    wallet.addressCount = index + 1;

    return newAddr;
  }

  /** The keychain's record for `walletId`, for changing it inside `commitKeychain`. */
  private static recordIn(keychain: Keychain, walletId: string): WalletRecord {
    const record = keychain.wallets.find((r) => r.id === walletId);
    if (!record) throw new Error('Missing keychain record.');
    return record;
  }

  public async removeWallet(walletId: string): Promise<void> {
    return this.mutateVault(() => this.removeWalletInternal(walletId));
  }

  private async removeWalletInternal(walletId: string): Promise<void> {
    if (!this.wallets.some((w) => w.id === walletId)) throw new Error('Wallet not found in memory.');
    if (!this.keychain) throw new Error('Keychain not loaded');

    // Remove from the keychain first; memory follows only once the removal is saved, so a failed
    // write leaves the wallet listed, unlocked if it was, and on disk.
    await this.commitKeychain((draft) => {
      draft.wallets = draft.wallets.filter((record) => record.id !== walletId);
      WalletManager.renumberWallets(draft.wallets);
    });

    const idx = this.wallets.findIndex((w) => w.id === walletId);
    if (idx !== -1) this.wallets.splice(idx, 1);
    sessionManager.clearUnlockedSecret(walletId);
    this.clearDerivedAddressCaches();

    if (this.activeWalletId === walletId) {
      this.activeWalletId = null;
    }

    const records = new Map(this.keychain.wallets.map((record) => [record.id, record]));
    for (const wallet of this.wallets) {
      const record = records.get(wallet.id);
      if (record) wallet.name = record.name;
    }
  }

  /** Default names ("Wallet N") follow list position; renamed wallets keep their names. */
  private static renumberWallets(records: WalletRecord[]): void {
    records.forEach((record, i) => {
      if (/^Wallet \d+$/.test(record.name)) record.name = `Wallet ${i + 1}`;
    });
  }

  public async verifyPassword(password: string): Promise<boolean> {
    return this.mutateVault(() => this.verifyPasswordInternal(password));
  }

  private async verifyPasswordInternal(password: string): Promise<boolean> {
    return (await this.mutationStep(this.openVaultWithPassword(password))) !== null;
  }

  /**
   * The saved vault opened with the key `password` derives, or null when the password is wrong.
   * Shares the unlock failure window: checking a password is the same oracle as unlocking.
   */
  private async openVaultWithPassword(password: string): Promise<{ key: CryptoKey; keychain: Keychain } | null> {
    await this.mutationStep(assertUnlockAllowed());

    const keychainRecord = await this.mutationStep(getKeychainRecord());
    if (!keychainRecord) return null;

    // Try to decrypt the keychain with the given password
    try {
      const salt = base64ToBuffer(keychainRecord.salt);
      const key = await this.mutationStep(deriveKey(password, salt, keychainRecord.kdf.iterations));
      const keychain = await this.mutationStep(decryptKeychain(keychainRecord, key));
      await this.mutationStep(clearUnlockAttempts());
      return { key, keychain };
    } catch {
      await this.mutationStep(recordFailedUnlockAttempt());
      return null;
    }
  }

  /**
   * One of a wallet's secrets, for the reveal screens: its recovery phrase, or a private key in
   * WIF (a private-key wallet's own, or a mnemonic wallet's at `path`).
   *
   * The password is checked here, in the background, before anything is decrypted, and a wrong one
   * counts against the same limit as unlocking. Returns null for a wrong password. The wallet need
   * not be the active one, and revealing it does not make it so.
   */
  public async revealSecret(request: RevealSecretRequest): Promise<string | null> {
    return this.mutateVault(() => this.revealSecretInternal(request));
  }

  private async revealSecretInternal({ walletId, password, kind, path }: RevealSecretRequest): Promise<string | null> {
    if (kind !== 'mnemonic' && kind !== 'privateKey') throw new Error('Unknown kind of secret');
    if (path !== undefined && typeof path !== 'string') throw new Error('Invalid derivation path');
    // Only for an unlocked session, as the reveal screens are.
    if (!this.keychain) throw new Error('Wallet is locked. Please unlock first.');

    const vault = await this.mutationStep(this.openVaultWithPassword(password));
    if (!vault) return null;

    const record = vault.keychain.wallets.find((r) => r.id === walletId);
    if (!record) throw new Error('Wallet not found');
    if (record.type === 'hardware' || record.isTestOnly) {
      throw new Error('This wallet has no secret to reveal');
    }
    if (kind === 'mnemonic' && record.type !== 'mnemonic') {
      throw new Error('Only a mnemonic wallet has a recovery phrase');
    }
    if (kind === 'privateKey' && record.type === 'mnemonic' && !path) {
      throw new Error('The address derivation path is missing');
    }

    const secret = await this.mutationStep(decryptWithKey(record.encryptedSecret, vault.key));
    if (kind === 'mnemonic') return secret;
    if (record.type === 'privateKey') return (JSON.parse(secret) as { wif: string }).wif;
    return encodeWIF(mnemonicPrivateKeyAt(secret, record.addressFormat, path!), true);
  }

  public async resetKeychain(password: string): Promise<void> {
    return this.mutateVault(() => this.resetKeychainInternal(password));
  }

  private async resetKeychainInternal(password: string): Promise<void> {
    const valid = await this.mutationStep(this.verifyPasswordInternal(password));
    if (!valid) throw new Error('Invalid password');

    // Every site loses access now, not once the vault is deleted: a reset revokes all grants, and
    // fails closed like any other revocation if the delete does not complete.
    if (this.keychain) {
      this.revokeInMemory((draft) => {
        draft.settings = { ...draft.settings, connectedWebsites: [], providerCapabilities: {} };
      });
    }
    await this.mutationStep(deleteKeychain());
    await this.lockKeychain();

    this.clearDerivedAddressCaches();
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
    // derivation branch, not how many derivation indices the user has exposed. The
    // address-type previews derive at this same index.
    const selectedIndex = addressIndexKeptBySwitch(wallet, this.getSettings().lastActiveAddress);

    const addresses = deriveMnemonicAddresses(
      mnemonic,
      newType,
      Math.max(wallet.addressCount, 1),
      WalletManager.nodeCache(walletId, mnemonic),
    );
    const previewAddress = addresses[0]!.address;

    if (!this.keychain) throw new Error('Keychain not loaded');
    const isActive = this.activeWalletId === walletId;
    await this.commitKeychain((draft) => {
      const record = WalletManager.recordIn(draft, walletId);
      record.addressFormat = newType;
      record.previewAddress = previewAddress;
      if (isActive) draft.settings.lastActiveAddress = addresses[selectedIndex]!.address;
    });

    wallet.addressFormat = newType;
    wallet.addresses = addresses;
    wallet.previewAddress = previewAddress;
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

    const extraPaths = [...(keychainRecord.extraPaths ?? []), ...discovered];
    const addresses = this.addressesFor(
      mnemonic, { ...keychainRecord, extraPaths }, undefined, WalletManager.nodeCache(walletId, mnemonic),
    );
    await this.commitKeychain((draft) => {
      WalletManager.recordIn(draft, walletId).extraPaths = [...extraPaths];
    });
    wallet.extraPaths = [...extraPaths];
    wallet.addresses = addresses;

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

    const mnemonic = await this.mutationStep(sessionManager.getUnlockedSecret(walletId));
    const addresses = mnemonic
      ? this.addressesFor(
        mnemonic, { ...keychainRecord, extraPaths: remaining }, undefined, WalletManager.nodeCache(walletId, mnemonic),
      )
      : wallet.addresses.filter((address) => address.path !== path);
    await this.commitKeychain((draft) => {
      WalletManager.recordIn(draft, walletId).extraPaths = [...remaining];
    });
    wallet.extraPaths = [...remaining];
    wallet.addresses = addresses;
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
      const privateKeyHex = mnemonicPrivateKeyAt(secret, wallet.addressFormat, path, WalletManager.nodeCache(walletId, secret));
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

  /**
   * The address `addressFormat` gives at derivation `addressIndex` — for a switch preview, the index
   * `addressIndexKeptBySwitch` says the switch keeps. Private-key wallets have one key, so the
   * index does not apply to them.
   */
  public async getPreviewAddressForFormat(
    walletId: string,
    addressFormat: AddressFormat,
    addressIndex = 0
  ): Promise<string> {
    if (!Number.isSafeInteger(addressIndex) || addressIndex < 0) {
      throw new Error('Invalid preview address index');
    }
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
        `${getDerivationPathForAddressFormat(addressFormat)}/${addressIndex}`,
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
    const generation = this.vaultGeneration;
    const secret = await sessionManager.getUnlockedSecret(wallet.id);
    if (!secret) throw new Error('Wallet is locked');
    // Asked for several times per signature (authorization, then the signer), and once per item
    // of a bundle. The addresses are public and fixed by wallet, format and index.
    const paired = (format: AddressFormat): Address => {
      const key = `${wallet.id}|${format}|${index}`;
      const memo = this.pairedAddressMemo.get(key);
      if (memo) return { ...memo };
      const address = deriveMnemonicAddress(secret, format, index, WalletManager.nodeCache(wallet.id, secret));
      if (generation === this.vaultGeneration && this.keychain) this.pairedAddressMemo.set(key, { ...address });
      return address;
    };
    return {
      legacy: { ...paired(formats.legacy), format: formats.legacy, type: 'p2pkh' },
      segwit: { ...paired(formats.segwit), format: formats.segwit, type: 'p2wpkh' },
    };
  }

  /** Sign the reviewed raw transaction; a hardware PSBT must describe those exact same bytes. */
  public async signTransaction(
    rawTxHex: string,
    sourceAddress: string,
    options?: SignTransactionOptions,
    expectedIdentity?: SigningIdentity,
  ): Promise<string> {
    return this.signer.signTransaction(rawTxHex, sourceAddress, options, expectedIdentity);
  }

  public async broadcastTransaction(signedTxHex: string): Promise<{ txid: string; fees?: number }> {
    return btcBroadcastTransaction(signedTxHex);
  }

  /** Sign a message with the key of `address`, locally or on the hardware device (see WalletSigner). */
  public async signMessage(message: string, address: string, expectedIdentity?: SigningIdentity): Promise<{ signature: string; address: string }> {
    return this.signer.signMessage(message, address, expectedIdentity);
  }

  /** Sign a provider PSBT and return it signed but not finalized (see WalletSigner). */
  public async signPsbt(
    psbtHex: string,
    signInputs?: Record<string, number[]>,
    sighashTypes?: number[],
    expectedIdentity?: SigningIdentity,
    options?: SignPsbtOptions,
  ): Promise<string> {
    return this.signer.signPsbt(psbtHex, signInputs, sighashTypes, expectedIdentity, options);
  }

  /** Build and sign one bare-multisig consolidation batch in the background (see WalletSigner). */
  public async consolidateBareMultisig(
    sourceAddress: string,
    batchData: ConsolidationData,
    feeRateSatPerVByte: number,
    destinationAddress?: string,
  ): Promise<ConsolidationResult> {
    return this.signer.signConsolidationBatch(sourceAddress, batchData, feeRateSatPerVByte, destinationAddress);
  }

}

export const walletManager = new WalletManager();

// Expose read-only settings to modules that must not import the wallet singleton.
setSettingsProvider(() => walletManager.getSettings());
