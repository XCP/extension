/**
 * Activation-safety fixtures: with verifyTransaction now live in the composer,
 * confirm each verified message type accepts its genuine intent (no false
 * positive that would block a legitimate compose) and rejects tampering. The
 * message encodings match counterparty-core; the params use the Counterparty
 * API field names that normalizeFormData produces.
 */
import { describe, expect, it } from 'vitest';
import { asBaseUnits } from '@/core/numeric';
import { COUNTERPARTY_PREFIX_HEX } from '../messageTypes';
import { verifyTransaction } from '../verify';

const PREFIX = COUNTERPARTY_PREFIX_HEX;
const u64 = (n: bigint) => n.toString(16).padStart(16, '0');

describe('verifyTransaction activation per type', () => {
  describe('cancel', () => {
    const offerHash = 'aa'.repeat(32);
    const message = PREFIX + '46' + offerHash; // type 70

    it('accepts the true intent', () => {
      const r = verifyTransaction(message, 'cancel', { offer_hash: offerHash });
      expect(r.errors).toHaveLength(0);
      expect(r.valid).toBe(true);
    });

    it('rejects a tampered offer hash', () => {
      const r = verifyTransaction(message, 'cancel', { offer_hash: 'bb'.repeat(32) });
      expect(r.valid).toBe(false);
    });

    it('accepts a mixed-case hash that starts with a base58-like char', () => {
      // Would be misrouted to address comparison (and falsely rejected) if hex
      // hashes were treated as addresses.
      const lower = '1' + 'a'.repeat(63);
      const msg = PREFIX + '46' + lower;
      const r = verifyTransaction(msg, 'cancel', { offer_hash: lower.toUpperCase() });
      expect(r.valid).toBe(true);
    });
  });

  describe('destroy', () => {
    const message = PREFIX + '6e' + u64(1n) + u64(100000000n); // type 110, XCP, 1 XCP

    it('accepts the true intent', () => {
      const r = verifyTransaction(message, 'destroy', { asset: 'XCP', quantity: asBaseUnits(100000000) });
      expect(r.errors).toHaveLength(0);
      expect(r.valid).toBe(true);
    });

    it('rejects a tampered quantity', () => {
      const r = verifyTransaction(message, 'destroy', { asset: 'XCP', quantity: asBaseUnits(999) });
      expect(r.valid).toBe(false);
    });
  });

  describe('unreadable quantities', () => {
    const message = PREFIX + '6e' + u64(1n) + u64(100000000n); // destroy, XCP, 1 XCP

    // toBigInt used to answer 0n for anything BigInt() could not parse, which conflated
    // "could not read this" with "this is zero" and broke the comparison in both directions.

    // The half that costs security: two unreadable values compared equal and certified each
    // other, so a tampered message passed as verified.
    it('does not let an unreadable request certify a message', () => {
      const r = verifyTransaction(message, 'destroy', { asset: 'XCP', quantity: asBaseUnits('not-a-number') });
      expect(r.valid).toBe(false);
      expect(r.criticalMismatches.some((m) => m.field === 'quantity')).toBe(true);
    });

    it('does not treat an unreadable value as zero', () => {
      // Against a message carrying zero, the old sentinel made these compare equal.
      const zeroMessage = PREFIX + '6e' + u64(1n) + u64(0n);
      const r = verifyTransaction(zeroMessage, 'destroy', { asset: 'XCP', quantity: asBaseUnits('1.5') });
      expect(r.valid).toBe(false);
    });

    // The other half: a readable request must still verify normally, in either spelling.
    it('still accepts a quantity given as a numeric string', () => {
      const r = verifyTransaction(message, 'destroy', { asset: 'XCP', quantity: asBaseUnits('100000000') });
      expect(r.errors).toHaveLength(0);
      expect(r.valid).toBe(true);
    });
  });

  describe('dispenser', () => {
    // type 12: asset, give_quantity, escrow_quantity, mainchainrate, status
    const message = PREFIX + '0c' + u64(1n) + u64(100n) + u64(1000n) + u64(1000000n) + '00';
    const intent = {
      asset: 'XCP',
      give_quantity: asBaseUnits(100),
      escrow_quantity: asBaseUnits(1000),
      mainchainrate: 1000000,
      status: 0,
    };

    it('accepts the true intent', () => {
      const r = verifyTransaction(message, 'dispenser', intent);
      expect(r.errors).toHaveLength(0);
      expect(r.valid).toBe(true);
    });

    it('rejects a tampered mainchainrate (price)', () => {
      const r = verifyTransaction(message, 'dispenser', { ...intent, mainchainrate: 1 });
      expect(r.valid).toBe(false);
    });

    // Core constrains give_quantity, escrow_quantity and mainchainrate for the open statuses only
    // (`dispenser.py`); a close leaves them unset and the composer sends 0. The close form submits
    // status alone, so comparing 0 against a request that never carried the field reported three
    // CRITICAL mismatches and blocked every attempt to close a dispenser.
    describe('closing', () => {
      const closeMessage = PREFIX + '0c' + u64(1n) + u64(0n) + u64(0n) + u64(0n) + '0a';

      it('accepts a close that omits the quantities the composer defaults', () => {
        const r = verifyTransaction(closeMessage, 'dispenser', { asset: 'XCP', status: 10 });
        expect(r.errors).toHaveLength(0);
        expect(r.valid).toBe(true);
      });

      it('still rejects a close carrying an escrow it was not asked for', () => {
        const escrowed = PREFIX + '0c' + u64(1n) + u64(0n) + u64(5000n) + u64(0n) + '0a';
        const r = verifyTransaction(escrowed, 'dispenser', { asset: 'XCP', status: 10 });
        expect(r.valid).toBe(false);
      });
    });
  });
});
