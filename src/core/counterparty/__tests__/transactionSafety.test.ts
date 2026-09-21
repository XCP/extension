/**
 * Tests for transaction safety analysis
 */

import { describe, expect, it } from 'vitest';
import {
  type AnalyzableOutput,
  analyzeTransactionSafety,
} from '../transactionSafety';

const SIGNER = '1MySignerAddressXXXXXXXXXXXXXXabc123';

function makeOutputs(...specs: Array<{ value: number; address?: string; type?: string }>): AnalyzableOutput[] {
  return specs.map(s => ({
    value: s.value,
    address: s.address,
    type: s.type || 'witness_v1_taproot',
  }));
}

// ── Message type safety ──────────────────────────────────────────────

describe('message type safety', () => {
  const normalOutputs = makeOutputs(
    { value: 0, type: 'op_return' },
    { value: 49000, address: SIGNER },
  );

  it('should block sweep transactions', () => {
    const result = analyzeTransactionSafety('sweep', normalOutputs, SIGNER);
    expect(result.blocked).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.severity).toBe('block');
    expect(result.warnings[0]!.title).toContain('Sweep');
  });

  it('should warn about destroy transactions', () => {
    const result = analyzeTransactionSafety('destroy', normalOutputs, SIGNER);
    expect(result.blocked).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.severity).toBe('danger');
    expect(result.warnings[0]!.title).toContain('Destruction');
  });

  it('should allow enhanced_send without warnings', () => {
    const result = analyzeTransactionSafety('enhanced_send', normalOutputs, SIGNER);
    expect(result.blocked).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  it('should allow order without warnings', () => {
    const result = analyzeTransactionSafety('order', normalOutputs, SIGNER);
    expect(result.blocked).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  it('should allow dispenser without warnings', () => {
    const result = analyzeTransactionSafety('dispenser', normalOutputs, SIGNER);
    expect(result.blocked).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  it('should allow dispense without warnings', () => {
    const result = analyzeTransactionSafety('dispense', normalOutputs, SIGNER);
    expect(result.blocked).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  it('should allow issuance without warnings', () => {
    const result = analyzeTransactionSafety('issuance', normalOutputs, SIGNER);
    expect(result.blocked).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  it('should allow fairmint without warnings', () => {
    const result = analyzeTransactionSafety('fairmint', normalOutputs, SIGNER);
    expect(result.blocked).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  it('should allow fairminter without warnings', () => {
    const result = analyzeTransactionSafety('fairminter', normalOutputs, SIGNER);
    expect(result.blocked).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  it('should allow cancel without warnings', () => {
    const result = analyzeTransactionSafety('cancel', normalOutputs, SIGNER);
    expect(result.blocked).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  it('should allow dividend without warnings', () => {
    const result = analyzeTransactionSafety('dividend', normalOutputs, SIGNER);
    expect(result.blocked).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  it('should allow send without warnings', () => {
    const result = analyzeTransactionSafety('send', normalOutputs, SIGNER);
    expect(result.blocked).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  it('should allow attach without warnings', () => {
    const result = analyzeTransactionSafety('attach', normalOutputs, SIGNER);
    expect(result.blocked).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  it('states the detach-moves-everything fact as information, not friction', () => {
    // detach credits EVERY balance on the source UTXO to the destination (core detach.py), so the
    // message states no amount — but a detach doing exactly that is routine, and the details list
    // names each released balance. A detach whose assets leave the wallet escalates through the
    // attached-asset destination warning instead.
    const result = analyzeTransactionSafety('detach', normalOutputs, SIGNER);
    expect(result.blocked).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.title).toMatch(/moves everything/i);
    expect(result.warnings[0]!.severity).toBe('info');
  });

  it('should allow mpma_send without warnings', () => {
    const result = analyzeTransactionSafety('mpma_send', normalOutputs, SIGNER);
    expect(result.blocked).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  it('should allow btcpay without warnings', () => {
    const result = analyzeTransactionSafety('btcpay', normalOutputs, SIGNER);
    expect(result.blocked).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  it('should allow pool deposit and withdraw without unknown-type warnings', () => {
    expect(analyzeTransactionSafety('pooldeposit', normalOutputs, SIGNER).warnings).toHaveLength(0);
    expect(analyzeTransactionSafety('poolwithdraw', normalOutputs, SIGNER).warnings).toHaveLength(0);
  });

  it('should warn about unknown message types', () => {
    const result = analyzeTransactionSafety('totally_new_type', normalOutputs, SIGNER);
    expect(result.blocked).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.severity).toBe('warning');
    expect(result.warnings[0]!.title).toContain('Unknown');
  });

  it('should handle undefined message type gracefully', () => {
    const result = analyzeTransactionSafety(undefined, normalOutputs, SIGNER);
    expect(result.blocked).toBe(false);
    // No message type warning, just output analysis
  });
});

// ── Suspicious output detection ──────────────────────────────────────

describe('suspicious output detection', () => {
  it('should not flag outputs back to the signer (change)', () => {
    const outputs = makeOutputs(
      { value: 0, type: 'op_return' },
      { value: 50000, address: SIGNER },
    );
    const result = analyzeTransactionSafety('enhanced_send', outputs, SIGNER);
    expect(result.warnings).toHaveLength(0);
  });

  it('should not flag OP_RETURN outputs', () => {
    const outputs = makeOutputs(
      { value: 0, type: 'op_return' },
    );
    const result = analyzeTransactionSafety('enhanced_send', outputs, SIGNER);
    expect(result.warnings).toHaveLength(0);
  });

  it('should not flag dust outputs to other addresses', () => {
    const outputs = makeOutputs(
      { value: 0, type: 'op_return' },
      { value: 546, address: '1SomeOtherAddressXXXXXXXXXXXXXdef' }, // dust
      { value: 49000, address: SIGNER },
    );
    const result = analyzeTransactionSafety('enhanced_send', outputs, SIGNER);
    expect(result.warnings).toHaveLength(0);
  });

  it('should flag non-dust outputs to external addresses', () => {
    const outputs = makeOutputs(
      { value: 0, type: 'op_return' },
      { value: 100000000, address: '1MaliciousAddressXXXXXXXXXXXXXhack' }, // 1 BTC!
      { value: 49000, address: SIGNER },
    );
    const result = analyzeTransactionSafety('enhanced_send', outputs, SIGNER);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.severity).toBe('danger');
    expect(result.warnings[0]!.title).toContain('External Address');
    expect(result.warnings[0]!.message).toContain('1.00000000 BTC');
  });

  it('should flag multiple suspicious outputs and sum values', () => {
    const outputs = makeOutputs(
      { value: 0, type: 'op_return' },
      { value: 50000000, address: '1AttackerAddr1XXXXXXXXXXXXXXXXXAA' },
      { value: 30000000, address: '1AttackerAddr2XXXXXXXXXXXXXXXXXBB' },
      { value: 49000, address: SIGNER },
    );
    const result = analyzeTransactionSafety('enhanced_send', outputs, SIGNER);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.message).toContain('0.80000000 BTC');
    expect(result.warnings[0]!.message).toContain('2 addresses');
  });

  it('renders externally paid BTC as information only for the separate payment capability', () => {
    const outputs = makeOutputs(
      { value: 21_600, address: 'bc1qglv8hh3l23y0qu5uw4zu7e8q4td0gcjsa8f3tq' },
      { value: 28_982, address: SIGNER },
    );
    const result = analyzeTransactionSafety(undefined, outputs, SIGNER, {
      plainBitcoinPayment: true,
    });
    expect(result.blocked).toBe(false);
    expect(result.warnings).toEqual([expect.objectContaining({
      severity: 'info',
      title: 'Bitcoin Payment',
    })]);
  });

  it('should be case-insensitive when comparing Bech32 signer addresses', () => {
    const signer = 'bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty';
    const outputs = makeOutputs(
      { value: 0, type: 'op_return' },
      { value: 50000, address: signer.toUpperCase() },
    );
    const result = analyzeTransactionSafety('enhanced_send', outputs, signer);
    expect(result.warnings).toHaveLength(0);
  });

  it('should preserve Base58 case sensitivity when comparing signer addresses', () => {
    const outputs = makeOutputs(
      { value: 0, type: 'op_return' },
      { value: 50000, address: SIGNER.toUpperCase() },
    );
    const result = analyzeTransactionSafety('enhanced_send', outputs, SIGNER);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.title).toContain('External Address');
  });

  it('should combine message type and output warnings', () => {
    const outputs = makeOutputs(
      { value: 0, type: 'op_return' },
      { value: 100000000, address: '1MaliciousAddressXXXXXXXXXXXXXhack' },
    );
    const result = analyzeTransactionSafety('destroy', outputs, SIGNER);
    expect(result.warnings).toHaveLength(2);
    // Sorted by severity: danger (destroy) then danger (external output)
    expect(result.warnings[0]!.title).toContain('Destruction');
    expect(result.warnings[1]!.title).toContain('External Address');
  });

  it('should sort block severity before danger', () => {
    const outputs = makeOutputs(
      { value: 0, type: 'op_return' },
      { value: 100000000, address: '1MaliciousAddressXXXXXXXXXXXXXhack' },
    );
    const result = analyzeTransactionSafety('sweep', outputs, SIGNER);
    expect(result.blocked).toBe(true);
    expect(result.warnings[0]!.severity).toBe('block');
    expect(result.warnings[1]!.severity).toBe('danger');
  });
});

// ── Real-world scenarios ─────────────────────────────────────────────

describe('real-world scenarios', () => {
  it('typical Counterparty send: OP_RETURN + change', () => {
    const outputs = makeOutputs(
      { value: 0, type: 'op_return' },
      { value: 48500, address: SIGNER },
    );
    const result = analyzeTransactionSafety('enhanced_send', outputs, SIGNER);
    expect(result.blocked).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  it('dispense: OP_RETURN + dust to dispenser + change', () => {
    const outputs = makeOutputs(
      { value: 0, type: 'op_return' },
      { value: 546, address: '1DispenserAddressXXXXXXXXXXXXXabc' }, // dust trigger
      { value: 48000, address: SIGNER },
    );
    const result = analyzeTransactionSafety('dispense', outputs, SIGNER);
    expect(result.blocked).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  it('btcpay: OP_RETURN + payment to counterparty + change', () => {
    // BTC payment sends actual BTC to the order counterparty
    const outputs = makeOutputs(
      { value: 0, type: 'op_return' },
      { value: 50000, address: '1OrderCounterpartyXXXXXXXXXXXXpay' },
      { value: 48000, address: SIGNER },
    );
    const result = analyzeTransactionSafety('btcpay', outputs, SIGNER);
    expect(result.blocked).toBe(false);
    // Paying the counterparty is what a BTCPay is. The amount and address still get stated so the
    // user can check them, but as information — a danger banner on every correct BTCPay is the
    // false alarm that teaches people to click past the real one.
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.severity).toBe('info');
    expect(result.warnings[0]!.message).toContain('0.00050000 BTC');
  });

  it('malicious site: hidden extra output draining BTC', () => {
    const outputs = makeOutputs(
      { value: 0, type: 'op_return' },
      { value: 500000000, address: '1AttackerDrainAddressXXXXXXXXevil' }, // 5 BTC!
      { value: 1000, address: SIGNER },
    );
    const result = analyzeTransactionSafety('enhanced_send', outputs, SIGNER);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.severity).toBe('danger');
    expect(result.warnings[0]!.message).toContain('5.00000000 BTC');
  });

  it('no OP_RETURN (plain BTC transaction)', () => {
    const outputs = makeOutputs(
      { value: 50000, address: '1SomeRecipientXXXXXXXXXXXXXXXrcpt' },
      { value: 48000, address: SIGNER },
    );
    const result = analyzeTransactionSafety(undefined, outputs, SIGNER);
    expect(result.blocked).toBe(false);
    // Non-dust to external address is flagged
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.severity).toBe('danger');
  });
});

// ── Outputs with no attributable address ─────────────────────────────

describe('outputs whose destination cannot be determined', () => {
  it('warns when non-dust value leaves to an unrecognized script', () => {
    // A bare-multisig or P2WSH output decodes to no address. It used to be dropped from the
    // suspicious list entirely — appearing only as "Unknown address" in the movement summary —
    // so value leaving to a script nobody can name raised nothing at all.
    const result = analyzeTransactionSafety(
      'enhanced_send',
      makeOutputs(
        { value: 0, type: 'op_return' },
        { value: 50_000_000, type: 'unknown' },
      ),
      SIGNER
    );

    const warning = result.warnings.find(w => w.title === 'BTC Sent to an Unrecognized Script');
    expect(warning).toBeDefined();
    expect(warning!.severity).toBe('danger');
    expect(warning!.message).toContain('0.50000000');
  });

  it('leaves dust alone, since Counterparty encodings use it routinely', () => {
    const result = analyzeTransactionSafety(
      'enhanced_send',
      makeOutputs(
        { value: 0, type: 'op_return' },
        { value: 546, type: 'unknown' },
      ),
      SIGNER
    );

    expect(result.warnings.some(w => w.title === 'BTC Sent to an Unrecognized Script')).toBe(false);
  });

  it('does not fire when every output can be attributed', () => {
    const result = analyzeTransactionSafety(
      'enhanced_send',
      makeOutputs(
        { value: 0, type: 'op_return' },
        { value: 50_000, address: SIGNER },
      ),
      SIGNER
    );

    expect(result.warnings.some(w => w.title === 'BTC Sent to an Unrecognized Script')).toBe(false);
  });
});

describe('Counterparty multisig data outputs', () => {
  const dataScript = `51${`21${'ab'.repeat(33)}`.repeat(3)}53ae`;

  it('classifies recognized data outputs as info, not danger', () => {
    const { warnings } = analyzeTransactionSafety(
      'fairminter',
      [
        { value: 1000, type: 'unknown', script: dataScript },
        { value: 1000, type: 'unknown', script: dataScript },
        { value: 1000, type: 'unknown', script: dataScript },
        { value: 13854, type: 'address', address: '19QWXpMXeLkoEKEJv2xo9rn8wkPCyxACSX' },
      ],
      '19QWXpMXeLkoEKEJv2xo9rn8wkPCyxACSX'
    );
    expect(warnings.some(w => w.title === 'BTC Sent to an Unrecognized Script')).toBe(false);
    const info = warnings.find(w => w.title === 'Counterparty Data Outputs');
    expect(info?.severity).toBe('info');
    expect(info?.message).toContain('3,000 sats');
  });

  it('still warns when the payload did not decode to a message', () => {
    const { warnings } = analyzeTransactionSafety(
      undefined,
      [{ value: 1000, type: 'unknown', script: dataScript }],
      '19QWXpMXeLkoEKEJv2xo9rn8wkPCyxACSX'
    );
    expect(warnings.some(w => w.title === 'BTC Sent to an Unrecognized Script')).toBe(true);
  });
});
