import { describe, expect, it } from 'vitest';
import { signerScope, walletSupportsPair } from '../providerSignerScope';

const ACTIVE = 'bc1qactiveaddress';
const PAIRED = {
  legacy: { address: '1LegacySibling', label: 'legacy' },
  segwit: { address: 'bc1qsegwitsibling', label: 'segwit' },
};

describe('provider signer scope', () => {
  it('allows only the active address when no pair was loaded', () => {
    const scope = signerScope(ACTIVE, null);
    expect(scope.allowed).toEqual([ACTIVE]);
    expect(scope.findPairedTarget('1LegacySibling')).toBeUndefined();
    expect(scope.usesPairedSigner({ [ACTIVE]: [0] })).toBe(false);
  });

  it('adds the legacy then segwit sibling after the active address', () => {
    expect(signerScope(ACTIVE, PAIRED).allowed).toEqual([ACTIVE, '1LegacySibling', 'bc1qsegwitsibling']);
  });

  it('finds a paired target by normalized address and returns the loaded entry', () => {
    const scope = signerScope(ACTIVE, PAIRED);
    expect(scope.findPairedTarget('BC1QSEGWITSIBLING')).toBe(PAIRED.segwit);
    expect(scope.findPairedTarget('1LegacySibling')).toBe(PAIRED.legacy);
    expect(scope.findPairedTarget('1legacysibling')).toBeUndefined();
    expect(scope.findPairedTarget('bc1qsomeoneelse')).toBeUndefined();
  });

  it('reports a paired signer only for a sibling that is not the active address', () => {
    const scope = signerScope(ACTIVE, PAIRED);
    expect(scope.usesPairedSigner({ [ACTIVE]: [0] })).toBe(false);
    expect(scope.usesPairedSigner({ BC1QACTIVEADDRESS: [0] })).toBe(false);
    expect(scope.usesPairedSigner({ [ACTIVE]: [0], bc1qsegwitsibling: [1] })).toBe(true);
    expect(scope.usesPairedSigner({ bc1qsomeoneelse: [0] })).toBe(false);
    // A pair that includes the active address itself never counts as a paired signer.
    expect(signerScope(ACTIVE, { ...PAIRED, segwit: { address: ACTIVE, label: 'segwit' } })
      .usesPairedSigner({ [ACTIVE]: [0] })).toBe(false);
  });

  it('supports a pair only for mnemonic wallets whose format has one', () => {
    expect(walletSupportsPair({ type: 'mnemonic', addressFormat: 'p2wpkh' })).toBe(true);
    expect(walletSupportsPair({ type: 'privateKey', addressFormat: 'p2wpkh' })).toBe(false);
    expect(walletSupportsPair({ type: 'hardware', addressFormat: 'p2wpkh' })).toBe(false);
    expect(walletSupportsPair({ type: 'mnemonic', addressFormat: 'p2tr' })).toBe(false);
  });
});
