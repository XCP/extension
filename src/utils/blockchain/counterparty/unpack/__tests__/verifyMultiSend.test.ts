import { describe, it, expect } from 'vitest';
import { verifyMultiSend, type VerificationResult } from '../verify';
import type { MPMAData } from '../messages/mpma';

// Two real mainnet P2PKH addresses used only as destinations.
const DEST_A = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
const DEST_B = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2';

function emptyResult(): VerificationResult {
  return {
    valid: false,
    criticalMismatches: [],
    dangerousMismatches: [],
    infoMismatches: [],
    errors: [],
    warnings: [],
    expected: {},
    actual: {},
  };
}

function mpma(sends: Array<{ asset: string; destination: string; quantity: bigint }>): MPMAData {
  return { sends };
}

describe('verifyMultiSend', () => {
  const intent = { asset: 'XCP', quantity: 100000000n, destinations: `${DEST_A},${DEST_B}` };

  it('accepts a faithful multi-send', () => {
    const result = emptyResult();
    verifyMultiSend(
      mpma([
        { asset: 'XCP', destination: DEST_A, quantity: 100000000n },
        { asset: 'XCP', destination: DEST_B, quantity: 100000000n },
      ]),
      intent,
      result,
    );
    expect(result.errors).toHaveLength(0);
    expect(result.criticalMismatches).toHaveLength(0);
  });

  it('flags a substituted destination', () => {
    const result = emptyResult();
    verifyMultiSend(
      mpma([
        { asset: 'XCP', destination: DEST_A, quantity: 100000000n },
        { asset: 'XCP', destination: '1AttackerAddressXXXXXXXXXXXXXXY6z9tL', quantity: 100000000n },
      ]),
      intent,
      result,
    );
    expect(result.criticalMismatches.some((m) => m.field === 'destination')).toBe(true);
  });

  it('flags an injected extra recipient', () => {
    const result = emptyResult();
    verifyMultiSend(
      mpma([
        { asset: 'XCP', destination: DEST_A, quantity: 100000000n },
        { asset: 'XCP', destination: DEST_B, quantity: 100000000n },
        { asset: 'XCP', destination: DEST_A, quantity: 100000000n },
      ]),
      intent,
      result,
    );
    expect(result.criticalMismatches.some((m) => m.field === 'recipient_count')).toBe(true);
  });

  it('flags a tampered asset', () => {
    const result = emptyResult();
    verifyMultiSend(
      mpma([
        { asset: 'PEPECASH', destination: DEST_A, quantity: 100000000n },
        { asset: 'XCP', destination: DEST_B, quantity: 100000000n },
      ]),
      intent,
      result,
    );
    expect(result.criticalMismatches.some((m) => m.field === 'asset')).toBe(true);
  });

  it('flags a tampered quantity', () => {
    const result = emptyResult();
    verifyMultiSend(
      mpma([
        { asset: 'XCP', destination: DEST_A, quantity: 999999999n },
        { asset: 'XCP', destination: DEST_B, quantity: 100000000n },
      ]),
      intent,
      result,
    );
    expect(result.criticalMismatches.some((m) => m.field === 'quantity')).toBe(true);
  });

  it('fails closed when there are no intended destinations', () => {
    const result = emptyResult();
    verifyMultiSend(
      mpma([{ asset: 'XCP', destination: DEST_A, quantity: 100000000n }]),
      { asset: 'XCP', quantity: 100000000n },
      result,
    );
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
