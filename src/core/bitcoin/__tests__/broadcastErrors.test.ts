import { describe, expect, it } from 'vitest';
import { isAlreadyKnownError, isStaleInputsError } from '@/core/bitcoin/broadcastErrors';

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

describe('isAlreadyKnownError', () => {
  it('recognises the Counterparty node answering a repeat of a send that already landed', () => {
    expect(isAlreadyKnownError('Error broadcasting transaction: txn-already-in-mempool')).toBe(true);
  });

  it('recognises a public relay that already has the transaction in a block', () => {
    expect(
      isAlreadyKnownError(
        'sendrawtransaction RPC error: {"code":-27,"message":"Transaction already in block chain"}',
      ),
    ).toBe(true);
  });

  it('recognises the peer-level duplicate answers', () => {
    expect(isAlreadyKnownError('txn-already-known')).toBe(true);
    expect(isAlreadyKnownError('already have transaction')).toBe(true);
  });

  it('does not mistake a spent-input rejection for a duplicate', () => {
    expect(isAlreadyKnownError('bad-txns-inputs-missingorspent')).toBe(false);
    expect(isAlreadyKnownError('txn-mempool-conflict')).toBe(false);
    expect(isAlreadyKnownError('min relay fee not met')).toBe(false);
  });
});
