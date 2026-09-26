import { describe, expect, it } from 'vitest';
import {
  type AuthorizedIdentity,
  getConnectionRevokedCode,
  getIdentityMismatchCode,
  getMessagePermissionCode,
  getPsbtPermissionCode,
} from '../requestIdentity';

const req = (over?: Partial<AuthorizedIdentity>): AuthorizedIdentity => ({
  origin: 'https://example.com',
  address: 'bc1qauthorized',
  walletId: 'wallet-1',
  ...over,
});

describe('getIdentityMismatchCode', () => {
  it('returns null when address and wallet match', () => {
    expect(getIdentityMismatchCode(req(), 'bc1qauthorized', 'wallet-1')).toBeNull();
  });

  it('flags a changed active address', () => {
    expect(getIdentityMismatchCode(req(), 'bc1qother', 'wallet-1')).toBe('identity_changed');
  });

  it('flags a changed active wallet', () => {
    expect(getIdentityMismatchCode(req(), 'bc1qauthorized', 'wallet-2')).toBe('identity_changed');
  });

  it('flags a missing active identity', () => {
    expect(getIdentityMismatchCode(req(), undefined, undefined)).toBe('identity_changed');
  });

  it('ignores walletId when the request has none (back-compat)', () => {
    expect(getIdentityMismatchCode(req({ walletId: '' }), 'bc1qauthorized', 'any-wallet')).toBeNull();
  });
});

describe('getIdentityMismatchCode with the paired sibling', () => {
  const grant = { pairedAddresses: true, walletId: 'wallet-1', address: 'bc1qauthorized', pairedAddress: '1Sibling' };

  it('keeps the request when the origin holds the paired grant covering both halves', () => {
    expect(getIdentityMismatchCode(req(), '1Sibling', 'wallet-1', grant)).toBeNull();
    // Either half may have been active when the grant was approved.
    expect(getIdentityMismatchCode(req({ address: '1Sibling' }), 'bc1qauthorized', 'wallet-1', grant)).toBeNull();
  });

  it('treats the sibling as a changed identity without the grant', () => {
    expect(getIdentityMismatchCode(req(), '1Sibling', 'wallet-1')).toBe('identity_changed');
    expect(getIdentityMismatchCode(req(), '1Sibling', 'wallet-1', { ...grant, pairedAddresses: false }))
      .toBe('identity_changed');
    // A grant recorded before the sibling was stored covers only the one address.
    expect(getIdentityMismatchCode(req(), '1Sibling', 'wallet-1', { ...grant, pairedAddress: undefined }))
      .toBe('identity_changed');
  });

  it('never extends to another address, another wallet, or a missing identity', () => {
    expect(getIdentityMismatchCode(req(), '1SomeoneElse', 'wallet-1', grant)).toBe('identity_changed');
    expect(getIdentityMismatchCode(req(), '1Sibling', 'wallet-2', grant)).toBe('identity_changed');
    expect(getIdentityMismatchCode(req(), '1Sibling', 'wallet-1', { ...grant, walletId: 'wallet-2' }))
      .toBe('identity_changed');
    expect(getIdentityMismatchCode(req(), undefined, 'wallet-1', grant)).toBe('identity_changed');
    expect(getIdentityMismatchCode(req({ walletId: '' }), '1Sibling', 'wallet-1', grant)).toBe('identity_changed');
  });
});
describe('getPsbtPermissionCode', () => {
  const permissions = (connected: boolean, paired: boolean) => ({
    hasPermission: async () => connected,
    hasPairedAddressPermission: async () => paired,
  });

  it('rejects a request after the site disconnects', async () => {
    await expect(getPsbtPermissionCode(
      req(),
      'bc1qauthorized',
      permissions(false, true)
    )).resolves.toBe('connection_revoked');
  });

  it('allows an active-address-only request without the paired grant', async () => {
    await expect(getPsbtPermissionCode(
      { ...req(), signInputs: { bc1qauthorized: [0] } },
      'bc1qauthorized',
      permissions(true, false)
    )).resolves.toBeNull();
  });

  it('rejects a paired request after its additional grant is revoked', async () => {
    await expect(getPsbtPermissionCode(
      { ...req(), signInputs: { bc1qauthorized: [0], '1paired': [1] } },
      'bc1qauthorized',
      permissions(true, false)
    )).resolves.toBe('paired_revoked');
  });

  it('allows a paired request while both grants remain active', async () => {
    await expect(getPsbtPermissionCode(
      { ...req(), signInputs: { bc1qauthorized: [0], '1paired': [1] } },
      'bc1qauthorized',
      permissions(true, true)
    )).resolves.toBeNull();
  });
});

describe('getMessagePermissionCode', () => {
  const permissions = (connected: boolean, paired: boolean) => ({
    hasPermission: async () => connected,
    hasPairedAddressPermission: async () => paired,
  });

  it('allows the request-bound active signer with ordinary permission', async () => {
    await expect(getMessagePermissionCode(
      { ...req(), signingAddress: 'bc1qauthorized' },
      permissions(true, false),
    )).resolves.toBeNull();
  });

  it('allows the sibling signer while paired permission remains active', async () => {
    await expect(getMessagePermissionCode(
      { ...req(), signingAddress: '1paired' },
      permissions(true, true),
    )).resolves.toBeNull();
  });

  it('refuses the sibling signer after paired permission is revoked', async () => {
    await expect(getMessagePermissionCode(
      { ...req(), signingAddress: '1paired' },
      permissions(true, false),
    )).resolves.toBe('paired_revoked');
  });
});

describe('getConnectionRevokedCode', () => {
  it('returns null while the site is still connected', async () => {
    const permissions = { hasPermission: async () => true };
    expect(await getConnectionRevokedCode(req(), permissions)).toBeNull();
  });

  it('refuses once the site has been revoked mid-approval', async () => {
    // The window a long-lived approval leaves open: the user revokes the site in
    // Settings while the prompt is still on screen.
    const permissions = { hasPermission: async () => false };
    expect(await getConnectionRevokedCode(req(), permissions)).toBe('connection_revoked');
  });

  it('checks the request origin, not some other site', async () => {
    const seen: string[] = [];
    const permissions = {
      hasPermission: async (origin: string) => {
        seen.push(origin);
        return true;
      },
    };
    await getConnectionRevokedCode(req({ origin: 'https://evil.test' }), permissions);
    expect(seen).toEqual(['https://evil.test']);
  });
});
