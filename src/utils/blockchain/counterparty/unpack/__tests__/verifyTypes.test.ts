/**
 * Activation-safety fixtures: with verifyTransaction now live in the composer,
 * confirm each verified message type accepts its genuine intent (no false
 * positive that would block a legitimate compose) and rejects tampering. The
 * message encodings match counterparty-core; the params use the Counterparty
 * API field names that normalizeFormData produces.
 */
import { describe, expect, it } from 'vitest';
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
      const r = verifyTransaction(message, 'destroy', { asset: 'XCP', quantity: 100000000 });
      expect(r.errors).toHaveLength(0);
      expect(r.valid).toBe(true);
    });

    it('rejects a tampered quantity', () => {
      const r = verifyTransaction(message, 'destroy', { asset: 'XCP', quantity: 999 });
      expect(r.valid).toBe(false);
    });
  });

  describe('dispenser', () => {
    // type 12: asset, give_quantity, escrow_quantity, mainchainrate, status
    const message = PREFIX + '0c' + u64(1n) + u64(100n) + u64(1000n) + u64(1000000n) + '00';
    const intent = {
      asset: 'XCP',
      give_quantity: 100,
      escrow_quantity: 1000,
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
  });
});
