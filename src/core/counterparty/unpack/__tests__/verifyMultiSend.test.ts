import { hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { p2pkh, p2tr, p2wpkh } from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import { addressesEqual } from '../address';
import type { MPMAData } from '../messages/mpma';
import { addressComparisonKey, type VerificationResult, verifyMultiSend } from '../verify';

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
    fieldVerification: 'full',
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
    // A single-destination send whose request has no `destinations` list, answered with an MPMA
    // that pays anyone. This must record a CRITICAL mismatch — not just an error string — because
    // verifyTransaction derives `valid` from criticalMismatches; a bare errors.push left valid=true
    // and let a substituted MPMA verify as faithful.
    const result = emptyResult();
    verifyMultiSend(
      mpma([{ asset: 'XCP', destination: DEST_A, quantity: 100000000n }]),
      { asset: 'XCP', quantity: 100000000n },
      result,
    );
    expect(result.criticalMismatches.some((m) => m.field === 'destinations')).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

/**
 * The destination check counts equality classes instead of searching a list. The oracle is the
 * routine it replaced, written out here: consume the first remaining intended address that
 * `addressesEqual` accepts. Every result field is compared, so the same sends are flagged, in the
 * same order, with the same details.
 */
describe('verifyMultiSend matches the pairwise search it replaced', () => {
  const key = (n: number) => getPublicKey(hexToBytes(n.toString(16).padStart(64, '0')), true);
  const SEGWIT = Array.from({ length: 6 }, (_, i) => p2wpkh(key(i + 1)).address!);
  const LEGACY = Array.from({ length: 3 }, (_, i) => p2pkh(key(i + 20)).address!);
  const TAPROOT = p2tr(key(30).slice(1)).address!;
  const POOL = [...SEGWIT, ...LEGACY, TAPROOT, DEST_A, DEST_B];
  const variants = (address: string) => address.startsWith('bc1') ? [address, address.toUpperCase()] : [address];

  /** The destinations the original routine flagged, in the order it flagged them. */
  function originalFlagged(intended: string[], destinations: string[]): string[] {
    const remaining = [...intended];
    const flagged: string[] = [];
    for (const destination of destinations) {
      const matchIdx = remaining.findIndex((address) => addressesEqual(address, destination));
      if (matchIdx === -1) flagged.push(destination);
      else remaining.splice(matchIdx, 1);
    }
    return flagged;
  }

  function check(intended: string[], destinations: string[]): VerificationResult {
    const params = { asset: 'XCP', quantity: 5n, destinations: intended.join(',') };
    const data = mpma(destinations.map((destination) => ({ asset: 'XCP', destination, quantity: 5n })));
    const actual = emptyResult();
    verifyMultiSend(data, params, actual);
    const flagged = originalFlagged(intended, destinations);
    // Only destinations differ here, and each flagged one is recorded exactly as before.
    expect(actual.criticalMismatches.map((m) => m.actual)).toEqual(flagged);
    for (const mismatch of actual.criticalMismatches) {
      expect(mismatch).toMatchObject({ field: 'destination', expected: intended, criticality: 'critical' });
    }
    return actual;
  }

  it('accepts a reordered send', () => {
    expect(check(SEGWIT, [...SEGWIT].reverse()).criticalMismatches).toEqual([]);
  });

  it('accepts duplicates only as many times as they were asked for', () => {
    const intended = [SEGWIT[0]!, SEGWIT[0]!, SEGWIT[1]!];
    expect(check(intended, [SEGWIT[1]!, SEGWIT[0]!, SEGWIT[0]!]).criticalMismatches).toEqual([]);
    const doubled = check(intended, [SEGWIT[0]!, SEGWIT[0]!, SEGWIT[0]!]);
    expect(doubled.criticalMismatches.map((m) => [m.field, m.actual])).toEqual([['destination', SEGWIT[0]]]);
  });

  it('flags a duplicate that replaces an intended recipient, in order', () => {
    const result = check([SEGWIT[0]!, SEGWIT[1]!, SEGWIT[2]!], [SEGWIT[2]!, SEGWIT[2]!, SEGWIT[0]!]);
    expect(result.criticalMismatches.map((m) => m.actual)).toEqual([SEGWIT[2]]);
  });

  it('matches an address written in another case of the same bech32 encoding', () => {
    const intended = SEGWIT.map((a) => a.toUpperCase());
    expect(check(intended, [...SEGWIT].reverse()).criticalMismatches).toEqual([]);
    expect(check([SEGWIT[0]!, SEGWIT[1]!.toUpperCase()], [SEGWIT[1]!, SEGWIT[0]!]).criticalMismatches).toEqual([]);
  });

  it('compares unparseable destinations by their exact text', () => {
    expect(check(['not-an-address', SEGWIT[0]!], [SEGWIT[0]!, 'not-an-address']).criticalMismatches).toEqual([]);
    expect(check(['not-an-address'], ['NOT-AN-ADDRESS']).criticalMismatches).toHaveLength(1);
  });

  it('agrees with the original on many random sends, substitutions and duplicates', () => {
    let seed = 12345;
    const random = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    for (let round = 0; round < 300; round++) {
      const size = 1 + random(8);
      const intended = Array.from({ length: size }, () => {
        const options = variants(POOL[random(POOL.length)]!);
        return options[random(options.length)]!;
      });
      const destinations = intended.map((address) => {
        const roll = random(10);
        if (roll === 0) return POOL[random(POOL.length)]!; // substitution (or a lucky duplicate)
        if (roll === 1) return 'garbage';
        const options = variants(address.toLowerCase() === address ? address : address.toLowerCase());
        return options[random(options.length)]!;
      });
      for (let i = destinations.length - 1; i > 0; i--) {
        const j = random(i + 1);
        [destinations[i], destinations[j]] = [destinations[j]!, destinations[i]!];
      }
      check(intended, destinations);
    }
  });

  it('gives addresses the same comparison key exactly when addressesEqual says they are equal', () => {
    const all = [...POOL.flatMap(variants), 'garbage', 'GARBAGE', ''];
    for (const a of all) {
      for (const b of all) {
        expect(addressComparisonKey(a) === addressComparisonKey(b), `${a} vs ${b}`).toBe(addressesEqual(a, b));
      }
    }
  });
});
