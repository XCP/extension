/**
 * Reading a Counterparty message out of an ord inscription envelope.
 *
 * A taproot-encoded Counterparty transaction carries its message in the reveal's tapleaf script,
 * not in an OP_RETURN — the OP_RETURN holds only the bare CNTRPRTY marker. When a site asks this
 * wallet to sign an inscription reveal (or names the envelope alongside a commit), the only honest
 * way to know what the transaction says is to read the envelope the way the chain will.
 *
 * This mirrors core's `extract_data_from_witness` (counterparty-rs `bitcoin_client.rs`), which is
 * the consensus reader for these bytes:
 *
 *   OP_FALSE OP_IF "ord" 0x07 <metaprotocol> 0x01 <mime type>
 *     (0x05 <metadata chunk>)*   — CBOR: either [message_type_id, ...fields] directly, or a map
 *                                  whose "xcp" key holds that array (ordinals_metadata_support)
 *     OP_0 (<content chunk>)*    — the inscription body
 *   OP_ENDIF <32-byte x-only pubkey> OP_CHECKSIG
 *
 * and reassembles the message exactly as core does: `[type_id] ++ CBOR([...fields, mime_type,
 * content?])`, with the content appended only when body chunks exist. Divergences are deliberate
 * and strictly *narrower* than core — anything this refuses that core would accept fails toward
 * not signing, never the reverse. Where core is lax (it never checks the metaprotocol says "xcp",
 * reads whatever sits at the mime position, and truncates the type id to a byte), this is lax in
 * exactly the same way, because the point is to report what the chain will execute.
 */

import { bytesToHex } from '@noble/hashes/utils.js';
import { type CborEncodable, encodeCbor } from '@/core/counterparty/pack/cbor';
import { type CborValue, decodeCbor } from '@/core/counterparty/unpack/cbor';
import { COUNTERPARTY_PREFIX_HEX } from '@/core/counterparty/unpack/messageTypes';

/** One parsed script instruction: an opcode byte, or the bytes a push pushed. */
type Instruction = { op: number } | { push: Uint8Array };

/**
 * Parse a script into instructions. Only push encodings and bare opcodes — the envelope grammar
 * needs nothing more. Returns null on a malformed push (truncated data), as bitcoin's own
 * instruction iterator yields an error there.
 */
function parseInstructions(script: Uint8Array): Instruction[] | null {
  const instructions: Instruction[] = [];
  let i = 0;
  while (i < script.length) {
    const byte = script[i]!;
    if (byte === 0x00) {
      // OP_0 pushes empty bytes; core's iterator reports it as an empty push.
      instructions.push({ push: new Uint8Array(0) });
      i += 1;
    } else if (byte >= 0x01 && byte <= 0x4b) {
      if (i + 1 + byte > script.length) return null;
      instructions.push({ push: script.slice(i + 1, i + 1 + byte) });
      i += 1 + byte;
    } else if (byte === 0x4c) {
      if (i + 2 > script.length) return null;
      const length = script[i + 1]!;
      if (i + 2 + length > script.length) return null;
      instructions.push({ push: script.slice(i + 2, i + 2 + length) });
      i += 2 + length;
    } else if (byte === 0x4d) {
      if (i + 3 > script.length) return null;
      const length = script[i + 1]! | (script[i + 2]! << 8);
      if (i + 3 + length > script.length) return null;
      instructions.push({ push: script.slice(i + 3, i + 3 + length) });
      i += 3 + length;
    } else if (byte === 0x4e) {
      if (i + 5 > script.length) return null;
      const length =
        script[i + 1]! | (script[i + 2]! << 8) | (script[i + 3]! << 16) | (script[i + 4]! << 24);
      if (length < 0 || i + 5 + length > script.length) return null;
      instructions.push({ push: script.slice(i + 5, i + 5 + length) });
      i += 5 + length;
    } else {
      instructions.push({ op: byte });
      i += 1;
    }
  }
  return instructions;
}

const OP_IF = 0x63;
const OP_CHECKSIG = 0xac;

function isPush(instruction: Instruction | undefined): instruction is { push: Uint8Array } {
  return instruction !== undefined && 'push' in instruction;
}

function isOp(instruction: Instruction | undefined, opcode: number): boolean {
  return instruction !== undefined && 'op' in instruction && instruction.op === opcode;
}

function pushEquals(instruction: Instruction | undefined, bytes: number[]): boolean {
  if (!isPush(instruction)) return false;
  if (instruction.push.length !== bytes.length) return false;
  return bytes.every((byte, index) => instruction.push[index] === byte);
}

export interface OrdEnvelopeMessage {
  /**
   * The full Counterparty payload, CNTRPRTY prefix included — the same shape
   * `extractCounterpartyPayload` returns for OP_RETURN carriers, so everything downstream
   * (unpack, verification, the provider gate) treats both carriers identically.
   */
  messageHex: string;
  /** The envelope's stated MIME type, empty when unreadable — core defaults the same way. */
  mimeType: string;
  /** Length of the inscription body in bytes. */
  contentLength: number;
  /** The x-only key the envelope's trailing OP_CHECKSIG binds spending to. */
  checksigPubkey: Uint8Array;
}

/**
 * Read a Counterparty message from a tapleaf script, or null when the script is not an ord
 * envelope carrying one.
 *
 * Null is the common case — a taproot script-path spend can be anything — and callers treat it as
 * "no Counterparty data here", exactly as a payload-less OP_RETURN reads. A script that *is* an
 * envelope but whose metadata does not yield a message also returns null: core raises there, the
 * transaction carries no executable message, and there is nothing to report.
 */
export function extractEnvelopeMessage(script: Uint8Array): OrdEnvelopeMessage | null {
  const instructions = parseInstructions(script);
  if (!instructions || instructions.length < 7) return null;

  // Envelope shape: empty push (or OP_FALSE, which parses as one), OP_IF, …, OP_CHECKSIG.
  const first = instructions[0];
  if (!isPush(first) || first.push.length !== 0) return null;
  if (!isOp(instructions[1], OP_IF)) return null;
  if (!isOp(instructions[instructions.length - 1], OP_CHECKSIG)) return null;

  // ord marker and the metaprotocol tag. Core checks exactly this much: "ord" at [2] and the
  // 0x07 tag at [3]. The metaprotocol *value* at [4] and the 0x01 tag at [5] go unchecked, and
  // the mime type is read positionally from [6].
  if (!pushEquals(instructions[2], [0x6f, 0x72, 0x64])) return null;
  if (!pushEquals(instructions[3], [0x07])) return null;

  let mimeType = '';
  const mimeInstruction = instructions[6];
  if (isPush(mimeInstruction)) {
    try {
      mimeType = new TextDecoder('utf-8', { fatal: true }).decode(mimeInstruction.push);
    } catch {
      mimeType = '';
    }
  }

  // Collect metadata and body chunks. Tag pushes flip the current section; every other push in a
  // section is a chunk of it. The loop stops three instructions short: OP_ENDIF, the pubkey, and
  // OP_CHECKSIG — mirroring core, which never re-checks what those three are beyond the last.
  const metadataChunks: Uint8Array[] = [];
  const bodyChunks: Uint8Array[] = [];
  let section: 'none' | 'metadata' | 'body' = 'none';
  for (let i = 7; i < instructions.length - 3; i += 1) {
    const instruction = instructions[i]!;
    if (pushEquals(instruction, [0x05])) {
      section = 'metadata';
      continue;
    }
    if (isPush(instruction) && instruction.push.length === 0) {
      section = 'body';
      continue;
    }
    if (section === 'none' || !isPush(instruction)) continue;
    (section === 'metadata' ? metadataChunks : bodyChunks).push(instruction.push);
  }

  if (metadataChunks.length === 0) return null;

  const metadataLength = metadataChunks.reduce((total, chunk) => total + chunk.length, 0);
  const metadata = new Uint8Array(metadataLength);
  let offset = 0;
  for (const chunk of metadataChunks) {
    metadata.set(chunk, offset);
    offset += chunk.length;
  }

  const bodyLength = bodyChunks.reduce((total, chunk) => total + chunk.length, 0);
  const body = new Uint8Array(bodyLength);
  offset = 0;
  for (const chunk of bodyChunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }

  // The metadata is CBOR: the message array directly, or a map carrying it under "xcp" while the
  // other keys hold ordinals provenance the consensus parser ignores.
  let decoded: CborValue;
  try {
    decoded = decodeCbor(metadata);
  } catch {
    return null;
  }

  let messageArray: CborValue[];
  if (Array.isArray(decoded)) {
    if (decoded.length === 0) return null;
    messageArray = decoded;
  } else if (decoded instanceof Map) {
    const xcp = decoded.get('xcp');
    if (!Array.isArray(xcp) || xcp.length === 0) return null;
    messageArray = xcp;
  } else {
    return null;
  }

  const [typeIdValue, ...fields] = messageArray;
  if (typeof typeIdValue !== 'bigint') return null;
  // Core casts the id to u8, truncating; a wrong-width id yields the same (likely undecodable)
  // message there and here.
  const typeId = Number(typeIdValue & 0xffn);

  // Reassemble exactly as core does: fields, then the mime type, then the content — the content
  // only when body chunks existed at all.
  const repacked: CborEncodable[] = [...(fields as CborEncodable[]), mimeType];
  if (bodyChunks.length > 0) repacked.push(body);

  let cborBytes: Uint8Array;
  try {
    cborBytes = encodeCbor(repacked);
  } catch {
    return null;
  }

  const pubkeyInstruction = instructions[instructions.length - 2];
  if (!isPush(pubkeyInstruction) || pubkeyInstruction.push.length !== 32) return null;

  return {
    messageHex:
      COUNTERPARTY_PREFIX_HEX + typeId.toString(16).padStart(2, '0') + bytesToHex(cborBytes),
    mimeType,
    contentLength: bodyLength,
    checksigPubkey: pubkeyInstruction.push,
  };
}
