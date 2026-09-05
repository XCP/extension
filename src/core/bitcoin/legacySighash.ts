import type { Transaction } from '@scure/btc-signer';

interface LegacySighashAccess {
  preimageLegacy?: (
    inputIndex: number,
    script: Uint8Array,
    sighash: number,
  ) => Uint8Array;
  opts?: { lowR?: boolean };
}

/**
 * Narrow compatibility boundary for Counterparty legacy scripts that btc-signer deliberately
 * cannot decode. Keep the private library access in one pinned, signature-tested adapter rather
 * than spreading casts through each custom signer.
 */
export function getLegacySighash(
  transaction: Transaction,
  inputIndex: number,
  script: Uint8Array,
  sighash: number,
): Uint8Array {
  const access = transaction as unknown as LegacySighashAccess;
  if (typeof access.preimageLegacy !== 'function') {
    throw new Error('btc-signer legacy sighash routine is unavailable');
  }
  return access.preimageLegacy(inputIndex, script, sighash);
}

export function getLowRPreference(transaction: Transaction): boolean | undefined {
  return (transaction as unknown as LegacySighashAccess).opts?.lowR;
}
