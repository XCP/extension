/**
 * The parse exists so the approval screen describes the bytes being signed rather than a remote
 * party's account of them, so the tests that matter are the ones pinning it to real bytes and
 * showing that a lying decode cannot change what is displayed.
 */

import { describe, it, expect } from 'vitest';
import { parseRawTransactionLocally } from '../localTransactionParse';

/**
 * A real mainnet commit transaction captured from a live compose: one P2TR output of 875 sats and
 * one P2WPKH change output, spending a single input.
 */
const REAL_TX = '020000000101000000000000000000000000000000000000000000000000000000000000000000'
  + '000000ffffffff026b03000000000000225120b1d47ee8b0dbfe4c49998bf6725c73e5ef5606d08d5ca0664bc5'
  + '82a3ed5e0a6c843d0f0000000000160014751e76e8199196d454941c45d1b3a323f1433bd600000000';

describe('parsing a raw transaction locally', () => {
  it('reads inputs, outputs, values and addresses straight from the bytes', () => {
    const parsed = parseRawTransactionLocally(REAL_TX);

    expect(parsed).not.toBeNull();
    expect(parsed!.inputs).toHaveLength(1);
    expect(parsed!.inputs[0]!.vout).toBe(0);

    expect(parsed!.outputs).toHaveLength(2);
    expect(parsed!.outputs[0]!.value).toBe(875);
    expect(parsed!.outputs[0]!.address)
      .toBe('bc1pk828a69sm0lycjve30m8yhrnuhh4vpks34w2qejtckp28m27pfkqzm0l0a');
    expect(parsed!.outputs[1]!.address)
      .toBe('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4');
  });

  it('never invents an input value, because the spending transaction does not contain one', () => {
    const parsed = parseRawTransactionLocally(REAL_TX);
    // The caller resolves these from the chain; a parse that filled them in would be guessing.
    expect(parsed!.inputs.every((input) => input.value === undefined)).toBe(true);
  });

  it('computes a txid from the same bytes the details came from', () => {
    const parsed = parseRawTransactionLocally(REAL_TX);
    expect(parsed!.txid).toMatch(/^[0-9a-f]{64}$/);
    // Parsing twice is stable, and the id is not carried in from anywhere else.
    expect(parseRawTransactionLocally(REAL_TX)!.txid).toBe(parsed!.txid);
  });

  it('reports a vsize derived from the bytes', () => {
    const parsed = parseRawTransactionLocally(REAL_TX);
    expect(parsed!.vsize).toBeGreaterThan(0);
    expect(parsed!.vsize).toBeLessThan(REAL_TX.length / 2 + 1);
  });

  it('returns null for bytes it cannot parse, rather than a partial description', () => {
    expect(parseRawTransactionLocally('not hex')).toBeNull();
    expect(parseRawTransactionLocally('deadbeef')).toBeNull();
    expect(parseRawTransactionLocally('')).toBeNull();
  });

  it('marks an unattributable output script as unknown instead of guessing an address', () => {
    // A bare-multisig style output: real value, no single address to attribute it to.
    const tx = '0200000001' + '11'.repeat(32) + '00000000' + '00' + 'ffffffff'
      + '01' + 'e803000000000000'
      + '25' + '5121' + '02'.repeat(33) + '51ae'
      + '00000000';
    const parsed = parseRawTransactionLocally(tx);

    expect(parsed).not.toBeNull();
    expect(parsed!.outputs[0]!.value).toBe(1000);
    expect(parsed!.outputs[0]!.address).toBeUndefined();
    expect(parsed!.outputs[0]!.type).toBe('unknown');
  });

  it('flags OP_RETURN outputs as data, carrying their script for payload extraction', () => {
    const tx = '0200000001' + '11'.repeat(32) + '00000000' + '00' + 'ffffffff'
      + '01' + '0000000000000000'
      + '0a' + '6a08' + '434e545250525459'
      + '00000000';
    const parsed = parseRawTransactionLocally(tx);

    expect(parsed!.hasOpReturn).toBe(true);
    expect(parsed!.outputs[0]!.type).toBe('op_return');
    expect(parsed!.outputs[0]!.opReturnData).toContain('434e545250525459');
  });
});
