/**
 * Which payments to script addresses the caution names, and when.
 *
 * Pure: the scripts, the owned addresses and the payer's holding decide everything.
 */

import { describe, expect, it } from 'vitest';
import { isScriptAddressOutput, scriptPaymentCandidates, scriptPaymentRisk } from '@/core/bitcoin/scriptPaymentRisk';

const PAYER = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const TAPROOT = 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr';
const KEYHASH = 'bc1qglv8hh3l23y0qu5uw4zu7e8q4td0gcjsa8f3tq';
const P2TR_SCRIPT = `5120${'11'.repeat(32)}`;
const P2WPKH_SCRIPT = `0014${'11'.repeat(20)}`;

describe('isScriptAddressOutput', () => {
  it.each([
    ['P2TR', P2TR_SCRIPT, true],
    ['P2WSH', `0020${'11'.repeat(32)}`, true],
    ['P2SH', `a914${'11'.repeat(20)}87`, true],
    ['a future witness version', `5210${'11'.repeat(16)}`, true],
    ['P2WPKH', P2WPKH_SCRIPT, false],
    ['P2PKH', `76a914${'11'.repeat(20)}88ac`, false],
    ['OP_RETURN', '6a0474657374', false],
    ['nothing', undefined, false],
  ])('%s', (_label, script, expected) => {
    expect(isScriptAddressOutput(script)).toBe(expected);
  });
});

describe('scriptPaymentRisk', () => {
  const payment = {
    outputs: [
      { value: 600, address: TAPROOT, script: P2TR_SCRIPT, type: 'p2tr' },
      { value: 1_000, address: KEYHASH, script: P2WPKH_SCRIPT, type: 'p2wpkh' },
      { value: 50_000, address: PAYER, script: P2WPKH_SCRIPT, type: 'p2wpkh' },
    ],
    payerAddress: PAYER,
    ownedAddresses: [PAYER],
  };

  it('names the script outputs, their total and the exposed payer when the payer holds assets', () => {
    expect(scriptPaymentRisk(payment, true)).toEqual({ totalSats: 600, addresses: [TAPROOT], source: PAYER });
  });

  it('is silent when the payer holds nothing', () => {
    expect(scriptPaymentCandidates(payment)).toHaveLength(1);
    expect(scriptPaymentRisk(payment, false)).toBeNull();
  });

  it('has no candidates when the payer is not the wallet', () => {
    expect(scriptPaymentCandidates({ ...payment, payerAddress: KEYHASH })).toEqual([]);
  });

  it('skips an output already proved, and one the wallet owns', () => {
    expect(scriptPaymentCandidates({ ...payment, provenAddresses: [TAPROOT] })).toEqual([]);
    expect(scriptPaymentCandidates({ ...payment, ownedAddresses: [PAYER, TAPROOT] })).toEqual([]);
  });
});
