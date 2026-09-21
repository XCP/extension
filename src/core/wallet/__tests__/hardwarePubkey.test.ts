/**
 * Whether the key derived from an account xpub is the key for that address.
 *
 * This is the test that matters, because a wrong key still composes. The account key goes into
 * the third slot of every multisig data output so the dust can be swept afterwards; a key for the
 * wrong address makes that dust unspendable by anyone, and nothing about the transaction looks
 * wrong at the time.
 *
 * So nothing here is asserted against a hardcoded string I could have derived the same wrong way
 * twice. Every expectation comes from walking the FULL path from a master seed — the independent
 * route, the one the software wallet already uses — and the claim under test is that starting from
 * a serialized account key and walking only the tail arrives at the same point.
 */

import { bytesToHex } from '@noble/hashes/utils.js';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { describe, expect, it } from 'vitest';
import { derivePubkeyFromAccountKey } from '../hardwarePubkey';

/** BIP39's own test vector, so the seed is not something I invented either. */
const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const MASTER = HDKey.fromMasterSeed(mnemonicToSeedSync(MNEMONIC));

const ZPUB = { private: 0x04b2430c, public: 0x04b24746 };
const YPUB = { private: 0x049d7878, public: 0x049d7cb2 };

/** The answer, reached the long way: master → full path. */
function truth(path: string): string {
  const node = MASTER.derive(path);
  if (!node.publicKey) throw new Error('no public key');
  return bytesToHex(node.publicKey);
}

describe('derivePubkeyFromAccountKey', () => {
  it('lands on the same key as deriving the full path from the seed', () => {
    // Native segwit, the Trezor default and the account whose zpub appeared in the bug report.
    const account = MASTER.derive("m/84'/0'/0'");
    expect(derivePubkeyFromAccountKey(account.publicExtendedKey, "m/84'/0'/0'/0/0")).toBe(
      truth("m/84'/0'/0'/0/0"),
    );
  });

  it('walks the tail, not the whole path, whatever the address index', () => {
    // The relative-path arithmetic is the part that can silently be off by a level. Several
    // indices, so an implementation that ignored the index entirely would still be caught.
    const account = HDKey.fromExtendedKey(MASTER.derive("m/84'/0'/0'").publicExtendedKey);
    for (const index of [0, 1, 5, 137]) {
      const path = `m/84'/0'/0'/0/${index}`;
      expect(derivePubkeyFromAccountKey(account.publicExtendedKey, path)).toBe(truth(path));
    }
  });

  it('follows the change chain as readily as the receive chain', () => {
    const account = HDKey.fromExtendedKey(MASTER.derive("m/84'/0'/0'").publicExtendedKey);
    const path = "m/84'/0'/0'/1/3";
    expect(derivePubkeyFromAccountKey(account.publicExtendedKey, path)).toBe(truth(path));
  });

  it('reads a zpub, which is the same key wearing a different prefix', () => {
    // SLIP-132 prefixes describe intended script type, not key material. Serialized from the
    // same seed with zpub versions, the account must derive exactly what the xpub form does --
    // and this is the form Trezor actually hands over, so it is the one that has to work.
    const zpub = HDKey.fromMasterSeed(mnemonicToSeedSync(MNEMONIC), ZPUB).derive(
      "m/84'/0'/0'",
    ).publicExtendedKey;
    expect(zpub.startsWith('zpub')).toBe(true);
    expect(derivePubkeyFromAccountKey(zpub, "m/84'/0'/0'/0/0")).toBe(truth("m/84'/0'/0'/0/0"));
  });

  it('handles a nested-segwit account at the same depth', () => {
    const path = "m/49'/0'/0'/0/2";
    // ypub form too, since nested segwit is what a 49' account serializes as.
    const ypub = HDKey.fromMasterSeed(mnemonicToSeedSync(MNEMONIC), YPUB).derive(
      "m/49'/0'/0'",
    ).publicExtendedKey;
    expect(ypub.startsWith('ypub')).toBe(true);
    expect(derivePubkeyFromAccountKey(ypub, path)).toBe(truth(path));
  });

  it('accepts h as well as apostrophe for hardened components', () => {
    // Trezor serializes paths with h in places. The hardened parts are above the account and are
    // never walked here, but they still have to be COUNTED correctly to find the tail.
    const account = HDKey.fromExtendedKey(MASTER.derive("m/84'/0'/0'").publicExtendedKey);
    expect(derivePubkeyFromAccountKey(account.publicExtendedKey, 'm/84h/0h/0h/0/4')).toBe(
      truth("m/84'/0'/0'/0/4"),
    );
  });

  it('refuses rather than guessing when the pieces do not line up', () => {
    const account = HDKey.fromExtendedKey(MASTER.derive("m/84'/0'/0'").publicExtendedKey).publicExtendedKey;
    // A path that stops at the account itself has no tail to walk, but also no address.
    expect(derivePubkeyFromAccountKey(account, "m/84'/0'")).toBeNull();
    // A hardened step below the account: a public key genuinely cannot do this.
    expect(derivePubkeyFromAccountKey(account, "m/84'/0'/0'/0'/0")).toBeNull();
    // Not an extended key at all.
    expect(derivePubkeyFromAccountKey('not-a-key', "m/84'/0'/0'/0/0")).toBeNull();
    expect(derivePubkeyFromAccountKey('', "m/84'/0'/0'/0/0")).toBeNull();
    // A compressed pubkey is not an account key, however key-shaped it looks.
    expect(
      derivePubkeyFromAccountKey(
        '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
        "m/84'/0'/0'/0/0",
      ),
    ).toBeNull();
    // A path that does not parse.
    expect(derivePubkeyFromAccountKey(account, 'm/84/x/0/0')).toBeNull();
  });

  it('returns a compressed key, which is what core validates', () => {
    const account = HDKey.fromExtendedKey(MASTER.derive("m/84'/0'/0'").publicExtendedKey);
    const key = derivePubkeyFromAccountKey(account.publicExtendedKey, "m/84'/0'/0'/0/0");
    expect(key).toMatch(/^0[23][0-9a-f]{64}$/);
  });
});
