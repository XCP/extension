/**
 * Leaf module for the AddressFormat map and its pure helpers: no imports, no side effects.
 *
 * Kept apart from ./address so modules that only need the format names (hardware
 * types, which the content script reaches via platform/proxy, and the popup's
 * wallet context and footer) don't pull in the crypto libraries and API clients
 * that ./address imports.
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

/** One product default shared by every new-wallet and ambiguous-import entry point. */
export const DEFAULT_ADDRESS_FORMAT: AddressFormat = AddressFormat.P2WPKH;

/**
 * Human-readable label for an address format, shown wherever the UI names a
 * wallet's address type (settings, address list).
 */
export function getAddressFormatLabel(format: AddressFormat): string {
  switch (format) {
    case AddressFormat.P2PKH:
      return 'Legacy (P2PKH)';
    case AddressFormat.P2WPKH:
      return 'Native SegWit (P2WPKH)';
    case AddressFormat.P2SH_P2WPKH:
      return 'Nested SegWit (P2SH-P2WPKH)';
    case AddressFormat.P2TR:
      return 'Taproot (P2TR)';
    case AddressFormat.Counterwallet:
      return 'CounterWallet (P2PKH)';
    case AddressFormat.CounterwalletSegwit:
      return 'CounterWallet SegWit (P2WPKH)';
    case AddressFormat.FreewalletBIP39:
      return 'FreeWallet (P2PKH)';
    case AddressFormat.FreewalletBIP39Segwit:
      return 'FreeWallet SegWit (P2WPKH)';
    default:
      return format;
  }
}

/**
 * Check if an address format is a SegWit format (P2WPKH, P2SH-P2WPKH, CounterwalletSegwit, or P2TR).
 */
export function isSegwitFormat(format: AddressFormat): boolean {
  return format === AddressFormat.P2WPKH ||
         format === AddressFormat.P2SH_P2WPKH ||
         format === AddressFormat.CounterwalletSegwit ||
         format === AddressFormat.FreewalletBIP39Segwit ||
         format === AddressFormat.P2TR;
}

/**
 * Check if an address format is a Counterwallet/FreeWallet style format.
 */
export function isCounterwalletFormat(format: AddressFormat): boolean {
  return format === AddressFormat.Counterwallet ||
         format === AddressFormat.CounterwalletSegwit;
}

/**
 * Check if an address format is a FreeWallet BIP39 style format.
 */
export function isFreewalletBIP39Format(format: AddressFormat): boolean {
  return format === AddressFormat.FreewalletBIP39 ||
         format === AddressFormat.FreewalletBIP39Segwit;
}
