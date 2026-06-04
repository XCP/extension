import { describe, it, expect } from 'vitest';
import {
  ProviderError,
  classifyProviderError,
  PROVIDER_ERROR_CODES,
  JSON_RPC_ERROR_CODES,
} from '@/utils/errors';

describe('ProviderError', () => {
  it('carries a code alongside the message', () => {
    const err = new ProviderError(PROVIDER_ERROR_CODES.USER_REJECTED, 'User cancelled');
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe(4001);
    expect(err.message).toBe('User cancelled');
  });
});

describe('classifyProviderError', () => {
  it('prefers a carried code and surfaces its message (no string matching)', () => {
    // Message that matches no pattern — only the code can classify it.
    const err = new ProviderError(PROVIDER_ERROR_CODES.UNAUTHORIZED, 'wallet busy zzz');
    expect(classifyProviderError(err)).toEqual({ code: 4100, message: 'wallet busy zzz' });
  });

  it('masks a carried INTERNAL_ERROR rather than leaking its message', () => {
    const err = new ProviderError(JSON_RPC_ERROR_CODES.INTERNAL_ERROR, 'db connection string leaked');
    expect(classifyProviderError(err)).toEqual({ code: -32603, message: 'Request failed' });
  });

  it('masks an unrecognized numeric code so accidental .code does not leak the message', () => {
    // e.g. a network/library error that happens to carry a numeric code.
    const err = Object.assign(new Error('ECONN secret host:port'), { code: 500 });
    expect(classifyProviderError(err)).toEqual({ code: -32603, message: 'Request failed' });
  });

  it('masks un-coded throws regardless of message — dApp errors must be ProviderError', () => {
    // A plain Error is never trusted to be dApp-safe, even if its text looks user-facing.
    expect(classifyProviderError(new Error('User cancelled the request')))
      .toEqual({ code: -32603, message: 'Request failed' });
    expect(classifyProviderError(new Error('TypeError: undefined is not a function')))
      .toEqual({ code: -32603, message: 'Request failed' });
  });
});
