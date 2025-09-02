/**
 * Bitcoin address formats supported by the wallet.
 * Using const assertion pattern for better tree-shaking and type safety.
 */
export const AddressFormat = {
  /** Counterwallet style (P2PKH with custom derivation) */
  Counterwallet: 'counterwallet',
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
 * This creates a union type: 'counterwallet' | 'p2tr' | 'p2wpkh' | 'p2sh-p2wpkh' | 'p2pkh'
 */
export type AddressFormat = typeof AddressFormat[keyof typeof AddressFormat];

/**
 * Type guard to check if a value is a valid AddressFormat.
 */
export function isAddressFormat(value: unknown): value is AddressFormat {
  return typeof value === 'string' && 
    Object.values(AddressFormat).includes(value as AddressFormat);
}

/**
 * Check if an address format is a SegWit format (P2WPKH, P2SH-P2WPKH, or P2TR).
 */
export function isSegwitFormat(format: AddressFormat): boolean {
  return format === AddressFormat.P2WPKH || 
         format === AddressFormat.P2SH_P2WPKH || 
         format === AddressFormat.P2TR;
}

/**
 * Get human-readable label for an address format.
 */
export function getAddressFormatLabel(format: AddressFormat): string {
  switch (format) {
    case AddressFormat.P2PKH:
      return 'Legacy';
    case AddressFormat.P2SH_P2WPKH:
      return 'Nested SegWit';
    case AddressFormat.P2WPKH:
      return 'Native SegWit';
    case AddressFormat.P2TR:
      return 'Taproot';
    case AddressFormat.Counterwallet:
      return 'Counterwallet';
    default:
      // TypeScript will error if we miss a case
      const exhaustive: never = format;
      return exhaustive;
  }
}

/**
 * Get address prefix hint for an address format.
 */
export function getAddressFormatHint(format: AddressFormat): string {
  switch (format) {
    case AddressFormat.P2PKH:
      return '1...';
    case AddressFormat.P2SH_P2WPKH:
      return '3...';
    case AddressFormat.P2WPKH:
      return 'bc1q...';
    case AddressFormat.P2TR:
      return 'bc1p...';
    case AddressFormat.Counterwallet:
      return '1...';
    default:
      const exhaustive: never = format;
      return exhaustive;
  }
}