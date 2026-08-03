/**
 * Approval-screen accounting under mixed sighash arrays.
 *
 * `sighashTypes` is validated element-by-element, so a request may legally mix
 * values. An input signed SIGHASH_ALL constrains only transactions that still
 * contain it; whoever holds the PSBT can drop that input, discard its signature
 * with it, and rebuild around a SINGLE|ANYONECANPAY input. Outputs the surviving
 * signature does not cover are therefore redirectable and must be priced as at
 * risk, not as change.
 */

import { describe, it, expect } from 'vitest';
import { committedOutputIndices } from '@/utils/blockchain/bitcoin/psbt';
import { computeMoneyMovement } from './money-movement';

const ALL = 0x01;
const ALL_ACP = 0x81;
const SINGLE_ACP = 0x83;

const MINE = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

/**
 * A marketplace-shaped request: a small input signed ALL, a large input signed
 * SINGLE|ANYONECANPAY, and a large final output presented as change.
 */
function movementFor(sighashTypes: number[]) {
  const committedOutputs = committedOutputIndices(
    sighashTypes.map((type, index) => ({ index, sighashType: type })),
    3
  );

  return {
    committedOutputs,
    movement: computeMoneyMovement({
      inputs: [
        { address: MINE, value: 1_000_000 },
        { address: MINE, value: 100_000_000 },
      ],
      outputs: [
        { address: MINE, value: 990_000 },
        { address: MINE, value: 546 },
        { address: MINE, value: 99_999_454 },
      ],
      myAddresses: [MINE],
      fee: 10_000,
      committedOutputs,
    }),
  };
}

describe('at-risk accounting with a mixed sighash array', () => {
  it('prices outputs the surviving signature leaves free as at risk', () => {
    const { committedOutputs, movement } = movementFor([ALL, SINGLE_ACP]);

    // Only the output sharing the SINGLE input's index is covered.
    expect(committedOutputs).toEqual(new Set([1]));
    expect(movement.atRisk).toBe(990_000 + 99_999_454);
    expect(movement.backToYou).toBe(546);
  });

  it('prices an ALL|ANYONECANPAY input the same way, since it can also be dropped', () => {
    const { committedOutputs, movement } = movementFor([ALL_ACP, SINGLE_ACP]);

    expect(committedOutputs).toEqual(new Set([1]));
    expect(movement.atRisk).toBe(990_000 + 99_999_454);
  });

  it('guarantees nothing when two SINGLE|ANYONECANPAY inputs cover different outputs', () => {
    const { committedOutputs, movement } = movementFor([SINGLE_ACP, SINGLE_ACP]);

    // Keeping either input alone honours only that input's output, so neither is assured.
    expect(committedOutputs).toEqual(new Set());
    expect(movement.atRisk).toBe(990_000 + 546 + 99_999_454);
    expect(movement.backToYou).toBe(0);
  });

  it('does not report less exposure once an ALL input is added', () => {
    const { movement: mixed } = movementFor([ALL, SINGLE_ACP]);
    const { movement: uniform } = movementFor([SINGLE_ACP, SINGLE_ACP]);

    expect(mixed.atRisk).toBeLessThanOrEqual(uniform.atRisk);
    expect(mixed.atRisk).toBeGreaterThan(0);
  });

  it('still treats a fully committed request as change, not risk', () => {
    const { committedOutputs, movement } = movementFor([ALL, ALL]);

    expect(committedOutputs).toBeNull();
    expect(movement.atRisk).toBe(0);
    expect(movement.backToYou).toBe(990_000 + 546 + 99_999_454);
  });
});
