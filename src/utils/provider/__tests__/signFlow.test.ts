import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  computeRequestKey,
  beginSignFlow,
  recordSignOutcome,
  findActiveFlowByKey,
  getSignFlow,
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
  });

  describe('lifecycle', () => {
    it('records pending, then outcome, recoverable by id and key', async () => {
      const key = computeRequestKey('https://x.com', 'xcp_signTransaction', ['00']);
      await beginSignFlow('id-1', 'https://x.com', key);

      let flow = await findActiveFlowByKey(key, 'https://x.com');
      expect(flow?.id).toBe('id-1');
      expect(flow?.status).toBe('pending');

      await recordSignOutcome('id-1', 'completed', { signedTxHex: 'deadbeef' });
      flow = await getSignFlow('id-1');
      expect(flow?.status).toBe('completed');
      expect(flow?.result).toEqual({ signedTxHex: 'deadbeef' });

      await removeSignFlow('id-1');
      expect(await getSignFlow('id-1')).toBeNull();
      expect(await findActiveFlowByKey(key, 'https://x.com')).toBeNull();
    });

    it('does not return a flow to a different origin (djb2 collision guard)', async () => {
      const key = computeRequestKey('https://victim.com', 'xcp_signPsbt', ['00']);
      await beginSignFlow('id-2', 'https://victim.com', key);

      // Even given the victim's exact requestKey, another origin gets nothing.
      expect(await findActiveFlowByKey(key, 'https://attacker.com')).toBeNull();
      expect((await findActiveFlowByKey(key, 'https://victim.com'))?.id).toBe('id-2');
    });

    it('recordSignOutcome is a no-op for an unknown id', async () => {
      await expect(recordSignOutcome('nope', 'completed', {})).resolves.toBeUndefined();
    });
  });
});
