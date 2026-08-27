/**
 * Whether Counterparty can encode a destination inside an MPMA send.
 *
 * MPMA packs each destination into the message itself rather than as a transaction output, and
 * core refuses any address whose packed form exceeds 22 bytes (`messages/versions/mpma.py`:
 * "Address not supported by MPMA send"). Packing is one version byte plus the payload, so base58
 * and 20-byte witness programs fit at 21 bytes, and a 32-byte witness program does not at 33.
 *
 * That excludes P2TR and P2WSH. Testing the packed length rather than matching a `bc1p` prefix is
 * the point: P2WSH is a `bc1q` address and would sail past a prefix check, and the two fail for
 * one reason, not two.
 *
 * Checked here so the failure lands on the row that caused it. Core's error names one address and
 * arrives only after composing, so a file with thirty taproot recipients had to be fixed and
 * resubmitted thirty times to find them all.
 *
 * This says nothing about whether an address can RECEIVE the asset — every one of these addresses
 * holds Counterparty assets perfectly well. It is a limit on one encoding, and the answer for an
 * excluded address is an ordinary send.
 */

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
export function isMpmaEncodable(address: string): boolean {
  if (!BECH32_PREFIX.test(address)) return true; // base58 P2PKH/P2SH pack to 21 bytes
  const programBytes = witnessProgramBytes(address);
  if (programBytes === null) return false;
  return 1 + programBytes <= 22;
}

/** Short, specific reason for a rejected destination, for putting in front of a user. */
export function mpmaDestinationError(address: string): string {
  return `${address} cannot receive an MPMA send (Taproot and P2WSH addresses are not encodable in this message type). Send to it separately.`;
}
