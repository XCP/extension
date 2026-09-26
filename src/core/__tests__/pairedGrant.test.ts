import { describe, expect, it } from 'vitest';
import { pairedGrantCovers } from '../pairedGrant';

const LEGACY = '19QWXpMXeLkoEKEJv2xo9rn8wkPCyxACSX';
const SEGWIT = 'bc1qsvqsa9arwz30g2z0w09twzn8gz3380h36yxacs';
const grant = { pairedAddresses: true, walletId: 'wallet-1', address: LEGACY, pairedAddress: SEGWIT };

describe('pairedGrantCovers', () => {
  it('covers the address that was active at approval', () => {
    expect(pairedGrantCovers(grant, 'wallet-1', LEGACY)).toBe(true);
  });

  it('covers the sibling after the user switches the active account', () => {
    expect(pairedGrantCovers(grant, 'wallet-1', SEGWIT)).toBe(true);
  });

  it('compares SegWit addresses case-insensitively', () => {
    expect(pairedGrantCovers(grant, 'wallet-1', SEGWIT.toUpperCase())).toBe(true);
  });

  it('never covers another derivation index or wallet', () => {
    expect(pairedGrantCovers(grant, 'wallet-1', 'bc1qother')).toBe(false);
    expect(pairedGrantCovers(grant, 'wallet-2', LEGACY)).toBe(false);
  });

  it('keeps an older grant without a recorded sibling scoped to its one address', () => {
    const legacyOnly = { pairedAddresses: true, walletId: 'wallet-1', address: LEGACY };
    expect(pairedGrantCovers(legacyOnly, 'wallet-1', LEGACY)).toBe(true);
    expect(pairedGrantCovers(legacyOnly, 'wallet-1', SEGWIT)).toBe(false);
  });

  it('is false without the paired capability', () => {
    expect(pairedGrantCovers({ ...grant, pairedAddresses: false }, 'wallet-1', LEGACY)).toBe(false);
    expect(pairedGrantCovers(undefined, 'wallet-1', LEGACY)).toBe(false);
  });
});
