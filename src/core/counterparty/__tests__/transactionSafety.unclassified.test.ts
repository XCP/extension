import { describe, expect, it } from 'vitest';
import { analyzeTransactionSafety } from '@/core/counterparty/transactionSafety';

/**
 * The second root cause named in GHSA-hghm-pm6h-67gp, kept as a regression test.
 *
 * Every classification in analyzeTransactionSafety hangs off `if (messageType)`. In 0.6.0 an
 * undefined type skipped all of it — including the "unknown type" warning that would have been the
 * natural fallback — so a transaction the wallet could not read rendered exactly like one it had
 * read and found safe. Combined with the payload extractor only inspecting OP_RETURN, a sweep in
 * another encoding reached the approval screen with no block and no warning at all.
 *
 * The extractor now covers bare multisig too, so such a sweep classifies and the block fires. This
 * pins the other half: when a payload genuinely cannot be read, the screen must say so rather than
 * present the transaction as ordinary.
 */
const payment = { index: 1, value: 30000, type: 'p2pkh' as const, address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' };

describe('a transaction whose payload could not be classified', () => {
  // Each of these is a shape a data-carrying output takes across the PSBT decoder's vocabulary and
  // the node's scriptPubKey types.
  it.each([
    ['op_return', 'an OP_RETURN that did not decrypt to a Counterparty message'],
    ['unknown', 'bare multisig, as the PSBT decoder reports it'],
    ['multisig', 'bare multisig, as a node reports it'],
    ['nonstandard', 'a script the node could not categorise'],
  ])('warns when the outputs include a %s output (%s)', (type) => {
    const safety = analyzeTransactionSafety(
      undefined,
      [{ index: 0, value: 546, type }, payment] as never,
      []
    );

    expect(safety.warnings.map((w) => w.title)).toContain('Unrecognized Transaction');
  });

  it('does not warn about an ordinary transfer that carries no data outputs', () => {
    const safety = analyzeTransactionSafety(undefined, [payment] as never, []);

    expect(safety.warnings.map((w) => w.title)).not.toContain('Unrecognized Transaction');
  });

  // The warning is the fallback, not a replacement: a payload that does classify as a sweep must
  // still be blocked outright rather than merely flagged.
  it('still blocks a sweep once the payload is classified', () => {
    const safety = analyzeTransactionSafety('sweep', [payment] as never, []);

    expect(safety.blocked).toBe(true);
    expect(safety.warnings.map((w) => w.severity)).toContain('block');
  });
});
