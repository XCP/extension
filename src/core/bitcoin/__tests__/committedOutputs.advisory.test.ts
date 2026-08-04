import { SigHash } from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import { committedOutputIndices } from '@/core/bitcoin/psbt';

/**
 * The scenario from GHSA-xchm-466g-93cw, kept as a regression test.
 *
 * The reported bypass was that any SIGHASH_ALL input made the function return null — "every output
 * is committed" — which absorbed a SINGLE|ANYONECANPAY input signed in the same PSBT and put the
 * at-risk figure back to zero.
 *
 * The argument that makes it a real bypass, and the one the current implementation encodes: a
 * signature only binds transactions containing its own input. ANYONECANPAY exists so that its input
 * can be lifted into a different transaction. Whoever holds the PSBT drops the ALL-signed input
 * along with its signature and rebuilds around the detachable one, so the ALL signature never has
 * to be satisfied — the transaction no longer contains the input it belongs to.
 */
describe('GHSA-xchm-466g-93cw — an ALL input must not absorb a detachable one', () => {
  // input 0: victim, SIGHASH_ALL, present only to poison the verdict
  // input 1: victim, SINGLE|ANYONECANPAY, the one that can be lifted out
  // outputs: 0 change, 1 the dust the SINGLE input commits to, 2 the ~1 BTC presented as change
  const reported = [
    { index: 0, sighashType: SigHash.ALL },
    { index: 1, sighashType: SigHash.SINGLE_ANYONECANPAY },
  ];

  it('does not report every output as committed', () => {
    // null would mean "nothing is at risk", which is the bypass.
    expect(committedOutputIndices(reported, 3)).not.toBeNull();
  });

  it('commits only to the output the detachable input covers on its own', () => {
    const committed = committedOutputIndices(reported, 3);
    expect([...committed!]).toEqual([1]);
  });

  it('leaves the large output outside the committed set, so it counts as at risk', () => {
    const committed = committedOutputIndices(reported, 3);
    expect(committed!.has(2)).toBe(false);
  });

  // The advisory notes 0x81 masks to 0x01 under & 0x1f, so it took the same early return.
  it('treats ALL|ANYONECANPAY as detachable rather than as a plain ALL', () => {
    const committed = committedOutputIndices(
      [
        { index: 0, sighashType: SigHash.ALL_ANYONECANPAY },
        { index: 1, sighashType: SigHash.SINGLE_ANYONECANPAY },
      ],
      3
    );
    // ALL|ANYONECANPAY covers every output, so it constrains nothing; only the SINGLE one does.
    expect([...committed!]).toEqual([1]);
  });

  // The cases that must keep returning null, so the fix cannot have been a blanket change.
  it('still reports everything committed when nothing is detachable', () => {
    expect(committedOutputIndices([{ index: 0, sighashType: SigHash.ALL }], 3)).toBeNull();
  });

  it('still reports everything committed when every detachable input covers all outputs', () => {
    expect(
      committedOutputIndices([{ index: 0, sighashType: SigHash.ALL_ANYONECANPAY }], 3)
    ).toBeNull();
  });
});
