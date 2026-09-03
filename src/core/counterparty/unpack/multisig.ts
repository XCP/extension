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

/** Data bytes carried by one fake pubkey (33 minus sign and nonce). */
const DATA_BYTES_PER_PUBKEY = 31;

interface ParsedMultisigDataOutput {
  dataBytes: Uint8Array;
  recoveryPubkey: Uint8Array;
}

/**
 * Pull the 62 obfuscated data bytes out of a bare-multisig data output.
 *
 * @param scriptHex - Full scriptPubKey hex
 * @returns The data bytes, or null if this is not a bare-multisig data output
 */
export function isBareMultisigDataOutput(scriptHex: string): boolean {
  return parseMultisigDataOutput(scriptHex) !== null;
}

/**
 * The recovery key of a bare-multisig data output: the third slot, which core fills with the
 * source's real public key (`prepare_multisig_output`) so the source can later spend the dust
 * back. Unlike the two data slots it is not obfuscated — it must be a real key the network can
 * check a signature against — so it reads straight out of the script.
 *
 * Null for anything that is not the 1-of-3 data shape. The historical 1-of-2 encoding also ends
 * in the source's key, but nothing current composes it, and a shape this function does not
 * recognize is one it must not claim to have read.
 */
export function bareMultisigRecoveryPubkey(scriptHex: string): string | null {
  const parsed = parseMultisigDataOutput(scriptHex);
  return parsed ? bytesToHex(parsed.recoveryPubkey) : null;
}

function parseMultisigDataOutput(scriptHex: string): ParsedMultisigDataOutput | null {
  let bytes: Uint8Array;
  try {
    bytes = hexToBytes(scriptHex);
  } catch {
    return null;
  }

  // The two data carriers are always compressed-key-sized pushes. The recovery key is the
  // source's real key, and legacy P2PKH sources may have revealed it in either its compressed
  // (33-byte) or uncompressed (65-byte) encoding. Core preserves that encoding in the third slot.
  if (bytes[0] !== 0x51 || bytes[1] !== 0x21 || bytes[35] !== 0x21) return null;
  const recoveryLength = bytes[69];
  if (recoveryLength !== 33 && recoveryLength !== 65) return null;

  const recoveryStart = 70;
  const countOpcodeIndex = recoveryStart + recoveryLength;
  const checkMultisigIndex = countOpcodeIndex + 1;
  if (bytes.length !== checkMultisigIndex + 1) return null;
  if (bytes[countOpcodeIndex] !== 0x53 || bytes[checkMultisigIndex] !== 0xae) return null;

  const dataBytes = new Uint8Array(DATA_BYTES_PER_PUBKEY * 2);
  // Skip each pubkey's leading sign byte and trailing nonce byte.
  dataBytes.set(bytes.slice(3, 3 + DATA_BYTES_PER_PUBKEY), 0);
  dataBytes.set(bytes.slice(37, 37 + DATA_BYTES_PER_PUBKEY), DATA_BYTES_PER_PUBKEY);
  return {
    dataBytes,
    recoveryPubkey: bytes.slice(recoveryStart, recoveryStart + recoveryLength),
  };
}

/**
 * Decode one bare-multisig data output into its message chunk.
 *
 * @param scriptHex - Full scriptPubKey hex
 * @param firstInputTxid - First input txid in display (big-endian) order
 * @returns The chunk hex without the CNTRPRTY prefix, or null
 */
export function decodeMultisigChunk(scriptHex: string, firstInputTxid: string): string | null {
  const parsed = parseMultisigDataOutput(scriptHex);
  if (!parsed) return null;

  let decrypted: Uint8Array;
  try {
    decrypted = arc4(hexToBytes(firstInputTxid), parsed.dataBytes);
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
