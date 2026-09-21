import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  beginSignFlow,
  cancelPendingSignFlow,
  claimSignFlow,
  computeRequestKey,
  findActiveFlowByKey,
  findSafeChangeSigningAddress,
  getSignFlow,
  recordSignOutcome,
  removeSignFlow,
} from '../signFlow';

describe('signFlow', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  describe('computeRequestKey', () => {
    it('is deterministic for identical inputs', () => {
      const a = computeRequestKey('https://x.com', 'xcp_signTransaction', [{ hex: '00' }]);
      const b = computeRequestKey('https://x.com', 'xcp_signTransaction', [{ hex: '00' }]);
      expect(a).toBe(b);
    });

    it('differs by origin, method, or params', () => {
      const base = computeRequestKey('https://x.com', 'xcp_signTransaction', ['00']);
      expect(computeRequestKey('https://y.com', 'xcp_signTransaction', ['00'])).not.toBe(base);
      expect(computeRequestKey('https://x.com', 'xcp_signPsbt', ['00'])).not.toBe(base);
      expect(computeRequestKey('https://x.com', 'xcp_signTransaction', ['01'])).not.toBe(base);
    });

    it('binds the signing identity and canonicalizes parameter object order with SHA-256', () => {
      const identity = { walletId: 'wallet-1', address: 'address-1' };
      const key = computeRequestKey('https://x.com', 'method', { a: 1, b: 2 }, identity);
      expect(key).toMatch(/^method:[a-f0-9]{64}$/);
      expect(computeRequestKey('https://x.com', 'method', { b: 2, a: 1 }, identity)).toBe(key);
      expect(computeRequestKey('https://x.com', 'method', { a: 1, b: 2 }, { ...identity, walletId: 'other' })).not.toBe(key);
      expect(computeRequestKey('https://x.com', 'method', { a: 1, b: 2 }, { ...identity, address: 'other' })).not.toBe(key);
    });
  });

  describe('lifecycle', () => {
    it('records pending, then outcome, recoverable by id and key', async () => {
      const key = computeRequestKey('https://x.com', 'xcp_signTransaction', ['00']);
      await beginSignFlow({
        id: 'id-1',
        origin: 'https://x.com',
        requestKey: key,
        kind: 'sign-transaction',
        address: 'bc1qexample',
        walletId: 'wallet-1',
        timestamp: Date.now(),
        rawTxHex: '00',
      });

      let flow = await findActiveFlowByKey(key, 'https://x.com');
      expect(flow?.id).toBe('id-1');
      expect(flow?.status).toBe('pending');

      await recordSignOutcome('id-1', 'completed', {
        signedTxHex: 'deadbeef',
        safeOwnChange: true,
      });
      flow = await getSignFlow('id-1');
      expect(flow?.status).toBe('completed');
      expect(flow?.status === 'completed' ? flow.result : undefined).toEqual({ signedTxHex: 'deadbeef', safeOwnChange: true });
      expect(await findSafeChangeSigningAddress('deadbeef', 'https://x.com'))
        .toBe('bc1qexample');
      expect(await findSafeChangeSigningAddress('deadbeef', 'https://elsewhere.com'))
        .toBeNull();

      await removeSignFlow('id-1');
      expect(await getSignFlow('id-1')).toBeNull();
      expect(await findActiveFlowByKey(key, 'https://x.com')).toBeNull();
    });

    it('does not return a flow to a different origin (djb2 collision guard)', async () => {
      const key = computeRequestKey('https://victim.com', 'xcp_signPsbt', ['00']);
      await beginSignFlow({
        id: 'id-2',
        origin: 'https://victim.com',
        requestKey: key,
        kind: 'sign-psbt',
        address: 'bc1qvictim',
        walletId: 'wallet-1',
        timestamp: Date.now(),
        psbtHex: '00',
      });

      // Even given the victim's exact requestKey, another origin gets nothing.
      expect(await findActiveFlowByKey(key, 'https://attacker.com')).toBeNull();
      expect((await findActiveFlowByKey(key, 'https://victim.com'))?.id).toBe('id-2');
    });

    it('recordSignOutcome is a no-op for an unknown id', async () => {
      await expect(recordSignOutcome('nope', 'completed', {})).resolves.toBeNull();
    });

    it('claims once, refuses an ID overwrite, and prevents late popup cancellation after approval', async () => {
      const entry = { id: 'claim', origin: 'https://x.com', requestKey: 'key', kind: 'sign-message' as const,
        walletId: 'wallet', address: 'address', message: 'approved message', timestamp: Date.now() };
      await beginSignFlow(entry);
      await claimSignFlow('claim');
      await expect(claimSignFlow('claim')).rejects.toThrow(/no longer pending/);
      await expect(beginSignFlow({ ...entry, message: 'replacement' })).rejects.toThrow();
      expect(await cancelPendingSignFlow('claim')).toBe(false);
      expect(await getSignFlow('claim')).toMatchObject({ status: 'signing', message: 'approved message' });
    });

    it('does not lose another request when a completion and insertion overlap', async () => {
      const base = { origin: 'https://x.com', requestKey: 'key', kind: 'sign-message' as const,
        walletId: 'wallet', address: 'address', message: 'hello', timestamp: Date.now() };
      await beginSignFlow({ ...base, id: 'a' });
      await Promise.all([recordSignOutcome('a', 'completed', { signature: 'signature' }),
        beginSignFlow({ ...base, id: 'b' })]);
      expect(await getSignFlow('a')).toMatchObject({ status: 'completed', result: { signature: 'signature' } });
      expect(await getSignFlow('b')).toMatchObject({ status: 'pending' });
      expect(await recordSignOutcome('a', 'cancelled')).toMatchObject({
        status: 'completed', result: { signature: 'signature' },
      });
      expect(await getSignFlow('a')).toMatchObject({ status: 'completed' });
    });

    it('reports cancellation when cancellation wins a competing completion', async () => {
      await beginSignFlow({ id: 'race', origin: 'https://x.com', requestKey: 'key', kind: 'sign-message',
        walletId: 'wallet', address: 'address', message: 'hello', timestamp: Date.now() });
      const [cancelled, attemptedCompletion] = await Promise.all([
        recordSignOutcome('race', 'cancelled'),
        recordSignOutcome('race', 'completed', { signature: 'must-not-be-published' }),
      ]);
      expect(cancelled).toMatchObject({ status: 'cancelled' });
      expect(attemptedCompletion).toMatchObject({ status: 'cancelled' });
      expect(await getSignFlow('race')).not.toHaveProperty('result');
    });

    it('rejects malformed persisted variants and non-finite or future timestamps', async () => {
      const base = { id: 'bad', origin: 'https://x.com', requestKey: 'key', kind: 'sign-message',
        walletId: 'wallet', address: 'address', timestamp: Date.now(), status: 'pending' };
      for (const entry of [{ ...base, message: 42 }, { ...base, message: 'hello', timestamp: Infinity },
        { ...base, message: 'hello', timestamp: Date.now() + 60_000 },
        { ...base, status: 'completed', result: { signedPsbtHex: 'wrong-result' } }]) {
        await chrome.storage.session.set({ pending_sign_flow: [entry] });
        expect(await getSignFlow('bad')).toBeNull();
      }
    });
  });
});
