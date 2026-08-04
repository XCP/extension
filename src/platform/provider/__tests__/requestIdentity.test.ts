import { describe, expect, it } from 'vitest';
import type { AuthorizedRequest } from '@/platform/storage/requestStorage';
import { getIdentityMismatchError, getPsbtPermissionError } from '../requestIdentity';

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
describe('getPsbtPermissionError', () => {
  const permissions = (connected: boolean, paired: boolean) => ({
    hasPermission: async () => connected,
    hasPairedAddressPermission: async () => paired,
  });

  it('rejects a request after the site disconnects', async () => {
    await expect(getPsbtPermissionError(
      req(),
      'bc1qauthorized',
      permissions(false, true)
    )).resolves.toMatch(/no longer connected/);
  });

  it('allows an active-address-only request without the paired grant', async () => {
    await expect(getPsbtPermissionError(
      { ...req(), signInputs: { bc1qauthorized: [0] } },
      'bc1qauthorized',
      permissions(true, false)
    )).resolves.toBeNull();
  });

  it('rejects a paired request after its additional grant is revoked', async () => {
    await expect(getPsbtPermissionError(
      { ...req(), signInputs: { bc1qauthorized: [0], '1paired': [1] } },
      'bc1qauthorized',
      permissions(true, false)
    )).resolves.toMatch(/Paired address access was revoked/);
  });

  it('allows a paired request while both grants remain active', async () => {
    await expect(getPsbtPermissionError(
      { ...req(), signInputs: { bc1qauthorized: [0], '1paired': [1] } },
      'bc1qauthorized',
      permissions(true, true)
    )).resolves.toBeNull();
  });
});
