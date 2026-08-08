/**
 * Wallet Test Fixtures
 * Test signatures from various wallet implementations to ensure cross-platform compatibility
 *
 * Reference material, kept as documentation rather than as tests. It used to
 * live in it() blocks that only console.log-ed it, which inflated the passing
 * count with five checks that asserted nothing.
 *
 * What each wallet does:
 * - Our extension: signs BIP-322 only; verifies BIP-322, BIP-137 (loose and
 *   strict) and legacy, for P2PKH, P2WPKH, P2SH-P2WPKH and P2TR.
 * - Bitcore: BIP-137/legacy. P2PKH verifies; P2TR unsupported.
 * - FreeWallet: BIP-137, plus a BIP-322 form over legacy addresses that is not
 *   spec-conformant and no longer verifies here. See the block below - whether
 *   to accept it deliberately is an open question, not a closed one.
 * - Electrum: BIP-137. Flags 27-30 uncompressed, 31-34 compressed, 35-42 SegWit.
 * - Bitcoin Core: strict BIP-137, correct flags per address type, and does not
 *   sign P2TR with BIP-137 at all.
 * - Ledger/Sparrow: BIP-137 including for Taproot, so P2TR needs loose verification.
 * - Trezor: BIP-137 for all address types; Taproot is firmware dependent.
 *
 * Known gaps, unchanged by this file:
 * - Testnet addresses are not supported alongside mainnet.
 * - P2SH multisig and P2WSH are not supported; that would need full script
 *   evaluation.
 *
 * Wallets with no fixtures yet (Electrum, Bitcoin Core, Trezor) simply have no
 * tests here. An empty it() that prints their expected format is not coverage.
 *
 * One former fixture is deliberately gone. It paired address
 * 1HnhWpkMHMjgt167kvgcPyurMmsCQ2WPgg with a "Hello World" signature, and no
 * key can satisfy that pair: recovering the signature over that message across
 * every recovery id, in both point encodings, and deriving P2PKH, P2WPKH and
 * P2SH-P2WPKH from each, never produces that address. The signature itself is
 * sound - it recovers to 1QDZfWJTVXqHFmJFRkyrnidvHyPyG5bynY - so the fixture
 * was a real signature filed under the wrong address. Correcting it to the
 * address we derived ourselves would only assert that our recovery agrees with
 * our recovery, which is why it was dropped rather than patched.
 */

import { describe, expect, it } from 'vitest';
import { verifyLooseBIP137, verifyMessage, verifyMessageWithMethod } from '../messageVerifier';

describe('Wallet Implementation Test Fixtures', () => {
  describe('Bitcore/FreeWallet Fixtures', () => {
    // From https://github.com/bitpay/bitcore-message
    const bitcoreFixtures = [
      {
        address: '1F3sAm6ZtwLAUnj7d38pGFxtP3RVEvtsbV',
        message: 'This is an example of a signed message.',
        signature: 'H9L5yLFjti0QTHhPyFrZCT1V/MMnBtXKmoiKDZ78NDBjERki6ZTQZdSMCtkgoNmp17By9ItJr8o7ChX0XxY91nk=',
        wallet: 'bitcore',
        expected: true
      }
    ];

    for (const fixture of bitcoreFixtures) {
      it(`should verify ${fixture.wallet} signature for ${fixture.address}`, async () => {
        const result = await verifyMessageWithMethod(
          fixture.message,
          fixture.signature,
          fixture.address
        );

        // This used to read `result.valid || typeof result.valid === 'boolean'`,
        // which is true for any boolean and so could never fail.
        expect(result.valid).toBe(fixture.expected);
      });
    }
  });

  /**
   * A real FreeWallet BIP-322 signature over a legacy address. It used to be asserted valid here.
   * It no longer verifies, and that is a deliberate, user-visible compatibility break.
   *
   * FreeWallet's BIP-322 signing is not spec-conformant. This signature verifies under exactly one
   * configuration, and only when *both* of the following hold at once — either alone rejects it:
   *
   *   1. `to_sign`'s prevout hash is byte-reversed, i.e. the displayed txid rather than the natural
   *      double-SHA256 the serialization calls for.
   *   2. The signed digest is `sha256(sighash)` rather than the sighash — `@noble/secp256k1` v3
   *      defaults to `prehash: true`, and the old code took that default.
   *
   * So it commits to a triple hash of the preimage. This extension used to accept it only because
   * it carried the identical pair of defects; the two implementations agreed with each other and
   * with nothing else. Fixing ours to match BIP-322 necessarily stops accepting FreeWallet's.
   *
   * **This is a live question, not a settled one.** People are asked to sign with FreeWallet, so
   * signatures in this shape exist in the wild and users will present them. Whether to add a
   * deliberate, clearly-labelled compatibility path for them is a policy call about what the
   * verifier is willing to call valid — it is not something to restore by accident, which is why
   * the fixture stays here asserting rejection rather than being deleted. If that path is ever
   * added it must report itself as non-standard, and must not widen which *key* is accepted.
   *
   * The fixture also earns its keep as a negative control: it is the only artifact of the old
   * sighash we have, so it goes green again if both defects are ever reintroduced together.
   * Conformant external coverage lives in `bip322-standardness.test.ts`, against BIP-322's own
   * published vectors. Note BIP-322 does not define simple-format signatures for legacy addresses
   * at all — it directs those to the legacy format — so there is no spec vector to check this
   * against either way.
   */
  describe('FreeWallet legacy BIP-322 fixture (non-conformant)', () => {
    const fixture = {
      address: '19QWXpMXeLkoEKEJv2xo9rn8wkPCyxACSX',
      message: 'Hello World',
      signature:
        'AkgwRQIhAKwLGWnYM9idetpSZLcZ3AQyycuyxuBUUYi1jr2+HozyAiB42v9dg03JyrEDJzRrGbmXMNlM+NJM1dLHBwU1WaNzVwEhAy7800wgcNj8nqpNtZnrdyxygC5U1XWnsFpLK+/B9+dv'
    };

    it('rejects it, because it commits to a non-conformant sighash', async () => {
      const result = await verifyMessageWithMethod(
        fixture.message,
        fixture.signature,
        fixture.address
      );

      expect(result.valid).toBe(false);
    });

    it('rejects it against a different message', async () => {
      const result = await verifyMessageWithMethod(
        'Goodbye World',
        fixture.signature,
        fixture.address
      );

      expect(result.valid).toBe(false);
    });

    it('rejects it against a different address', async () => {
      const result = await verifyMessageWithMethod(
        fixture.message,
        fixture.signature,
        '1F3sAm6ZtwLAUnj7d38pGFxtP3RVEvtsbV'
      );

      expect(result.valid).toBe(false);
    });
  });

  describe('Ledger/Sparrow Fixtures', () => {
    // From bip322-js issue #1. One signature, one key, two address encodings:
    // Ledger and Sparrow sign Taproot addresses with BIP-137, which the spec
    // does not cover, so P2TR only verifies through loose verification.
    const fixture = {
      taprootAddress: 'bc1ps5pt865e77nr9t9z7fdefryx27lsz0ced875lxcc68lszvc7x3qsxx25fy',
      p2pkhAddress: '19C7EwHP5FN32YPrMRfW7mkFKg3FYwyAzr',
      message: 'bitcheckdiuq5gh179v9r5vwmw58ijtkea1vb4idr92khiu',
      signature: 'HxOxevYmNjW58m/TBcewrpLbOC0NXjwnWO+jccW9tq8JbdtjI8modbmYbJNVO6PpE9MATfiZeU/S/GbmozNhV4Y=',
      wallet: 'Ledger/Sparrow'
    };

    it(`should verify ${fixture.wallet} signatures against the P2PKH form of the key`, async () => {
      const result = await verifyMessage(
        fixture.message,
        fixture.signature,
        fixture.p2pkhAddress
      );

      expect(result.valid).toBe(true);
    });

    it(`should verify ${fixture.wallet} Taproot signatures only loosely`, async () => {
      const loose = await verifyLooseBIP137(
        fixture.message,
        fixture.signature,
        fixture.taprootAddress
      );

      expect(loose.valid).toBe(true);
    });
  });
});
