/**
 * BIP-322 Standardness Tests
 * Tests from bip322-js library to ensure cross-platform compatibility
 * https://github.com/ACken2/bip322-js
 */

import { sha256 } from '@noble/hashes/sha2.js';
import * as secp256k1 from '@noble/secp256k1';
import { base64, hex } from '@scure/base';
import * as btc from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import {
  bip322MessageHash,
  createToSignTransaction,
  createToSpendTransaction,
  signBIP322P2PKH,
  signBIP322P2SH_P2WPKH,
  signBIP322P2TR,
  signBIP322P2WPKH,
  taprootOutputKey,
  verifyBIP322Signature
} from '../bip322';
import { verifyMessage, verifyMessageWithMethod } from '../messageVerifier';

describe('BIP-322 Standardness Tests from bip322-js', () => {
  describe('Legacy P2PKH Signature Verification', () => {
    // The canonical BIP-137 vector from bip322-js. This asserted only that the result was an object
    // with a boolean field, which is true of every possible outcome.
    it('verifies the reference BIP-137 P2PKH signature', async () => {
      const address = '1F3sAm6ZtwLAUnj7d38pGFxtP3RVEvtsbV';
      const message = 'This is an example of a signed message.';
      const signature = 'H9L5yLFjti0QTHhPyFrZCT1V/MMnBtXKmoiKDZ78NDBjERki6ZTQZdSMCtkgoNmp17By9ItJr8o7ChX0XxY91nk=';

      expect((await verifyMessage(message, signature, address)).valid).toBe(true);
      expect((await verifyMessageWithMethod(message, signature, address)).valid).toBe(true);
    });

    it('rejects the reference signature against a different message or address', async () => {
      const signature = 'H9L5yLFjti0QTHhPyFrZCT1V/MMnBtXKmoiKDZ78NDBjERki6ZTQZdSMCtkgoNmp17By9ItJr8o7ChX0XxY91nk=';
      expect((await verifyMessage('This is an example of a signed message', signature, '1F3sAm6ZtwLAUnj7d38pGFxtP3RVEvtsbV')).valid).toBe(false);
      expect((await verifyMessage('This is an example of a signed message.', signature, '1HnhWpkMHMjgt167kvgcPyurMmsCQ2WPgg')).valid).toBe(false);
    });
  });

  describe('BIP-137 Loose Verification', () => {
    // This signature is a real one, but it does not belong to this address: it recovers to
    // 1QDZfWJTVXqHFmJFRkyrnidvHyPyG5bynY under every recovery id, point encoding and script type.
    // The matching fixture was removed from `wallet-fixtures.test.ts` for that reason. The test kept
    // it and only logged the outcome, under a name claiming verification "should work" — so what it
    // actually establishes is the opposite, and worth keeping as that: loose verification widens
    // which header flags are tried, and must not widen which addresses are accepted.
    it('rejects a signature that belongs to another address, whatever the header flag', async () => {

      const message = 'Hello World';
      // Signature with flag that might not match the address type exactly
      const signatureBase = 'IAtVrymJqo43BCt9f7Dhl6ET4Gg3SmhyvdlW6wn9iWc9PweD7tNM5+qw7xE9/bzlw/Et789AQ2F59YKEnSzQudo=';

      // Test with different flag modifications (27-42 range)
      const testCases = [
        { flag: 27, desc: 'P2PKH uncompressed' },
        { flag: 31, desc: 'P2PKH compressed' },
        { flag: 35, desc: 'P2SH-P2WPKH' },
        { flag: 39, desc: 'P2WPKH' }
      ];

      // Decode original signature and test with different flags
      const originalSig = base64.decode(signatureBase);

      for (const testCase of testCases) {
        const modifiedSig = new Uint8Array(originalSig);
        modifiedSig[0] = testCase.flag;
        const modifiedSigBase64 = base64.encode(modifiedSig);

        // Test with P2PKH address derived from same public key
        // This tests that the verification works even with "wrong" header
        const address = '1HnhWpkMHMjgt167kvgcPyurMmsCQ2WPgg';

        const result = await verifyMessageWithMethod(message, modifiedSigBase64, address);
        expect(result.valid, `${testCase.desc} flag must not verify against a foreign address`)
          .toBe(false);
      }
    });

    // Sparrow and Ledger sign taproot addresses with a BIP-137 recoverable signature rather than
    // BIP-322. Vector from bip322-js issue #1. This asserted only `typeof result === 'object'`,
    // which held whichever way the verification went, so it recorded no behaviour at all. Pinned
    // here to whatever the verifier actually does, so that a change to it has to be deliberate.
    it('handles a Ledger/Sparrow BIP-137 signature over a taproot address', async () => {
      const address = 'bc1ps5pt865e77nr9t9z7fdefryx27lsz0ced875lxcc68lszvc7x3qsxx25fy';
      const message = 'bitcheckdiuq5gh179v9r5vwmw58ijtkea1vb4idr92khiu';
      const signature = 'HxOxevYmNjW58m/TBcewrpLbOC0NXjwnWO+jccW9tq8JbdtjI8modbmYbJNVO6PpE9MATfiZeU/S/GbmozNhV4Y=';

      expect((await verifyMessageWithMethod(message, signature, address)).valid).toBe(true);

      // A BIP-137 signature is recoverable, so it proves control of the key rather than of one
      // address, and loose verification accepts every address type that key derives. The P2PKH
      // spelling of the same key therefore also verifies. What must stay narrow is *which key* is
      // accepted, not which spelling of it — that boundary is the "rejects a signature that belongs
      // to another address" test above, which is where a widening would actually be a defect.
      const p2pkhAddress = '19C7EwHP5FN32YPrMRfW7mkFKg3FYwyAzr';
      expect((await verifyMessage(message, signature, p2pkhAddress)).valid).toBe(true);
    });
  });

  /**
   * The vectors published with BIP-322 itself, in `bip-0322/basic-test-vectors.json`.
   *
   * These previously sat here in a corrupted form — the trailing bytes of both signatures differed
   * from the spec's (`...O5XyRMZwLpM=` for the spec's `...sMvViHI=`), so the encoded public key did
   * not belong to the address — under a test that only asserted `typeof result === 'boolean'`. That
   * is true whether verification passes or fails, so it recorded a total interoperability failure
   * as a pass. Two separate defects were behind it:
   *
   *   1. `to_sign`'s `vin[0].prevout.hash` was byte-reversed. A prevout hash is the double-SHA256
   *      in natural order; the code reversed it into the *displayed* txid form.
   *   2. `@noble/secp256k1` v3 defaults to `prehash: true`, so both signing and verification ran
   *      over `sha256(sighash)`. Self-consistent, and therefore invisible to a round-trip test.
   *
   * Either one alone makes the wallet non-interoperable, and fixing either one alone leaves it
   * non-interoperable — which is why these have to be checked against externally produced
   * signatures rather than against our own.
   */
  describe('BIP-322 P2WPKH Test Vectors', () => {
    const SPEC_ADDRESS = 'bc1q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0l';

    // Both encodings the spec publishes per message: ECDSA leaves r and s free, so the same key and
    // message legitimately produce more than one valid signature.
    const SPEC_VECTORS = [
      { message: '', signature: 'AkcwRAIgM2gBAQqvZX15ZiysmKmQpDrG83avLIT492QBzLnQIxYCIBaTpOaD20qRlEylyxFSeEA2ba9YOixpX8z46TSDtS40ASECx/EgAxlkQpQ9hYjgGu6EBCPMVPwVIVJqO4XCsMvViHI=' },
      { message: '', signature: 'AkgwRQIhAPkJ1Q4oYS0htvyuSFHLxRQpFAY56b70UvE7Dxazen0ZAiAtZfFz1S6T6I23MWI2lK/pcNTWncuyL8UL+oMdydVgzAEhAsfxIAMZZEKUPYWI4BruhAQjzFT8FSFSajuFwrDL1Yhy' },
      { message: 'Hello World', signature: 'AkcwRAIgZRfIY3p7/DoVTty6YZbWS71bc5Vct9p9Fia83eRmw2QCICK/ENGfwLtptFluMGs2KsqoNSk89pO7F29zJLUx9a/sASECx/EgAxlkQpQ9hYjgGu6EBCPMVPwVIVJqO4XCsMvViHI=' },
      { message: 'Hello World', signature: 'AkgwRQIhAOzyynlqt93lOKJr+wmmxIens//zPzl9tqIOua93wO6MAiBi5n5EyAcPScOjf1lAqIUIQtr3zKNeavYabHyR8eGhowEhAsfxIAMZZEKUPYWI4BruhAQjzFT8FSFSajuFwrDL1Yhy' },
    ];

    it.each(SPEC_VECTORS)('verifies the spec vector for $message', async ({ message, signature }) => {
      expect(await verifyBIP322Signature(message, signature, SPEC_ADDRESS)).toBe(true);
    });

    it('rejects a spec vector paired with the wrong message', async () => {
      // The two messages' signatures are interchangeable only if the sighash ignores the message.
      expect(await verifyBIP322Signature('Hello World', SPEC_VECTORS[0]!.signature, SPEC_ADDRESS)).toBe(false);
      expect(await verifyBIP322Signature('', SPEC_VECTORS[2]!.signature, SPEC_ADDRESS)).toBe(false);
    });

    it('rejects a spec vector against a different address', async () => {
      const other = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
      expect(await verifyBIP322Signature('', SPEC_VECTORS[0]!.signature, other)).toBe(false);
    });

    it('rejects a tampered spec vector', async () => {
      const bytes = base64.decode(SPEC_VECTORS[0]!.signature);
      bytes[10] = bytes[10]! ^ 0x01;
      expect(await verifyBIP322Signature('', base64.encode(bytes), SPEC_ADDRESS)).toBe(false);
    });

    /**
     * The spec's `to_sign_tx_hash` commits to the prevout, version, sequence, outputs and locktime,
     * and to nothing about the signature. It therefore pins the byte order on its own — this is the
     * assertion that localises defect 1 above, without any cryptography in the way.
     */
    describe('structural intermediates', () => {
      const TX_HASHES = [
        { message: '', messageHash: 'c90c269c4f8fcbe6880f72a721ddfbf1914268a794cbb21cfafee13770ae19f1', toSpend: 'c5680aa69bb8d860bf82d4e9cd3504b55dde018de765a91bb566283c545a99a7', toSign: '1e9654e951a5ba44c8604c4de6c67fd78a27e81dcadcfe1edf638ba3aaebaed6' },
        { message: 'Hello World', messageHash: 'f0eb03b1a75ac6d9847f55c624a99169b5dccba2a31f5b23bea77ba270de0a7a', toSpend: 'b79d196740ad5217771c1098fc4a4b51e0535c32236c71f1ea4d61a2d603352b', toSign: '88737ae86f2077145f93cc4b153ae9a1cb8d56afa511988c149c5c8c9d93bddf' },
        { message: 'UTF-8 support: öäüéàè 测试文本 😄', messageHash: '43936b237ea38c7794eb5d755e0d220b6db92ebfc5c8f482759d22b1286376d7', toSpend: 'c8f4f525fe8afb1bc09b44175bd2096f079c98425e8a1be676b712add1fb62f0', toSign: '8f488e06b89eafd019ec528109eafaf7f1d1811fd617aa1eeb9658f1c1be6586' },
      ];

      /** A txid is the double-SHA256 displayed in reverse; the serialized bytes carry it natural. */
      const txid = (tx: Uint8Array) => hex.encode(Uint8Array.from(sha256(sha256(tx))).reverse());

      const scriptPubKey = btc.p2wpkh(
        hex.decode('02c7f12003196442943d8588e01aee840423cc54fc1521526a3b85c2b0cbd58872')
      ).script;

      it.each(TX_HASHES)('matches the spec hashes for $message', (vector) => {
        const messageHash = bip322MessageHash(vector.message);
        expect(hex.encode(messageHash)).toBe(vector.messageHash);

        const toSpend = createToSpendTransaction(messageHash, scriptPubKey);
        expect(txid(toSpend)).toBe(vector.toSpend);

        expect(txid(createToSignTransaction(toSpend))).toBe(vector.toSign);
      });

      it('derives the spec address from the vectors public key', () => {
        // Guards the vectors themselves: the stored ones were corrupted in exactly this field.
        expect(btc.p2wpkh(hex.decode('02c7f12003196442943d8588e01aee840423cc54fc1521526a3b85c2b0cbd58872')).address)
          .toBe(SPEC_ADDRESS);
      });
    });
  });

  describe('BIP-322 P2TR Test Vectors', () => {
    it('should verify BIP-322 P2TR signatures', async () => {
      // Generate test vectors using our implementation
      const privateKey = hex.decode('0000000000000000000000000000000000000000000000000000000000000001');
      const pubKey = secp256k1.getPublicKey(privateKey, true);
      const xOnlyPubKey = pubKey.slice(1, 33);
      const p2tr = btc.p2tr(xOnlyPubKey);
      const address = p2tr.address!;

      const testMessages = ['', 'Hello World', 'The quick brown fox jumps over the lazy dog'];

      for (const message of testMessages) {
        const signature = await signBIP322P2TR(message, privateKey);
        const isValid = await verifyBIP322Signature(message, signature, address);
        expect(isValid).toBe(true);
        console.log(`✓ P2TR message "${message.slice(0, 20)}..." signed and verified`);
      }
    });

    // A standard BIP-322 simple signature: a base64 witness stack holding one 65-byte Schnorr
    // signature whose trailing byte is SIGHASH_ALL. Vector from bip322-js.
    //
    // This test used to pair the signature with the empty message and only console.log the result,
    // so it recorded a failure as a pass twice over: the message was wrong, and the verifier had no
    // standard taproot path at all.
    const P2TR_ADDRESS = 'bc1ppv609nr0vr25u07u95waq5lucwfm6tde4nydujnu8npg4q75mr5sxq8lt3';
    const P2TR_SIGHASH_ALL_SIG =
      'AUHd69PrJQEv+oKTfZ8l+WROBHuy9HKrbFCJu7U1iK2iiEy1vMU5EfMtjc+VSHM7aU0SDbak5IUZRVno2P5mjSafAQ==';

    it('signs taproot in the interoperable format, and verifies its own output', async () => {
      const priv = hex.decode('55d7c5a9ce3d2b15a62434d01205f3e59077d51316f5c20628b3a4b8b2a76f4c');
      const internalKey = secp256k1.getPublicKey(priv, true).slice(1, 33);
      const address = btc.p2tr(internalKey).address!;

      const signature = await signBIP322P2TR('Hello World', priv);

      // Not the old `tr:` string, which nothing else could read.
      expect(signature.startsWith('tr:')).toBe(false);
      expect(await verifyBIP322Signature('Hello World', signature, address)).toBe(true);
      expect(await verifyBIP322Signature('Goodbye', signature, address)).toBe(false);
    });

    it('signs for the key the address commits to, not the internal key', async () => {
      // A taproot output commits to Q = P + H_TapTweak(P)*G. The previous signer used P, so its
      // signatures could never verify against the address. Checked against scure's own tweak so
      // this does not merely agree with itself.
      const priv = hex.decode('55d7c5a9ce3d2b15a62434d01205f3e59077d51316f5c20628b3a4b8b2a76f4c');
      const internalKey = secp256k1.getPublicKey(priv, true).slice(1, 33);
      const payment = btc.p2tr(internalKey);

      const fromAddress = taprootOutputKey(payment.address!);
      expect(fromAddress).not.toBeNull();
      expect(hex.encode(fromAddress!)).toBe(hex.encode(payment.tweakedPubkey));
      expect(hex.encode(fromAddress!)).not.toBe(hex.encode(internalKey));
    });

    // BIP-322's own `basic-test-vectors.json`, which #294's bip322-js vector did not cover.
    it('verifies the spec P2TR vector', async () => {
      expect(await verifyBIP322Signature(
        'No prefix fallback',
        'AUCJYOwOjxYAvatTAGYaVlNXBVyFuc4MwNQkOuK2tl8xhfKDONd0NjfYyNSYcRqeCp8hsAnCEPHAVEkO9h6vbQ/R',
        'bc1pss0zhytly75awhm6x2hhvd5lnzv3vssgrf9axfheq8ldyzn88ges79fler'
      )).toBe(true);
    });

    it('rejects the spec P2TR vector against a different message', async () => {
      expect(await verifyBIP322Signature(
        'No prefix fallback ',
        'AUCJYOwOjxYAvatTAGYaVlNXBVyFuc4MwNQkOuK2tl8xhfKDONd0NjfYyNSYcRqeCp8hsAnCEPHAVEkO9h6vbQ/R',
        'bc1pss0zhytly75awhm6x2hhvd5lnzv3vssgrf9axfheq8ldyzn88ges79fler'
      )).toBe(false);
    });

    it('verifies a P2TR SIGHASH_ALL signature', async () => {
      expect(await verifyBIP322Signature('Hello World', P2TR_SIGHASH_ALL_SIG, P2TR_ADDRESS)).toBe(true);
    });

    it('rejects it against a different message', async () => {
      expect(await verifyBIP322Signature('', P2TR_SIGHASH_ALL_SIG, P2TR_ADDRESS)).toBe(false);
      expect(await verifyBIP322Signature('Hello World ', P2TR_SIGHASH_ALL_SIG, P2TR_ADDRESS)).toBe(false);
    });

    it('rejects it against a different taproot address', async () => {
      const other = 'bc1pqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesf3hn0c';
      expect(await verifyBIP322Signature('Hello World', P2TR_SIGHASH_ALL_SIG, other)).toBe(false);
    });

    it('rejects a tampered signature', async () => {
      const bytes = base64.decode(P2TR_SIGHASH_ALL_SIG);
      bytes[10] = bytes[10]! ^ 0x01;
      expect(await verifyBIP322Signature('Hello World', base64.encode(bytes), P2TR_ADDRESS)).toBe(false);
    });

    it('rejects a 65-byte signature that re-encodes SIGHASH_DEFAULT', async () => {
      // BIP-341 gives SIGHASH_DEFAULT one encoding: 64 bytes. A 65-byte signature ending in 0x00 is
      // a second spelling of it, and must not be accepted as an alternative.
      const bytes = base64.decode(P2TR_SIGHASH_ALL_SIG);
      bytes[bytes.length - 1] = 0x00;
      expect(await verifyBIP322Signature('Hello World', base64.encode(bytes), P2TR_ADDRESS)).toBe(false);
    });
  });

  describe('Cross-address-type verification', () => {
    it('should not verify signatures across different address types', async () => {
      const privateKey = hex.decode('0000000000000000000000000000000000000000000000000000000000000001');
      const pubKey = secp256k1.getPublicKey(privateKey, true);

      // Generate addresses of different types from same key
      const p2pkh = btc.p2pkh(pubKey);
      const p2wpkh = btc.p2wpkh(pubKey);
      const p2sh = btc.p2sh(p2wpkh);

      const message = 'Test message';

      // Sign with P2PKH
      const p2pkhSig = await signBIP322P2PKH(message, privateKey, true);

      // Sign with P2WPKH
      const p2wpkhSig = await signBIP322P2WPKH(message, privateKey);

      // Sign with P2SH-P2WPKH
      const p2shSig = await signBIP322P2SH_P2WPKH(message, privateKey);

      // Each signature should only verify with its own address type
      expect(await verifyBIP322Signature(message, p2pkhSig, p2pkh.address!)).toBe(true);
      expect(await verifyBIP322Signature(message, p2pkhSig, p2wpkh.address!)).toBe(false);
      expect(await verifyBIP322Signature(message, p2pkhSig, p2sh.address!)).toBe(false);

      expect(await verifyBIP322Signature(message, p2wpkhSig, p2wpkh.address!)).toBe(true);
      expect(await verifyBIP322Signature(message, p2wpkhSig, p2pkh.address!)).toBe(false);
      expect(await verifyBIP322Signature(message, p2wpkhSig, p2sh.address!)).toBe(false);

      expect(await verifyBIP322Signature(message, p2shSig, p2sh.address!)).toBe(true);
      expect(await verifyBIP322Signature(message, p2shSig, p2pkh.address!)).toBe(false);
      expect(await verifyBIP322Signature(message, p2shSig, p2wpkh.address!)).toBe(false);

      console.log('✓ Cross-address-type verification tests passed');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle invalid signatures gracefully', async () => {
      const address = 'bc1q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0l';

      // Invalid base64
      expect(await verifyBIP322Signature('test', 'not-valid-base64!@#', address)).toBe(false);

      // Empty signature
      expect(await verifyBIP322Signature('test', '', address)).toBe(false);

      // Truncated signature
      expect(await verifyBIP322Signature('test', 'AAAA', address)).toBe(false);

      // Wrong format for Taproot
      expect(await verifyBIP322Signature('test', 'tr:invalid', 'bc1p...')).toBe(false);
    });

    it('should handle invalid addresses gracefully', async () => {
      const validSignature = 'AkcwRAIgZRfIY3p7/DoVTty6YZbWS71bc5Vct9p9Fia83eRmw2QCICK/ENGfwLtptFluMGs2KsqoNSk89pO7F29zJLUx9a/sASECx/EgAxlkQpQ9hYjgGu6EBCPMVPwVIVJqO5XyRMZwLpM=';

      // Invalid address format
      expect(await verifyBIP322Signature('test', validSignature, 'invalid-address')).toBe(false);

      // Empty address
      expect(await verifyBIP322Signature('test', validSignature, '')).toBe(false);

      // Wrong network address
      expect(await verifyBIP322Signature('test', validSignature, 'tb1q...')).toBe(false);
    });
  });
});