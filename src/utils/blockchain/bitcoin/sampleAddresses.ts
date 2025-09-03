import { AddressFormat } from './address';

/**
 * Provides sample addresses for each address format.
 * These are used for display purposes when the actual wallet is locked.
 * 
 * Note: These are real addresses but not controlled by any user of this extension.
 * They are used purely for UI preview purposes.
 */
export function getSampleAddressForFormat(format: AddressFormat): string {
  switch (format) {
    case AddressFormat.P2PKH:
      // Legacy address starting with 1
      return '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      
    case AddressFormat.P2WPKH:
      // Native SegWit address starting with bc1q
      return 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
      
    case AddressFormat.P2SH_P2WPKH:
      // Nested SegWit address starting with 3
      return '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy';
      
    case AddressFormat.P2TR:
      // Taproot address starting with bc1p
      return 'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297';
      
    case AddressFormat.Counterwallet:
      // Counterwallet uses legacy format
      return '1CounterpartyXXXXXXXXXXXXXXXUWLpVr';
      
    default:
      return '';
  }
}

/**
 * Gets a description of what type of addresses each format generates.
 */
export function getAddressFormatExample(format: AddressFormat): string {
  switch (format) {
    case AddressFormat.P2PKH:
      return 'Addresses start with "1"';
      
    case AddressFormat.P2WPKH:
      return 'Addresses start with "bc1q"';
      
    case AddressFormat.P2SH_P2WPKH:
      return 'Addresses start with "3"';
      
    case AddressFormat.P2TR:
      return 'Addresses start with "bc1p"';
      
    case AddressFormat.Counterwallet:
      return 'Addresses start with "1" (special derivation)';
      
    default:
      return '';
  }
}