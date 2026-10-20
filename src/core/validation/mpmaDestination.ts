import type { MpmaTableFormat } from '@/core/counterparty/mpmaTableFormat';

/** Segwit address human-readable parts, mainnet and testnet/signet/regtest. */
const BECH32_PREFIX = /^(bc1|tb1|bcrt1)/i;

/**
 * Bytes the witness program occupies, read from the address's own length.
 *
 * A bech32 data part carries 5 bits per character: drop the 6-character checksum and the
 * 1-character witness version, and what remains is the program. Deriving it from length avoids a
 * full bech32 decode for a question that is only about size.
 */
function witnessProgramBytes(address: string): number | null {
  const separator = address.lastIndexOf('1');
  if (separator < 0) return null;
  const dataPart = address.slice(separator + 1);
  const programChars = dataPart.length - 6 - 1;
  if (programChars <= 0) return null;
  return Math.floor((programChars * 5) / 8);
}

/**
 * True when this address can be a destination of an MPMA send.
 *
 * Assumes the address is already known to be valid — the caller checks that separately, with a
 * checksum, and this only measures shape.
 */
export function isMpmaEncodable(address: string, format: MpmaTableFormat = 'legacy'): boolean {
  if (!BECH32_PREFIX.test(address)) return true; // base58 P2PKH/P2SH pack to 21 bytes
  const programBytes = witnessProgramBytes(address);
  if (programBytes === null) return false;
  // The activated table carries a length per address; 32-byte witness programs now fit.
  if (format === 'length-prefixed') return programBytes >= 2 && programBytes <= 40;
  return 1 + programBytes <= 22;
}

/** Short, specific reason for a rejected destination, for putting in front of a user. */
export function mpmaDestinationError(address: string): string {
  return `${address} cannot receive an MPMA send before Taproot support activates. Send to it separately.`;
}
