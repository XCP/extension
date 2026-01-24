/**
 * Comprehensive test data for E2E tests
 *
 * This file contains well-known test addresses, mnemonics, and validation patterns
 * for testing across all address types and network configurations.
 */

// Standard address types (non-Counterwallet)
export type StandardAddressType = 'p2pkh' | 'p2sh-p2wpkh' | 'p2wpkh' | 'p2tr';

// Counterwallet-specific address types (requires Counterwallet derivation)
export type CounterwalletAddressType = 'counterwallet' | 'counterwallet-segwit';

// All address types supported by the wallet
export type AddressType = StandardAddressType | CounterwalletAddressType;

// Network type for test parameterization
export type NetworkType = 'mainnet' | 'testnet';

/**
 * Valid test addresses for each type and network
 * These are well-known addresses that can be used for validation
 */
export const TEST_ADDRESSES = {
  mainnet: {
    // Legacy P2PKH - starts with 1
    p2pkh: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
    // Nested SegWit P2SH-P2WPKH - starts with 3
    'p2sh-p2wpkh': '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
    // Native SegWit P2WPKH - starts with bc1q
    p2wpkh: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
    // Taproot P2TR - starts with bc1p
    p2tr: 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr',
    // Counterwallet P2PKH (same format as p2pkh but different derivation) - starts with 1
    counterwallet: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
    // Counterwallet SegWit (same format as p2wpkh but different derivation) - starts with bc1q
    'counterwallet-segwit': 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
  },
  testnet: {
    // Legacy P2PKH - starts with m or n
    p2pkh: 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn',
    // Nested SegWit P2SH-P2WPKH - starts with 2
    'p2sh-p2wpkh': '2MzQwSSnBHWHqSAqtTVQ6v47XtaisrJa1Vc',
    // Native SegWit P2WPKH - starts with tb1q
    p2wpkh: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
    // Taproot P2TR - starts with tb1p
    p2tr: 'tb1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqp348k4',
    // Counterwallet P2PKH (same format as p2pkh but different derivation) - starts with m or n
    counterwallet: 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn',
    // Counterwallet SegWit (same format as p2wpkh but different derivation) - starts with tb1q
    'counterwallet-segwit': 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
  },
};

/**
 * Invalid addresses for negative testing
 */
export const INVALID_ADDRESSES = [
  'notanaddress',
  '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN3', // Invalid checksum (changed last char)
  'bc1invalidaddress',
  'bc1q0000000000000000000000000000000000', // Invalid bech32
  '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNL', // Too short
  'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jjX', // Invalid bech32m char
  '',
  '   ',
];

/**
 * Test passwords for authentication testing
 */
export const TEST_PASSWORDS = {
  // Standard valid password meeting requirements
  valid: 'TestPassword123!',
  // Weak passwords for negative testing
  weak: '123456',
  tooShort: 'abc',
  // Edge cases
  unicode: 'Pässwörd123!',
  withSpaces: 'Test Password 123!',
  veryLong: 'A'.repeat(100) + '1!',
};

/**
 * Test mnemonics - well-known seeds for reproducible testing
 */
export const TEST_MNEMONICS = {
  // Standard BIP39 test vector - "abandon" x11 + "about"
  standard: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
  // Alternative test mnemonic - "test" x11 + "junk"
  testJunk: 'test test test test test test test test test test test junk',
  // All "zoo" - another well-known test vector
  allZoo: 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong',
  // Invalid mnemonic (not in wordlist)
  invalid: 'invalid invalid invalid invalid invalid invalid invalid invalid invalid invalid invalid invalid',
  // Wrong checksum (valid words but invalid checksum)
  wrongChecksum: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon',
  // Counterwallet mnemonic (uses different wordlist and derivation)
  // 12 words from Counterwallet wordlist (must be multiple of 3)
  counterwallet: 'like just love know never want time out there make look eye',
};

/**
 * Test private keys in WIF format
 * These correspond to the standard mnemonic m/44'/0'/0'/0/0
 */
export const TEST_PRIVATE_KEYS = {
  // WIF for m/44'/0'/0'/0/0 from standard mnemonic (mainnet compressed)
  mainnet: 'L4p2b9VAf8k5aUahF1JCJUzZkgNEAqLfq8DDdQiyAprQAKSbu8hf',
  // Testnet WIF format
  testnet: 'cTpB4YiyKiBcPxnefsDpbnDxFDffjqJob8wGCEDXxgQ7zQoMXJdH',
};

/**
 * Address prefix patterns for validation
 */
export const ADDRESS_PREFIXES = {
  mainnet: {
    p2pkh: /^1[a-km-zA-HJ-NP-Z1-9]{25,34}$/,
    'p2sh-p2wpkh': /^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/,
    p2wpkh: /^bc1q[a-z0-9]{38,}$/,
    p2tr: /^bc1p[a-z0-9]{58}$/,
    // Counterwallet uses same format as p2pkh
    counterwallet: /^1[a-km-zA-HJ-NP-Z1-9]{25,34}$/,
    // Counterwallet SegWit uses same format as p2wpkh
    'counterwallet-segwit': /^bc1q[a-z0-9]{38,}$/,
  },
  testnet: {
    p2pkh: /^[mn][a-km-zA-HJ-NP-Z1-9]{25,34}$/,
    'p2sh-p2wpkh': /^2[a-km-zA-HJ-NP-Z1-9]{25,34}$/,
    p2wpkh: /^tb1q[a-z0-9]{38,}$/,
    p2tr: /^tb1p[a-z0-9]{58}$/,
    // Counterwallet uses same format as p2pkh
    counterwallet: /^[mn][a-km-zA-HJ-NP-Z1-9]{25,34}$/,
    // Counterwallet SegWit uses same format as p2wpkh
    'counterwallet-segwit': /^tb1q[a-z0-9]{38,}$/,
  },
};

/**
 * Simple prefix strings for UI text matching
 */
export const ADDRESS_PREFIX_STRINGS = {
  mainnet: {
    p2pkh: '1',
    'p2sh-p2wpkh': '3',
    p2wpkh: 'bc1q',
    p2tr: 'bc1p',
    counterwallet: '1',
    'counterwallet-segwit': 'bc1q',
  },
  testnet: {
    p2pkh: 'm', // or 'n'
    'p2sh-p2wpkh': '2',
    p2wpkh: 'tb1q',
    p2tr: 'tb1p',
    counterwallet: 'm', // or 'n'
    'counterwallet-segwit': 'tb1q',
  },
};

/**
 * Address type display names as shown in UI
 */
export const ADDRESS_TYPE_DISPLAY_NAMES: Record<AddressType, string> = {
  p2pkh: 'Legacy (P2PKH)',
  'p2sh-p2wpkh': 'Nested SegWit (P2SH-P2WPKH)',
  p2wpkh: 'Native SegWit (P2WPKH)',
  p2tr: 'Taproot (P2TR)',
  counterwallet: 'CounterWallet (P2PKH)',
  'counterwallet-segwit': 'CounterWallet SegWit (P2WPKH)',
};

/**
 * Standard address types (available for created/imported BIP39 wallets)
 */
export const STANDARD_ADDRESS_TYPES: StandardAddressType[] = ['p2pkh', 'p2sh-p2wpkh', 'p2wpkh', 'p2tr'];

/**
 * Counterwallet address types (only available for Counterwallet-derived wallets)
 */
export const COUNTERWALLET_ADDRESS_TYPES: CounterwalletAddressType[] = ['counterwallet', 'counterwallet-segwit'];

/**
 * All address types for parameterized testing
 */
export const ALL_ADDRESS_TYPES: AddressType[] = [...STANDARD_ADDRESS_TYPES, ...COUNTERWALLET_ADDRESS_TYPES];

/**
 * Wallet types for matrix testing
 */
export type WalletType = 'created' | 'imported-mnemonic' | 'imported-counterwallet' | 'imported-privatekey';

/**
 * Available address types for each wallet type
 */
export const WALLET_TYPE_ADDRESS_TYPES: Record<WalletType, AddressType[]> = {
  // Created wallets can use all standard types (defaults to Taproot)
  'created': STANDARD_ADDRESS_TYPES,
  // Imported BIP39 mnemonic wallets can use all standard types
  'imported-mnemonic': STANDARD_ADDRESS_TYPES,
  // Imported Counterwallet mnemonic can only use Counterwallet types
  'imported-counterwallet': COUNTERWALLET_ADDRESS_TYPES,
  // Private key import is locked to detected type (usually P2WPKH or P2PKH)
  'imported-privatekey': ['p2wpkh'], // Most common for WIF imports
};

/**
 * Test amounts for transaction testing
 */
export const TEST_AMOUNTS = {
  dust: '0.00000546', // Dust limit
  belowDust: '0.00000545', // Below dust limit (should fail)
  small: '0.0001',
  medium: '0.01',
  large: '1.0',
  veryLarge: '999999', // Should fail (insufficient funds)
  zero: '0',
  negative: '-1', // Invalid
  invalid: 'abc', // Invalid
};

/**
 * Test fee rates in sat/vB
 */
export const TEST_FEE_RATES = {
  low: '1',
  medium: '10',
  high: '50',
  veryHigh: '100',
};

/**
 * Test messages for signing
 */
export const TEST_MESSAGES = {
  simple: 'Hello, World!',
  empty: '',
  unicode: 'Hello 世界 🌍',
  long: 'A'.repeat(1000),
  specialChars: '!@#$%^&*()_+-=[]{}|;:\'",.<>?/\\`~',
  newlines: 'Line 1\nLine 2\nLine 3',
  nullByte: 'Test\x00Message', // Contains null byte
};

/**
 * Validate an address matches expected format
 */
export function validateAddress(
  address: string,
  type: AddressType,
  network: NetworkType
): boolean {
  const pattern = ADDRESS_PREFIXES[network][type];
  return pattern.test(address);
}

/**
 * Get the expected prefix for an address type
 */
export function getExpectedPrefix(type: AddressType, network: NetworkType): string {
  return ADDRESS_PREFIX_STRINGS[network][type];
}

/**
 * Get a valid test address for a type/network combination
 */
export function getTestAddress(type: AddressType, network: NetworkType): string {
  return TEST_ADDRESSES[network][type];
}
