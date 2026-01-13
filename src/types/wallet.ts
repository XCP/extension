/**
 * Wallet domain types
 *
 * Core types for wallet and address representation.
 * Extracted to avoid circular dependencies and enable
 * type-only imports without pulling in implementation.
 */

import type { AddressFormat } from '@/utils/blockchain/bitcoin/address';

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
