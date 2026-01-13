/**
 * Wallet domain types
 *
 * Core types for wallet and address representation.
 * Extracted to avoid circular dependencies and enable
 * type-only imports without pulling in implementation.
 */

import type { AddressFormat } from '@/utils/blockchain/bitcoin/address';
import type { HardwareWalletVendor } from '@/utils/hardware/types';

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
 * Hardware wallet specific data
 */
export interface HardwareWalletData {
  /** Hardware wallet vendor (e.g., 'trezor', 'ledger') */
  vendor: HardwareWalletVendor;
  /** Extended public key for address derivation */
  xpub: string;
  /** Account index used for derivation */
  accountIndex: number;
  /** Device label (optional, from device) */
  deviceLabel?: string;
  /** Whether this wallet uses a passphrase (hidden wallet) */
  usePassphrase?: boolean;
}

/**
 * Wallet type discriminator
 */
export type WalletType = 'mnemonic' | 'privateKey' | 'hardware';

/**
 * Represents a wallet containing one or more addresses.
 */
export interface Wallet {
  /** Unique identifier (SHA-256 hash of mnemonic + addressFormat) */
  id: string;
  /** User-facing wallet name */
  name: string;
  /** Secret type: mnemonic phrase, single private key, or hardware */
  type: WalletType;
  /** Bitcoin address format for derivation */
  addressFormat: AddressFormat;
  /** Number of derived addresses */
  addressCount: number;
  /** Array of derived addresses */
  addresses: Address[];
  /** Flag for development-only test wallets */
  isTestOnly?: boolean;
  /** Hardware wallet specific data (only for type: 'hardware') */
  hardwareData?: HardwareWalletData;
}
