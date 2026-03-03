/**
 * Tests for transaction safety analysis
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeTransactionSafety,
  type AnalyzableOutput,
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
    expect(result.warnings[0].severity).toBe('block');
    expect(result.warnings[0].title).toContain('Sweep');
  });

  it('should warn about destroy transactions', () => {
    const result = analyzeTransactionSafety('destroy', normalOutputs, SIGNER);
    expect(result.blocked).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].severity).toBe('danger');
    expect(result.warnings[0].title).toContain('Destruction');
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

  it('should allow detach without warnings', () => {
    const result = analyzeTransactionSafety('detach', normalOutputs, SIGNER);
    expect(result.blocked).toBe(false);
    expect(result.warnings).toHaveLength(0);
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

  it('should warn about unknown message types', () => {
    const result = analyzeTransactionSafety('totally_new_type', normalOutputs, SIGNER);
    expect(result.blocked).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].severity).toBe('warning');
    expect(result.warnings[0].title).toContain('Unknown');
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
    expect(result.warnings[0].severity).toBe('danger');
    expect(result.warnings[0].title).toContain('External Address');
    expect(result.warnings[0].message).toContain('1.00000000 BTC');
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
    expect(result.warnings[0].message).toContain('0.80000000 BTC');
    expect(result.warnings[0].message).toContain('2 addresses');
  });

  it('should be case-insensitive when comparing signer address', () => {
    const outputs = makeOutputs(
      { value: 0, type: 'op_return' },
      { value: 50000, address: SIGNER.toUpperCase() },
    );
    const result = analyzeTransactionSafety('enhanced_send', outputs, SIGNER.toLowerCase());
    expect(result.warnings).toHaveLength(0);
  });

  it('should combine message type and output warnings', () => {
    const outputs = makeOutputs(
      { value: 0, type: 'op_return' },
      { value: 100000000, address: '1MaliciousAddressXXXXXXXXXXXXXhack' },
    );
    const result = analyzeTransactionSafety('destroy', outputs, SIGNER);
    expect(result.warnings).toHaveLength(2);
    // Sorted by severity: danger (destroy) then danger (external output)
    expect(result.warnings[0].title).toContain('Destruction');
    expect(result.warnings[1].title).toContain('External Address');
  });

  it('should sort block severity before danger', () => {
    const outputs = makeOutputs(
      { value: 0, type: 'op_return' },
      { value: 100000000, address: '1MaliciousAddressXXXXXXXXXXXXXhack' },
    );
    const result = analyzeTransactionSafety('sweep', outputs, SIGNER);
    expect(result.blocked).toBe(true);
    expect(result.warnings[0].severity).toBe('block');
    expect(result.warnings[1].severity).toBe('danger');
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
    // btcpay legitimately sends BTC to another address, but we still flag it
    // so the user can verify the payment amount
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].severity).toBe('danger');
  });

  it('malicious site: hidden extra output draining BTC', () => {
    const outputs = makeOutputs(
      { value: 0, type: 'op_return' },
      { value: 500000000, address: '1AttackerDrainAddressXXXXXXXXevil' }, // 5 BTC!
      { value: 1000, address: SIGNER },
    );
    const result = analyzeTransactionSafety('enhanced_send', outputs, SIGNER);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].severity).toBe('danger');
    expect(result.warnings[0].message).toContain('5.00000000 BTC');
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
    expect(result.warnings[0].severity).toBe('danger');
  });
});
