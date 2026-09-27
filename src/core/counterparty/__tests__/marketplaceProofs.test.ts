/**
 * The checks every marketplace analyzer shares (`marketplace/proofs.ts`), pinned on their own.
 *
 * Each analyzer's tests change one fact of a transaction and expect a block, but in a fixed-shape
 * transaction one changed value usually trips several proofs at once. Mutation testing showed the
 * shared helpers could lose a comparison or a whole check without any analyzer test noticing, so
 * their contracts are stated here directly.
 */

import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { p2tr } from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import {
  blockOnLedger,
  ledgerBlockKind,
  newProofLog,
  proveActualFee,
  proveKeyPathFeeOutput,
  signsExactly,
} from '@/core/counterparty/marketplace/proofs';

describe('proveActualFee', () => {
  const messages = { unauthenticated: 'values unknown', differs: 'fee differs' };
  const outputs = (...values: number[]) => values.map(value => ({ value }));

  it('passes a fee that is exactly the claim', () => {
    const log = newProofLog();
    proveActualFee(log, [10_000, 5_000], outputs(14_000), 1_000, messages);
    expect(log).toMatchObject({ blockers: [], retry: [] });
  });

  it.each([
    ['more than the claim', [10_000, 5_000], outputs(13_999), 1_000],
    ['less than the claim', [10_000, 5_000], outputs(14_001), 1_000],
    ['negative, even when the claim says so', [10_000], outputs(10_100), -100],
    ['incomputable: the outputs overflow', [Number.MAX_SAFE_INTEGER], outputs(Number.MAX_SAFE_INTEGER, 1), Number.MAX_SAFE_INTEGER],
    ['incomputable: the inputs overflow', [Number.MAX_SAFE_INTEGER, 1], outputs(0), 0],
  ])('blocks a fee %s', (_label, inputs, outs, claimed) => {
    const log = newProofLog();
    proveActualFee(log, inputs, outs, claimed, messages);
    expect(log).toMatchObject({ blockers: ['fee differs'], retry: [] });
  });

  it('asks for a retry when an input value is unknown, and only says so when told how', () => {
    const log = newProofLog();
    proveActualFee(log, [10_000, undefined], outputs(9_000), 1_000, messages);
    expect(log).toMatchObject({ blockers: [], retry: ['values unknown'] });
    const quiet = newProofLog();
    proveActualFee(quiet, [10_000, undefined], outputs(9_000), 1_000, { differs: 'fee differs' });
    expect(quiet).toMatchObject({ blockers: [], retry: [] });
  });
});

describe('signsExactly', () => {
  it('accepts the expected inputs in any order', () => {
    expect(signsExactly([{ index: 1, sighashType: 1 }, { index: 0, sighashType: 1 }], [0, 1], [1])).toBe(true);
  });

  it.each([
    ['one input fewer', [{ index: 0, sighashType: 1 }], [0, 1]],
    ['one input more', [{ index: 0, sighashType: 1 }, { index: 1, sighashType: 1 }], [0]],
    ['another input', [{ index: 1, sighashType: 1 }], [0]],
    ['another sighash', [{ index: 0, sighashType: 0x81 }], [0]],
  ])('refuses %s', (_label, signed, expected) => {
    expect(signsExactly(signed, expected, [1])).toBe(false);
  });
});

describe('ledgerBlockKind', () => {
  it('calls a block the ledger\'s only when every blocker is the ledger disagreeing', () => {
    const log = newProofLog();
    blockOnLedger(log, 'asset differs');
    expect(ledgerBlockKind(log.blockers, log.ledger)).toEqual({ blockKind: 'ledger' });
    log.blockers.push('output differs');
    expect(ledgerBlockKind(log.blockers, log.ledger)).toEqual({});
  });

  it('marks nothing when nothing blocks', () => {
    expect(ledgerBlockKind([], new Set())).toEqual({});
  });
});

describe('proveKeyPathFeeOutput', () => {
  const FEE_KEY = bytesToHex(getPublicKey(new Uint8Array(32).fill(3), true).slice(1));
  const payment = p2tr(hexToBytes(FEE_KEY));

  it('blocks a declared key that is not a curve point, even when the output carries no script', () => {
    const log = newProofLog();
    const output = { index: 2, type: 'p2tr', address: payment.address!, value: 1_000 };
    expect(proveKeyPathFeeOutput(log, output, 'ff'.repeat(32))).toBeNull();
    expect(log.blockers).toHaveLength(1);
  });
});
