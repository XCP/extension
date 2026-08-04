import { describe, expect, it } from 'vitest';
import { isStaleInputsError } from '@/core/bitcoin/broadcastErrors';

describe('isStaleInputsError', () => {
  it('recognises the node rejection that means the batch list is out of date', () => {
    // The exact string a user hit after the service re-offered a confirmed recovery's inputs.
    expect(
      isStaleInputsError(
        'sendrawtransaction RPC error: {"code":-25,"message":"bad-txns-inputs-missingorspent"}',
      ),
    ).toBe(true);
  });

  it('recognises the neighbouring node rejections for inputs that have moved', () => {
    expect(isStaleInputsError('bad-txns-inputs-duplicate')).toBe(true);
    expect(isStaleInputsError('txn-mempool-conflict')).toBe(true);
    expect(isStaleInputsError('Inputs have already been spent')).toBe(true);
  });

  it('is case insensitive, since the message is passed through from a node', () => {
    expect(isStaleInputsError('BAD-TXNS-INPUTS-MISSINGORSPENT')).toBe(true);
  });

  it('does not treat unrelated failures as a reason to refetch and rebroadcast', () => {
    expect(isStaleInputsError('min relay fee not met')).toBe(false);
    expect(isStaleInputsError('Wallet is locked')).toBe(false);
    expect(isStaleInputsError('Request failed with status 500')).toBe(false);
    expect(isStaleInputsError('dust output')).toBe(false);
    expect(isStaleInputsError('')).toBe(false);
  });
});
