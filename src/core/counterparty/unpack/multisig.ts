/**
 * Local extraction of a Counterparty payload carried in bare-multisig outputs.
 *
 * Counterparty's `multisig` encoding stores the message in 1-of-3 bare multisig
 * outputs, using two fake pubkeys per output as data carriers:
 *
 *   OP_1 <data_pubkey_1> <data_pubkey_2> <source_pubkey> OP_3 OP_CHECKMULTISIG
 *
 * Each fake pubkey is a sign byte, 31 data bytes, and a nonce byte; the sign and
 * nonce exist only to land on the curve and are discarded. The 62 data bytes are
 * ARC4-obfuscated with the first input's txid, and decrypt to:
 *
 *   [length byte] [CNTRPRTY prefix] [chunk] [zero padding]
 *
 * Chunks concatenate across outputs, in output order, to form the message. Each
 * output is encrypted with its own keystream, so each decrypts independently.
 */

import { arc4, bytesToHex, hexToBytes } from '@/core/counterparty/unpack/binary';
import { COUNTERPARTY_PREFIX_HEX } from '@/core/counterparty/unpack/messageTypes';

/** Byte length of a bare-multisig data output script. */
const MULTISIG_SCRIPT_LENGTH = 105;
/** Data bytes carried by one fake pubkey (33 minus sign and nonce). */
const DATA_BYTES_PER_PUBKEY = 31;

/**
 * Pull the 62 obfuscated data bytes out of a bare-multisig data output.
 *
 * @param scriptHex - Full scriptPubKey hex
 * @returns The data bytes, or null if this is not a bare-multisig data output
 */
export function isBareMultisigDataOutput(scriptHex: string): boolean {
  return extractMultisigDataBytes(scriptHex) !== null;
}

function extractMultisigDataBytes(scriptHex: string): Uint8Array | null {
  let bytes: Uint8Array;
  try {
    bytes = hexToBytes(scriptHex);
  } catch {
    return null;
  }

  if (bytes.length !== MULTISIG_SCRIPT_LENGTH) return null;
  // OP_1 ... OP_3 OP_CHECKMULTISIG, with three 33-byte pushes between.
  if (bytes[0] !== 0x51 || bytes[103] !== 0x53 || bytes[104] !== 0xae) return null;
  if (bytes[1] !== 0x21 || bytes[35] !== 0x21 || bytes[69] !== 0x21) return null;

  const data = new Uint8Array(DATA_BYTES_PER_PUBKEY * 2);
  // Skip each pubkey's leading sign byte and trailing nonce byte.
  data.set(bytes.slice(3, 3 + DATA_BYTES_PER_PUBKEY), 0);
  data.set(bytes.slice(37, 37 + DATA_BYTES_PER_PUBKEY), DATA_BYTES_PER_PUBKEY);
  return data;
}

/**
 * Decode one bare-multisig data output into its message chunk.
 *
 * @param scriptHex - Full scriptPubKey hex
 * @param firstInputTxid - First input txid in display (big-endian) order
 * @returns The chunk hex without the CNTRPRTY prefix, or null
 */
export function decodeMultisigChunk(scriptHex: string, firstInputTxid: string): string | null {
  const dataBytes = extractMultisigDataBytes(scriptHex);
  if (!dataBytes) return null;

  let decrypted: Uint8Array;
  try {
    decrypted = arc4(hexToBytes(firstInputTxid), dataBytes);
  } catch {
    return null;
  }

  const contentLength = decrypted[0]!;
  if (contentLength === 0 || contentLength > decrypted.length - 1) return null;

  const contentHex = bytesToHex(decrypted.slice(1, 1 + contentLength));
  if (!contentHex.startsWith(COUNTERPARTY_PREFIX_HEX)) return null;

  return contentHex.slice(COUNTERPARTY_PREFIX_HEX.length);
}

// Assembling the chunks across outputs lives in `extractPayloadFromOutputs` (opReturn.ts), which
// walks every data output in order regardless of encoding — the way counterparty-core does.
