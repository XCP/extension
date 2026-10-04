import { hexToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import {
  belowMinRelayFee,
  dustThresholdSats,
  isStandardVersion,
  lockTimeInForce,
  relativeLockInForce,
} from '@/core/bitcoin/relayPolicy';

describe('dustThresholdSats', () => {
  it.each([
    ['P2PKH', `76a914${'11'.repeat(20)}88ac`, 546],
    ['P2SH', `a914${'11'.repeat(20)}87`, 540],
    ['P2WPKH', `0014${'11'.repeat(20)}`, 294],
    ['P2WSH', `0020${'11'.repeat(32)}`, 330],
    ['P2TR', `5120${'11'.repeat(32)}`, 330],
    ['OP_RETURN', '6a08434e545250525459', 0],
  ])('matches Bitcoin Core for %s', (_name, script, threshold) => {
    expect(dustThresholdSats(hexToBytes(script))).toBe(threshold);
  });
});

describe('timelocks', () => {
  it('reads nLockTime as binding only behind a non-final sequence', () => {
    expect(lockTimeInForce(0, [0xfffffffe])).toBe(false);
    expect(lockTimeInForce(900_000, [0xffffffff])).toBe(false);
    expect(lockTimeInForce(900_000, [0xffffffff, 0xfffffffd])).toBe(true);
  });

  it('reads a BIP68 delay only from a version 2+ input with the disable flag clear', () => {
    expect(relativeLockInForce(2, 0xfffffffd)).toBe(false);
    expect(relativeLockInForce(2, 0)).toBe(false);
    expect(relativeLockInForce(1, 10)).toBe(false);
    expect(relativeLockInForce(2, 10)).toBe(true);
    expect(relativeLockInForce(3, 0x0040_0001)).toBe(true);
  });

  it('relays versions 1 to 3', () => {
    expect([0, 1, 2, 3, 4].map(isStandardVersion)).toEqual([false, true, true, true, false]);
  });
});

describe('belowMinRelayFee', () => {
  it('requires 0.1 sat/vB, rounded up', () => {
    expect(belowMinRelayFee(15, 150)).toBe(false);
    expect(belowMinRelayFee(14, 150)).toBe(true);
    expect(belowMinRelayFee(16, 151)).toBe(false);
    expect(belowMinRelayFee(15, 151)).toBe(true);
    expect(belowMinRelayFee(0, 1)).toBe(true);
  });
});
