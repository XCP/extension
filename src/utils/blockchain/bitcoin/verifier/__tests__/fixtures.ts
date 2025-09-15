/**
 * Test fixtures for message verification
 * Real signatures from various wallets and platforms
 */

export interface TestFixture {
  format: 'legacy' | 'bip137' | 'bip322-simple' | 'bip322-full';
  address_type: 'p2pkh' | 'p2wpkh' | 'p2sh-p2wpkh' | 'p2tr' | 'p2wsh';
  address: string;
  message: string;
  signature: string;
  platform: string;
  notes?: string;
  shouldVerify: boolean;
}

export const fixtures: TestFixture[] = [
  // FreeWallet - Real signature that we know works with bitcoinjs-message
  {
    format: 'bip137',
    address_type: 'p2pkh',
    address: '19QWXpMXeLkoEKEJv2xo9rn8wkPCyxACSX',
    message: 'test',
    signature: 'H+MnkbI81kkWRUys5B6j/svR3I5rQCdjkCH6/Jv88/Q+BoIX6n7hP9Tj/kRqmnfdwLLYv27/pM1hlsWISMVwuBs=',
    platform: 'FreeWallet',
    notes: 'Verified to work with bitcoinjs-message',
    shouldVerify: true
  },

  // Bitcore test vectors
  {
    format: 'bip137',
    address_type: 'p2pkh',
    address: '1F3sAm6ZtwLAUnj7d38pGFxtP3RVEvtsbV',
    message: 'This is an example of a signed message.',
    signature: 'H9L5yLFjti0QTHhPyFrZCT1V/MMnBtXKmoiKDZ78NDBjERki6ZTQZdSMCtkgoNmp17By9ItJr8o7ChX0XxY91nk=',
    platform: 'Bitcore',
    shouldVerify: true
  },
  {
    format: 'bip137',
    address_type: 'p2pkh',
    address: '1HnhWpkMHMjgt167kvgcPyurMmsCQ2WPgg',
    message: 'Hello World',
    signature: 'IAtVrymJqo43BCt9f7Dhl6ET4Gg3SmhyvdlW6wn9iWc9PweD7tNM5+qw7xE9/bzlw/Et789AQ2F59YKEnSzQudo=',
    platform: 'Bitcore',
    shouldVerify: true
  },

  // Ledger/Sparrow Taproot with BIP-137 (non-standard)
  {
    format: 'bip137',
    address_type: 'p2tr',
    address: 'bc1ps5pt865e77nr9t9z7fdefryx27lsz0ced875lxcc68lszvc7x3qsxx25fy',
    message: 'bitcheckdiuq5gh179v9r5vwmw58ijtkea1vb4idr92khiu',
    signature: 'HxOxevYmNjW58m/TBcewrpLbOC0NXjwnWO+jccW9tq8JbdtjI8modbmYbJNVO6PpE9MATfiZeU/S/GbmozNhV4Y=',
    platform: 'Ledger/Sparrow',
    notes: 'Non-standard: BIP-137 used for Taproot address',
    shouldVerify: true // Should work with loose verification
  },

  // P2PKH with same key as above Taproot (for testing)
  {
    format: 'bip137',
    address_type: 'p2pkh',
    address: '19C7EwHP5FN32YPrMRfW7mkFKg3FYwyAzr',
    message: 'bitcheckdiuq5gh179v9r5vwmw58ijtkea1vb4idr92khiu',
    signature: 'HxOxevYmNjW58m/TBcewrpLbOC0NXjwnWO+jccW9tq8JbdtjI8modbmYbJNVO6PpE9MATfiZeU/S/GbmozNhV4Y=',
    platform: 'Ledger/Sparrow',
    notes: 'Same signature as Taproot but with P2PKH address from same key',
    shouldVerify: true
  },

  // BIP-322 test vectors (from spec)
  {
    format: 'bip322-simple',
    address_type: 'p2wpkh',
    address: 'bc1q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0l',
    message: '',  // Empty message
    signature: 'AkcwRAIgM2gBAQqvZX15ZiysmKmQpDrG83avLIT492QBzLnQIxYCIBaTpOaD20qRlEylyxFSeEA2ba9YOixpX8z46TSDtS40ASECx/EgAxlkQpQ9hYjgGu6EBCPMVPwVIVJqO5g/iTvVpds=',
    platform: 'BIP-322 Reference',
    shouldVerify: true
  },
  {
    format: 'bip322-simple',
    address_type: 'p2tr',
    address: 'bc1ppv609nr0vr25u07u95waq5lucwfm6tde4nydujnu8npg4q75mr5sxq8lt3',
    message: 'Hello World',
    signature: 'AUHd69PrJQEv+oKTfZ8l+WROBHuy9HKrbFCJu7U1iK2iiEy1vMU5EfMtjc+VSHM7aU0SDbak5IUZRVno2P5mjSafAQ==',
    platform: 'BIP-322 Reference',
    shouldVerify: true
  },

  // Edge cases
  {
    format: 'bip137',
    address_type: 'p2pkh',
    address: '1HnhWpkMHMjgt167kvgcPyurMmsCQ2WPgg',
    message: 'Test message for flag verification',
    signature: 'HyiLDcQQ1p1aw7ckdbPc1R5wJJGfXj0Zv8r/2xRPvVcLUfmu7Y6GKTkKPt8kfPyJJwZ5H9aSYBthI8Bv1llVhGo=',
    platform: 'Test',
    notes: 'P2PKH compressed with flag 31',
    shouldVerify: true
  },

  // Message normalization tests
  {
    format: 'bip137',
    address_type: 'p2pkh',
    address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
    message: 'hello 🌍\nsecond line',
    signature: '', // Would need to generate
    platform: 'Test',
    notes: 'UTF-8 and newline handling',
    shouldVerify: false // No valid signature yet
  }
];

/**
 * Get fixtures for a specific platform
 */
export function getFixturesByPlatform(platform: string): TestFixture[] {
  return fixtures.filter(f => f.platform === platform);
}

/**
 * Get fixtures for a specific address type
 */
export function getFixturesByAddressType(type: string): TestFixture[] {
  return fixtures.filter(f => f.address_type === type);
}

/**
 * Get fixtures that should verify
 */
export function getValidFixtures(): TestFixture[] {
  return fixtures.filter(f => f.shouldVerify);
}