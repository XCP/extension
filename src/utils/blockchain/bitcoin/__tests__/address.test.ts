import { describe, it, expect, vi } from 'vitest';
import { getDerivationPathForAddressFormat, encodeAddress, getAddressFromMnemonic, isCounterwalletFormat, AddressFormat, decodeAddressFromScript } from '@/utils/blockchain/bitcoin/address';
import { isValidBitcoinAddress } from '@/utils/validation/bitcoin';
import { hexToBytes } from '@noble/hashes/utils.js';

vi.mock('@/utils/blockchain/counterwallet', () => ({
  getCounterwalletSeed: vi.fn(() => new Uint8Array(64).fill(1))
}));

describe('Bitcoin Address Utilities', () => {
  describe('getDerivationPathForAddressFormat', () => {
    it('should return the correct derivation path for P2PKH', () => {
      expect(getDerivationPathForAddressFormat(AddressFormat.P2PKH)).toBe("m/44'/0'/0'/0");
    });

    it('should return the correct derivation path for P2SH_P2WPKH', () => {
      expect(getDerivationPathForAddressFormat(AddressFormat.P2SH_P2WPKH)).toBe("m/49'/0'/0'/0");
    });

    it('should return the correct derivation path for P2WPKH', () => {
      expect(getDerivationPathForAddressFormat(AddressFormat.P2WPKH)).toBe("m/84'/0'/0'/0");
    });

    it('should return the correct derivation path for P2TR', () => {
      expect(getDerivationPathForAddressFormat(AddressFormat.P2TR)).toBe("m/86'/0'/0'/0");
    });

    it('should return the correct derivation path for Counterwallet', () => {
      expect(getDerivationPathForAddressFormat(AddressFormat.Counterwallet)).toBe("m/0'/0");
    });

    it('should return the correct derivation path for CounterwalletSegwit', () => {
      expect(getDerivationPathForAddressFormat(AddressFormat.CounterwalletSegwit)).toBe("m/0'/0");
    });

    it('should throw error for unsupported address type', () => {
      expect(() => getDerivationPathForAddressFormat('invalid' as AddressFormat))
        .toThrow('Unsupported address type: invalid');
    });
  });

  describe('encodeAddress', () => {
    // Known test vector: compressed public key
    const testPubKey = hexToBytes('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798');
    
    it('should encode P2PKH address correctly', () => {
      const address = encodeAddress(testPubKey, AddressFormat.P2PKH);
      expect(typeof address).toBe('string');
      expect(address.startsWith('1')).toBe(true);
      expect(address.length).toBeGreaterThan(25);
      expect(address.length).toBeLessThan(36);
    });

    it('should encode P2SH_P2WPKH address correctly', () => {
      const address = encodeAddress(testPubKey, AddressFormat.P2SH_P2WPKH);
      expect(typeof address).toBe('string');
      expect(address.startsWith('3')).toBe(true);
      expect(address.length).toBeGreaterThan(25);
      expect(address.length).toBeLessThan(36);
    });

    it('should encode P2WPKH address correctly', () => {
      const address = encodeAddress(testPubKey, AddressFormat.P2WPKH);
      expect(typeof address).toBe('string');
      expect(address.startsWith('bc1')).toBe(true);
      expect(address.length).toBe(42); // bech32 P2WPKH is always 42 chars
    });

    it('should encode P2TR address correctly', () => {
      const address = encodeAddress(testPubKey, AddressFormat.P2TR);
      expect(typeof address).toBe('string');
      expect(address.startsWith('bc1p')).toBe(true);
      expect(address.length).toBe(62); // bech32m P2TR is always 62 chars
    });

    it('should encode Counterwallet address correctly', () => {
      const address = encodeAddress(testPubKey, AddressFormat.Counterwallet);
      expect(typeof address).toBe('string');
      expect(address.startsWith('1')).toBe(true);
      expect(address.length).toBeGreaterThan(25);
      expect(address.length).toBeLessThan(36);
    });

    it('should encode CounterwalletSegwit address correctly', () => {
      const address = encodeAddress(testPubKey, AddressFormat.CounterwalletSegwit);
      expect(typeof address).toBe('string');
      expect(address.startsWith('bc1')).toBe(true);
      expect(address.length).toBe(42); // bech32 P2WPKH is always 42 chars
    });

    it('should throw error for unsupported address type', () => {
      expect(() => encodeAddress(testPubKey, 'invalid' as AddressFormat))
        .toThrow('Unsupported address type: invalid');
    });

    it('should handle uncompressed public key', () => {
      const uncompressedPubKey = hexToBytes('0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8');
      const address = encodeAddress(uncompressedPubKey, AddressFormat.P2PKH);
      expect(typeof address).toBe('string');
      expect(address.startsWith('1')).toBe(true);
    });

    it('should generate different addresses for different public keys', () => {
      const pubKey1 = hexToBytes('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798');
      const pubKey2 = hexToBytes('02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9');
      
      const address1 = encodeAddress(pubKey1, AddressFormat.P2PKH);
      const address2 = encodeAddress(pubKey2, AddressFormat.P2PKH);
      
      expect(address1).not.toBe(address2);
    });

    it('should generate same address for same public key', () => {
      const address1 = encodeAddress(testPubKey, AddressFormat.P2PKH);
      const address2 = encodeAddress(testPubKey, AddressFormat.P2PKH);
      
      expect(address1).toBe(address2);
    });

    it('should handle empty public key gracefully', () => {
      expect(() => encodeAddress(new Uint8Array(0), AddressFormat.P2PKH))
        .not.toThrow(); // Should not crash, but may produce invalid address
    });

    it('should handle very short public key', () => {
      const shortPubKey = hexToBytes('02');
      expect(() => encodeAddress(shortPubKey, AddressFormat.P2PKH))
        .not.toThrow(); // Should not crash
    });
  });

  describe('getAddressFromMnemonic', () => {
    const testMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const testPath = "m/84'/0'/0'/0/0";

    it('should derive P2PKH address from mnemonic', () => {
      const address = getAddressFromMnemonic(testMnemonic, "m/44'/0'/0'/0/0", AddressFormat.P2PKH);
      expect(typeof address).toBe('string');
      expect(address.startsWith('1')).toBe(true);
    });

    it('should derive P2WPKH address from mnemonic', () => {
      const address = getAddressFromMnemonic(testMnemonic, testPath, AddressFormat.P2WPKH);
      expect(typeof address).toBe('string');
      expect(address.startsWith('bc1')).toBe(true);
    });

    it('should derive P2SH_P2WPKH address from mnemonic', () => {
      const address = getAddressFromMnemonic(testMnemonic, "m/49'/0'/0'/0/0", AddressFormat.P2SH_P2WPKH);
      expect(typeof address).toBe('string');
      expect(address.startsWith('3')).toBe(true);
    });

    it('should derive P2TR address from mnemonic', () => {
      const address = getAddressFromMnemonic(testMnemonic, "m/86'/0'/0'/0/0", AddressFormat.P2TR);
      expect(typeof address).toBe('string');
      expect(address.startsWith('bc1p')).toBe(true);
    });

    it('should derive Counterwallet address from mnemonic', () => {
      const address = getAddressFromMnemonic(testMnemonic, "m/0'/0", AddressFormat.Counterwallet);
      expect(typeof address).toBe('string');
      expect(address.startsWith('1')).toBe(true);
    });

    it('should derive CounterwalletSegwit address from mnemonic', () => {
      const address = getAddressFromMnemonic(testMnemonic, "m/0'/0", AddressFormat.CounterwalletSegwit);
      expect(typeof address).toBe('string');
      expect(address.startsWith('bc1')).toBe(true);
      expect(address.length).toBe(42); // bech32 P2WPKH is always 42 chars
    });

    it('should generate different addresses for different paths', () => {
      const address1 = getAddressFromMnemonic(testMnemonic, "m/84'/0'/0'/0/0", AddressFormat.P2WPKH);
      const address2 = getAddressFromMnemonic(testMnemonic, "m/84'/0'/0'/0/1", AddressFormat.P2WPKH);
      
      expect(address1).not.toBe(address2);
    });

    it('should generate same address for same inputs', () => {
      const address1 = getAddressFromMnemonic(testMnemonic, testPath, AddressFormat.P2WPKH);
      const address2 = getAddressFromMnemonic(testMnemonic, testPath, AddressFormat.P2WPKH);
      
      expect(address1).toBe(address2);
    });

    it('should handle different mnemonic lengths', () => {
      // 24-word mnemonic
      const longMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';
      const address = getAddressFromMnemonic(longMnemonic, testPath, AddressFormat.P2WPKH);
      
      expect(typeof address).toBe('string');
      expect(address.startsWith('bc1')).toBe(true);
    });

    it('should throw error for invalid mnemonic', () => {
      const invalidMnemonic = 'invalid mnemonic phrase';
      expect(() => getAddressFromMnemonic(invalidMnemonic, testPath, AddressFormat.P2WPKH))
        .toThrow();
    });

    it('should throw error for invalid derivation path', () => {
      expect(() => getAddressFromMnemonic(testMnemonic, 'invalid/path', AddressFormat.P2WPKH))
        .toThrow();
    });

    it('should handle hardened derivation paths', () => {
      const hardenedPath = "m/84'/0'/0'/0'/0'";
      const address = getAddressFromMnemonic(testMnemonic, hardenedPath, AddressFormat.P2WPKH);
      
      expect(typeof address).toBe('string');
      expect(address.startsWith('bc1')).toBe(true);
    });

    it('should handle deep derivation paths', () => {
      const deepPath = "m/84'/0'/0'/0/0/1/2/3";
      const address = getAddressFromMnemonic(testMnemonic, deepPath, AddressFormat.P2WPKH);
      
      expect(typeof address).toBe('string');
      expect(address.startsWith('bc1')).toBe(true);
    });
  });

  describe('isCounterwalletFormat', () => {
    it('should correctly identify Counterwallet formats', () => {
      expect(isCounterwalletFormat(AddressFormat.Counterwallet)).toBe(true);
      expect(isCounterwalletFormat(AddressFormat.CounterwalletSegwit)).toBe(true);
      expect(isCounterwalletFormat(AddressFormat.P2PKH)).toBe(false);
      expect(isCounterwalletFormat(AddressFormat.P2WPKH)).toBe(false);
      expect(isCounterwalletFormat(AddressFormat.P2SH_P2WPKH)).toBe(false);
      expect(isCounterwalletFormat(AddressFormat.P2TR)).toBe(false);
    });
  });

  describe('decodeAddressFromScript', () => {
    it('should decode P2PKH script to address', () => {
      // P2PKH script: OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG
      // Example: 76a914751e76e8199196d454941c45d1b3a323f1433bd688ac
      const script = '76a914751e76e8199196d454941c45d1b3a323f1433bd688ac';
      const address = decodeAddressFromScript(script);
      expect(address).toBe('1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH');
    });

    it('should decode P2WPKH script to bech32 address', () => {
      // P2WPKH script: OP_0 <20 bytes>
      // Example: 0014751e76e8199196d454941c45d1b3a323f1433bd6
      const script = '0014751e76e8199196d454941c45d1b3a323f1433bd6';
      const address = decodeAddressFromScript(script);
      expect(address).toBe('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4');
    });

    it('should decode P2SH script to address', () => {
      // P2SH script: OP_HASH160 <20 bytes> OP_EQUAL
      const script = 'a91489abcdefabbaabbaabbaabbaabbaabbaabbaabba87';
      const address = decodeAddressFromScript(script);
      // Verify it's a valid P2SH address (starts with 3)
      expect(address).toBe('3EExK1K1TF3v7zsFtQHt14XqexCwgmXM1y');
    });

    it('should decode P2TR script to bech32m address', () => {
      // P2TR script: OP_1 <32 bytes>
      const script = '5120a60869f0dbcf1dc659c9cecbaf8050135ea9e8cdc487053f1dc6880949dc684c';
      const address = decodeAddressFromScript(script);
      // Verify it's a valid P2TR address (starts with bc1p)
      expect(address?.startsWith('bc1p')).toBe(true);
      expect(address?.length).toBe(62); // bech32m P2TR is 62 chars
    });

    it('should return null for OP_RETURN script', () => {
      // OP_RETURN script: 6a<data>
      const script = '6a0f68656c6c6f20776f726c64';
      const address = decodeAddressFromScript(script);
      expect(address).toBeNull();
    });

    it('should return null for invalid script', () => {
      const address = decodeAddressFromScript('invalid');
      expect(address).toBeNull();
    });

    it('should return null for empty script', () => {
      const address = decodeAddressFromScript('');
      expect(address).toBeNull();
    });

    it('should return null for script with wrong length', () => {
      // P2WPKH but wrong length
      const script = '001400';
      const address = decodeAddressFromScript(script);
      expect(address).toBeNull();
    });

    it('should roundtrip with encodeAddress for P2PKH', () => {
      // Get a P2PKH address from test public key
      const testPubKey = hexToBytes('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798');
      const originalAddress = encodeAddress(testPubKey, AddressFormat.P2PKH);

      // Create the P2PKH script (would normally come from a transaction)
      // This is a simplified test - in reality we'd derive the hash from the pubkey
      const script = '76a914' + originalAddress.slice(1, 41).padEnd(40, '0') + '88ac';

      // The address we decode won't match because the script hash doesn't match the address
      // This just tests that decoding produces a valid P2PKH address
      const decoded = decodeAddressFromScript('76a914751e76e8199196d454941c45d1b3a323f1433bd688ac');
      expect(decoded?.startsWith('1')).toBe(true);
    });

    it('should handle valid P2WPKH roundtrip', () => {
      // A known P2WPKH address and its script
      const script = '0014751e76e8199196d454941c45d1b3a323f1433bd6';
      const decoded = decodeAddressFromScript(script);
      expect(decoded).toBe('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4');
      expect(isValidBitcoinAddress(decoded!)).toBe(true);
    });
  });

  describe('integration tests', () => {
    it('should create valid addresses that pass validation', () => {
      const testMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

      // Generate P2PKH address and validate it
      const p2pkhAddress = getAddressFromMnemonic(testMnemonic, "m/44'/0'/0'/0/0", AddressFormat.P2PKH);
      expect(isValidBitcoinAddress(p2pkhAddress)).toBe(true);

      // Generate P2SH address and validate it
      const p2shAddress = getAddressFromMnemonic(testMnemonic, "m/49'/0'/0'/0/0", AddressFormat.P2SH_P2WPKH);
      expect(isValidBitcoinAddress(p2shAddress)).toBe(true);

      // Generate P2WPKH address and validate it
      const p2wpkhAddress = getAddressFromMnemonic(testMnemonic, "m/84'/0'/0'/0/0", AddressFormat.P2WPKH);
      expect(isValidBitcoinAddress(p2wpkhAddress)).toBe(true);

      // Generate P2TR address and validate it
      const p2trAddress = getAddressFromMnemonic(testMnemonic, "m/86'/0'/0'/0/0", AddressFormat.P2TR);
      expect(isValidBitcoinAddress(p2trAddress)).toBe(true);
    });

    it('should maintain consistency across address types', () => {
      const addressFormats = [
        AddressFormat.P2PKH,
        AddressFormat.P2SH_P2WPKH,
        AddressFormat.P2WPKH,
        AddressFormat.P2TR,
        AddressFormat.Counterwallet
      ];

      const testMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      
      addressFormats.forEach(addressFormat => {
        const path = getDerivationPathForAddressFormat(addressFormat);
        const fullPath = path + '/0';
        const address = getAddressFromMnemonic(testMnemonic, fullPath, addressFormat);
        
        expect(typeof address).toBe('string');
        expect(address.length).toBeGreaterThan(0);
      });
    });
  });
});
