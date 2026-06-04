import { describe, it, expect } from 'vitest';
import { getIdentityMismatchError } from '../requestIdentity';
import type { AuthorizedRequest } from '@/utils/storage/requestStorage';

const req = (over?: Partial<AuthorizedRequest>): AuthorizedRequest => ({
  id: 'r1',
  origin: 'https://example.com',
  timestamp: 0,
  address: 'bc1qauthorized',
  walletId: 'wallet-1',
  ...over,
});

describe('getIdentityMismatchError', () => {
  it('returns null when address and wallet match', () => {
    expect(getIdentityMismatchError(req(), 'bc1qauthorized', 'wallet-1')).toBeNull();
  });

  it('flags a changed active address', () => {
    expect(getIdentityMismatchError(req(), 'bc1qother', 'wallet-1')).toMatch(/active address changed/);
  });

  it('flags a changed active wallet', () => {
    expect(getIdentityMismatchError(req(), 'bc1qauthorized', 'wallet-2')).toMatch(/active address changed/);
  });

  it('flags a missing active identity', () => {
    expect(getIdentityMismatchError(req(), undefined, undefined)).not.toBeNull();
  });

  it('ignores walletId when the request has none (back-compat)', () => {
    expect(getIdentityMismatchError(req({ walletId: '' }), 'bc1qauthorized', 'any-wallet')).toBeNull();
  });
});
