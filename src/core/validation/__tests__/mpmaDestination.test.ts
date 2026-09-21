/**
 * Which destinations an MPMA send can actually reach.
 *
 * The rule is core's: a destination whose PACKED form exceeds 22 bytes is refused
 * (`messages/versions/mpma.py`). Packing is one version byte plus the payload, so the question is
 * only how big the payload is — 20-byte witness programs and base58 hashes fit, 32-byte witness
 * programs do not.
 *
 * The trap this guards is testing the prefix instead of the size. P2WSH is a `bc1q` address and
 * fails for exactly the same reason as `bc1p`; a check that looked for taproot would pass it
 * through and then fail at compose, which is the failure this whole check exists to move earlier.
 */
import { describe, expect, it } from 'vitest';
import { isMpmaEncodable } from '../mpmaDestination';

describe('isMpmaEncodable', () => {
  it('accepts base58 addresses, which pack to 21 bytes', () => {
    // P2PKH and P2SH: one version byte plus a 20-byte hash.
    expect(isMpmaEncodable('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe(true);
    expect(isMpmaEncodable('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toBe(true);
  });

  it('accepts P2WPKH, whose witness program is 20 bytes', () => {
    expect(isMpmaEncodable('bc1qz8y760738dcuv6g3jf6sa5tdcmzddneh2u220w')).toBe(true);
  });

  it('refuses Taproot', () => {
    // 32-byte program: packs to 33, past the 22-byte ceiling.
    expect(
      isMpmaEncodable('bc1p3vl9hmdetkyde2qj2e2n9rw8zqrygsyclprfc3xnyku6sjczpsxqv068cg'),
    ).toBe(false);
  });

  it('refuses P2WSH even though it starts bc1q', () => {
    // The reason this is measured and not pattern-matched. Same 32-byte program as Taproot, same
    // rejection by core, but a prefix check would wave it through.
    expect(
      isMpmaEncodable('bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3'),
    ).toBe(false);
  });

  it('applies the same rule off mainnet', () => {
    // Testnet and regtest differ only in the human-readable part; the program length is what
    // decides, so a testnet P2WPKH is fine and a testnet P2TR is not.
    expect(isMpmaEncodable('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx')).toBe(true);
    expect(
      isMpmaEncodable('tb1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0'),
    ).toBe(false);
  });

  it('refuses a bech32 string with no data to measure', () => {
    // Not a valid address; the caller checksums separately. This only has to avoid claiming
    // something encodable when it cannot even find a program length.
    expect(isMpmaEncodable('bc1')).toBe(false);
    expect(isMpmaEncodable('bc1q')).toBe(false);
  });
});
