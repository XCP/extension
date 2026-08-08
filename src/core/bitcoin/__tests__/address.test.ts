import { hexToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it, vi } from 'vitest';
import { AddressFormat, decodeAddressFromScript, encodeAddress, getAddressFromMnemonic, getDerivationPathForAddressFormat, isCounterwalletFormat } from '@/core/bitcoin/address';
import { isValidBitcoinAddress } from '@/core/validation/bitcoin';

vi.mock('@/core/counterwallet', () => ({
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
    // secp256k1's generator point G, i.e. the public key for private key 1.
    // Its addresses are published, so the expectations below are independent of
    // this codebase rather than recordings of whatever it happens to produce.
    const testPubKey = hexToBytes('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798');
    const uncompressedPubKey = hexToBytes('0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8');

    // These used to assert only `typeof address === 'string'`, a prefix and a
    // length band. Every wrong-but-well-formed address passes that: the wrong
    // hash, the wrong key encoding, the wrong network byte within a prefix
    // class. The compressed and uncompressed cases below are the same key and
    // differ only in encoding, and both satisfy startsWith('1').
    it('should encode P2PKH address correctly', () => {
      expect(encodeAddress(testPubKey, AddressFormat.P2PKH))
        .toBe('1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH');
    });

    it('should encode P2SH_P2WPKH address correctly', () => {
      expect(encodeAddress(testPubKey, AddressFormat.P2SH_P2WPKH))
        .toBe('3JvL6Ymt8MVWiCNHC7oWU6nLeHNJKLZGLN');
    });

    it('should encode P2WPKH address correctly', () => {
      // BIP-173 test vector.
      expect(encodeAddress(testPubKey, AddressFormat.P2WPKH))
        .toBe('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4');
    });

    it('should encode P2TR address correctly', () => {
      // BIP-350 test vector.
      expect(encodeAddress(testPubKey, AddressFormat.P2TR))
        .toBe('bc1pmfr3p9j00pfxjh0zmgp99y8zftmd3s5pmedqhyptwy6lm87hf5sspknck9');
    });

    it('should encode Counterwallet address as P2PKH', () => {
      expect(encodeAddress(testPubKey, AddressFormat.Counterwallet))
        .toBe('1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH');
    });

    it('should encode CounterwalletSegwit address as P2WPKH', () => {
      expect(encodeAddress(testPubKey, AddressFormat.CounterwalletSegwit))
        .toBe('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4');
    });

    it('should throw error for unsupported address type', () => {
      expect(() => encodeAddress(testPubKey, 'invalid' as AddressFormat))
        .toThrow('Unsupported address type: invalid');
    });

    it('should handle uncompressed public key', () => {
      expect(encodeAddress(uncompressedPubKey, AddressFormat.P2PKH))
        .toBe('1EHNa6Q4Jz2uvNExL497mE43ikXhwF6kZm');
    });

    it('should not conflate the two encodings of one key', () => {
      // Same point, two serialisations, two different addresses. A prefix or
      // length check cannot tell these apart, which is how an encoding bug
      // hides.
      const compressed = encodeAddress(testPubKey, AddressFormat.P2PKH);
      const uncompressed = encodeAddress(uncompressedPubKey, AddressFormat.P2PKH);

      expect(compressed).not.toBe(uncompressed);
      expect(compressed.startsWith('1')).toBe(true);
      expect(uncompressed.startsWith('1')).toBe(true);
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

    // testMnemonic is the BIP-39 "abandon ... about" vector, so the first
    // receiving address of each standard account is published in the BIP that
    // defines the path. Asserting the address rather than its shape is what
    // makes these tests able to catch a derivation change.
    it('should derive P2PKH address from mnemonic', () => {
      // BIP-44 m/44'/0'/0'/0/0
      expect(getAddressFromMnemonic(testMnemonic, "m/44'/0'/0'/0/0", AddressFormat.P2PKH))
        .toBe('1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA');
    });

    it('should derive P2WPKH address from mnemonic', () => {
      // BIP-84 m/84'/0'/0'/0/0, given verbatim in the BIP.
      expect(getAddressFromMnemonic(testMnemonic, testPath, AddressFormat.P2WPKH))
        .toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
    });

    it('should derive P2SH_P2WPKH address from mnemonic', () => {
      // BIP-49 m/49'/0'/0'/0/0
      expect(getAddressFromMnemonic(testMnemonic, "m/49'/0'/0'/0/0", AddressFormat.P2SH_P2WPKH))
        .toBe('37VucYSaXLCAsxYyAPfbSi9eh4iEcbShgf');
    });

    it('should derive P2TR address from mnemonic', () => {
      // BIP-86 m/86'/0'/0'/0/0, given verbatim in the BIP.
      expect(getAddressFromMnemonic(testMnemonic, "m/86'/0'/0'/0/0", AddressFormat.P2TR))
        .toBe('bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr');
    });

    // Counterwallet has no BIP to cite and derives from the seed mocked at the
    // top of this file, so these two pin current behaviour rather than an
    // external standard. They still fail if the derivation changes.
    it('should derive Counterwallet address from mnemonic', () => {
      expect(getAddressFromMnemonic(testMnemonic, "m/0'/0", AddressFormat.Counterwallet))
        .toBe('1537tphrFkmJcxsmGqXprqpsKEUcSU5NHV');
    });

    it('should derive CounterwalletSegwit address from mnemonic', () => {
      expect(getAddressFromMnemonic(testMnemonic, "m/0'/0", AddressFormat.CounterwalletSegwit))
        .toBe('bc1q93r3de5tt6ks8qjuj2e3zd5r2p6rcmluzteug4');
    });

    it('should generate different addresses for different paths', () => {
      // BIP-84's second receiving address, m/84'/0'/0'/0/1.
      expect(getAddressFromMnemonic(testMnemonic, "m/84'/0'/0'/0/0", AddressFormat.P2WPKH))
        .toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
      expect(getAddressFromMnemonic(testMnemonic, "m/84'/0'/0'/0/1", AddressFormat.P2WPKH))
        .toBe('bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g');
    });

    it('should generate same address for same inputs', () => {
      const address1 = getAddressFromMnemonic(testMnemonic, testPath, AddressFormat.P2WPKH);
      const address2 = getAddressFromMnemonic(testMnemonic, testPath, AddressFormat.P2WPKH);
      
      expect(address1).toBe(address2);
    });

    it('should handle different mnemonic lengths', () => {
      // The 24-word "abandon ... art" BIP-39 vector. Asserting the address is
      // what distinguishes "a 24-word phrase derives its own key" from "a
      // 24-word phrase silently derives the 12-word one".
      const longMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';
      const address = getAddressFromMnemonic(longMnemonic, testPath, AddressFormat.P2WPKH);

      expect(address).toBe('bc1qzmtrqsfuaf6l6kkcsseumq26ukaphfj9skkug6');
      expect(address).not.toBe(getAddressFromMnemonic(testMnemonic, testPath, AddressFormat.P2WPKH));
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
      // Hardened child indices take a different derivation branch, so this
      // must not land on the unhardened m/84'/0'/0'/0/0 address.
      const address = getAddressFromMnemonic(testMnemonic, "m/84'/0'/0'/0'/0'", AddressFormat.P2WPKH);

      expect(address).toBe('bc1q8d2x9494zdyx6ka8pp4p94xe8jpsef77pzl7td');
      expect(address).not.toBe(getAddressFromMnemonic(testMnemonic, testPath, AddressFormat.P2WPKH));
    });

    it('should handle deep derivation paths', () => {
      const address = getAddressFromMnemonic(testMnemonic, "m/84'/0'/0'/0/0/1/2/3", AddressFormat.P2WPKH);

      expect(address).toBe('bc1qd7kpfv598fstjzu6p4c9rkc4eqt4p9v0vysyd8');
      expect(address).not.toBe(getAddressFromMnemonic(testMnemonic, testPath, AddressFormat.P2WPKH));
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

    it('should decode P2WSH script to bech32 address', () => {
      // P2WSH: OP_0 <32 bytes>. BIP-173 test vector.
      const script = '00201863143c14c5166804bd19203356da136c985678cd4d27a1b8c6329604903262';
      expect(decodeAddressFromScript(script)).toBe(
        'bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3'
      );
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

    // A script with a valid prefix and length but a non-hex hash used to decode to zero bytes,
    // because parseInt returns NaN for a bad pair and Uint8Array stores NaN as 0. That handed back
    // a real, wrong address instead of null - and output accounting reads null as "cannot be
    // attributed", so a wrong address is worse there than no address.
    it.each([
      ['0014' + 'z'.repeat(40), 'P2WPKH with a non-hex hash'],
      ['76a914' + 'z'.repeat(40) + '88ac', 'P2PKH with a non-hex hash'],
      ['a914' + 'z'.repeat(40) + '87', 'P2SH with a non-hex hash'],
      ['5120' + 'z'.repeat(64), 'P2TR with a non-hex key'],
    ])('returns null for %s (%s)', (script) => {
      expect(decodeAddressFromScript(script)).toBeNull();
    });

    it('does not decode a malformed hash to the all-zeros address', () => {
      const zeros = decodeAddressFromScript('0014' + '0'.repeat(40));
      const garbage = decodeAddressFromScript('0014' + 'z'.repeat(40));
      expect(zeros).not.toBeNull();
      expect(garbage).toBeNull();
      expect(garbage).not.toBe(zeros);
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
      const _script = '76a914' + originalAddress.slice(1, 41).padEnd(40, '0') + '88ac';

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
      
      // Every format must produce an address that validates, and no two
      // formats may collide. `typeof address === 'string'` and a non-zero
      // length were true of any return value at all, including one format
      // silently falling back to another.
      const derived = addressFormats.map(addressFormat => {
        const fullPath = `${getDerivationPathForAddressFormat(addressFormat)}/0`;
        return getAddressFromMnemonic(testMnemonic, fullPath, addressFormat);
      });

      for (const address of derived) {
        expect(isValidBitcoinAddress(address)).toBe(true);
      }
      expect(new Set(derived).size).toBe(addressFormats.length);
    });
  });
});
