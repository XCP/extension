/**
 * Leaf module for the AddressFormat map: no imports, no side effects.
 *
 * Kept apart from ./address so modules that only need the format names (hardware
 * types, which the content script reaches via platform/proxy) don't pull in the
 * crypto libraries and API clients that ./address imports.
 */

/**
 * Bitcoin address formats supported by the wallet.
 * Using const assertion pattern for better tree-shaking and type safety.
 */
export const AddressFormat = {
  /** Counterwallet style (P2PKH with custom derivation) */
  Counterwallet: 'counterwallet',
  /** FreeWallet Style SegWit (Native SegWit with Counterwallet derivation) */
  CounterwalletSegwit: 'counterwallet-segwit',
  /** FreeWallet BIP39 (P2PKH with raw entropy seed derivation) */
  FreewalletBIP39: 'freewallet-bip39',
  /** FreeWallet BIP39 SegWit (P2WPKH with raw entropy seed derivation) */
  FreewalletBIP39Segwit: 'freewallet-bip39-segwit',
  /** Taproot (Pay-to-Taproot) */
  P2TR: 'p2tr',
  /** Native SegWit (Pay-to-Witness-PubKey-Hash) */
  P2WPKH: 'p2wpkh',
  /** Nested SegWit (P2WPKH nested in P2SH) */
  P2SH_P2WPKH: 'p2sh-p2wpkh',
  /** Legacy address (Pay-to-PubKey-Hash) */
  P2PKH: 'p2pkh',
} as const;

/**
 * Type representing valid address format values.
 * This creates a union type: 'counterwallet' | 'counterwallet-segwit' | 'freewallet-bip39' | 'freewallet-bip39-segwit' | 'p2tr' | 'p2wpkh' | 'p2sh-p2wpkh' | 'p2pkh'
 */
export type AddressFormat = typeof AddressFormat[keyof typeof AddressFormat];
