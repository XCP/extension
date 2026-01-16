/**
 * Wallet domain types
 *
 * Core types for wallet and address representation.
 * Extracted to avoid circular dependencies and enable
 * type-only imports without pulling in implementation.
 */

import type { AddressFormat } from '@/utils/blockchain/bitcoin/address';
import type { AppSettings } from '@/utils/settings';

/**
 * Represents a derived address within a wallet.
 */
export interface Address {
  /** Display name for the address */
  name: string;
  /** BIP derivation path */
  path: string;
  /** Bitcoin address string */
  address: string;
  /** Public key in hex format */
  pubKey: string;
}

/**
 * Represents a wallet containing one or more addresses.
 * This is the runtime representation with derived addresses.
 */
export interface Wallet {
  /** Unique identifier (SHA-256 hash of mnemonic + addressFormat) */
  id: string;
  /** User-facing wallet name */
  name: string;
  /** Secret type: mnemonic phrase or single private key */
  type: 'mnemonic' | 'privateKey';
  /** Bitcoin address format for derivation */
  addressFormat: AddressFormat;
  /** Number of derived addresses */
  addressCount: number;
  /** Array of derived addresses */
  addresses: Address[];
  /** Flag for development-only test wallets */
  isTestOnly?: boolean;
  /** First address for display when wallet is locked (public, not sensitive) */
  previewAddress?: string;
}

// ============================================================================
// Keychain Types - Encrypted Storage
// ============================================================================

/**
 * Individual wallet record stored in the keychain.
 * The secret remains encrypted even after keychain decryption.
 */
export interface WalletRecord {
  /** Unique identifier */
  id: string;
  /** User-facing wallet name */
  name: string;
  /** Secret type: mnemonic phrase or single private key */
  type: 'mnemonic' | 'privateKey';
  /** Bitcoin address format for derivation */
  addressFormat: AddressFormat;
  /** Number of derived addresses */
  addressCount: number;
  /** First address for display (m/.../0/0) */
  previewAddress: string;
  /** Encrypted secret (key-based AES-GCM, still encrypted after keychain decrypt) */
  encryptedSecret: string;
  /** Creation timestamp */
  createdAt?: number;
  /** Flag for development-only test wallets */
  isTestOnly?: boolean;
}

/**
 * Decrypted keychain contents (in memory when unlocked).
 * Individual wallet secrets remain encrypted until selectWallet() is called.
 * Settings are stored inside the keychain for single-key encryption.
 */
export interface Keychain {
  /** Schema version for future migrations */
  version: number;
  /** Array of wallet records */
  wallets: WalletRecord[];
  /** Application settings (encrypted with keychain) */
  settings: AppSettings;
}

/**
 * Keychain record stored in local storage.
 * Contains encrypted keychain blob and KDF parameters.
 */
export interface KeychainRecord {
  /** Schema version */
  version: number;
  /** Key derivation parameters (stored for future rotation flexibility) */
  kdf: {
    iterations: number;
  };
  /** Salt for PBKDF2 key derivation (base64) */
  salt: string;
  /** Encrypted keychain blob (base64, IV + ciphertext) */
  encryptedKeychain: string;
}
