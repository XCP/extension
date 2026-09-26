/**
 * Verification for Taproot-encoded composes: ord inscriptions and plain data envelopes.
 *
 * With `encoding=taproot`, core does not put the Counterparty message in an OP_RETURN. It builds an
 * envelope script carrying the message, commits to that script in a P2TR output, and returns a
 * *reveal* transaction — already signed with a throwaway key — that spends the commit and publishes
 * the envelope (`lib/api/composer.py`, `generate_envelope_script` / `prepare_taproot_output`). The
 * transaction the wallet signs is only the commit.
 *
 * The ordinary checks therefore do not apply: there is no OP_RETURN to unpack, and the commit
 * output pays an address no request names. Instead of exempting the type, the envelope is read or
 * rebuilt and required to match core's construction byte for byte, and the commit address is
 * derived from it so the output policy can require the commit to pay exactly that. core applies
 * the same test to its own output in `check_transaction_sanity`.
 *
 * Core builds one of two envelopes. With `inscription` set on an issuance, fairminter or broadcast
 * whose content is non-empty, an ord envelope (layout checked against the ord reference
 * implementation, `src/inscriptions/tag.rs`: ContentType 1, Metadata 5, Metaprotocol 7; Metadata
 * is chunked, so each 520-byte piece repeats its tag):
 *
 *   OP_FALSE OP_IF
 *     "ord" 0x07 "xcp"          — metaprotocol tag and identifier
 *     0x01 <mime type>          — content type
 *     (0x05 <metadata chunk>)*  — CBOR [message_type_id, ...message fields except mime and content]
 *     OP_0 (<content chunk>)*   — the body
 *   OP_ENDIF
 *   <32-byte x-only pubkey> OP_CHECKSIG
 *
 * and otherwise a plain data envelope: the message itself, without the CNTRPRTY prefix, in
 * 520-byte pushes.
 *
 *   OP_FALSE OP_IF (<message chunk>)* OP_ENDIF <32-byte x-only pubkey> OP_CHECKSIG
 *
 * The trailing pubkey is drawn randomly per compose, so it is read from the composed script —
 * the same allowance core makes when it strips the last two elements before comparing. It cannot
 * redirect the message: the commit address derives from it *and* the verified envelope, and the
 * reveal's outputs and fee are checked separately (`verifyRevealTransaction`). Core holds the
 * matching private key, so the value the commit output carries is at core's mercy until the reveal
 * confirms; that value is bounded to the reveal's fee at the user's rate for the same reason.
 */

import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { p2tr, type Transaction } from '@scure/btc-signer';
import { decodeAddressFromScript } from '@/core/bitcoin/address';
import { parseTransactionForSigning } from '@/core/bitcoin/rawTransaction';
import { type CborEncodable, encodeCbor } from '@/core/counterparty/pack/cbor';
import { decodeCbor } from '@/core/counterparty/unpack/cbor';
import { COUNTERPARTY_PREFIX_HEX } from '@/core/counterparty/unpack/messageTypes';
import { type Instruction, parseInstructions } from '@/core/counterparty/unpack/ordEnvelope';
import { add, isGreaterThan, maximum, multiply, roundUp, subtract, toFiniteNumber, toSafeInteger } from '@/core/numeric';

/** Core chunks both metadata and content at this size (`helpers.chunkify`). */
const CHUNK_SIZE = 520;

/**
 * Application types core treats as text (`helpers.TEXTUAL_APPLICATION_MIME_TYPES`). Everything
 * outside this list, `text/*`, `message/*` and the `+xml` / `+json` suffixes is binary.
 */
const TEXTUAL_APPLICATION_MIME_TYPES = new Set([
  'application/xml', 'application/javascript', 'application/ecmascript',
  'application/x-javascript', 'application/json', 'application/manifest+json',
  'application/x-python-code', 'application/x-sh', 'application/x-csh',
  'application/x-tex', 'application/x-latex', 'application/postscript',
  'application/yaml', 'application/x-yaml', 'application/sql',
]);

/**
 * Whether core will read this MIME type's content as UTF-8 text rather than hex
 * (`helpers.classify_mime_type`). This decides how a request must carry the content: text types
 * send it verbatim, everything else sends it hex-encoded, because `content_to_bytes` unhexlifies
 * for binary types. Getting it wrong makes core reject the compose outright.
 */
export function isTextualMimeType(mimeType: string): boolean {
  if (typeof mimeType !== 'string') return false;
  const target = mimeType.split(';')[0]!.trim().toLowerCase();
  if (target.startsWith('text/') || target.startsWith('message/')) return true;
  if (target.endsWith('+xml') || target.endsWith('+json')) return true;
  return TEXTUAL_APPLICATION_MIME_TYPES.has(target);
}

/**
 * Encode a file's bytes the way a compose request must carry them for the given MIME type.
 * Binary content goes as hex; textual content goes as the decoded string.
 */
export function encodeInscriptionContent(bytes: Uint8Array, mimeType: string): string {
  if (isTextualMimeType(mimeType)) {
    return new TextDecoder('utf-8').decode(bytes);
  }
  return bytesToHex(bytes);
}

/**
 * Bitcoin script push of arbitrary data, matching python-bitcoin-utils' Script serialization
 * (`_op_push_data` in 0.7.1, the version core pins). Its bounds are exclusive, so a 255-byte push
 * takes OP_PUSHDATA2 rather than the minimal OP_PUSHDATA1 — mirrored here because the comparison
 * is byte for byte.
 */
function pushData(data: Uint8Array): number[] {
  if (data.length < 0x4c) return [data.length, ...data];
  if (data.length < 0xff) return [0x4c, data.length, ...data];
  if (data.length < 0xffff) return [0x4d, data.length & 0xff, data.length >> 8, ...data];
  throw new Error('envelope: push too large');
}

function chunkify(data: Uint8Array, size: number): Uint8Array[] {
  if (data.length === 0) return [];
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < data.length; i += size) chunks.push(data.slice(i, i + size));
  return chunks;
}

/**
 * Split a packed Counterparty message into the pieces the envelope carries.
 *
 * Core pops the content (last CBOR field) and then the mime type (the new last), prefixes the
 * remainder with the message type id, and CBOR-encodes that as the metadata.
 */
function splitMessage(messageBytes: Uint8Array): {
  messageTypeId: number;
  metadata: Uint8Array;
  mimeType: string;
  content: Uint8Array;
} | null {
  const prefix = hexToBytes(COUNTERPARTY_PREFIX_HEX);
  if (messageBytes.length <= prefix.length + 1) return null;
  for (let i = 0; i < prefix.length; i += 1) {
    if (messageBytes[i] !== prefix[i]) return null;
  }
  const messageTypeId = messageBytes[prefix.length]!;
  const body = messageBytes.slice(prefix.length + 1);

  let decoded: ReturnType<typeof decodeCbor>;
  try {
    decoded = decodeCbor(body);
  } catch {
    return null;
  }
  if (!Array.isArray(decoded) || decoded.length < 2) return null;
  const fields = [...decoded];

  const contentValue = fields.pop();
  const mimeValue = fields.pop();
  if (typeof mimeValue !== 'string') return null;
  const content = contentValue instanceof Uint8Array
    ? contentValue
    : contentValue === null ? new Uint8Array(0) : null;
  if (content === null) return null;

  // Core writes `mime_type or "text/plain"` into the envelope, so an empty mime becomes the default.
  const mimeType = mimeValue === '' ? 'text/plain' : mimeValue;

  const metadataFields: CborEncodable[] = [BigInt(messageTypeId), ...(fields as CborEncodable[])];
  return { messageTypeId, metadata: encodeCbor(metadataFields), mimeType, content };
}

/** Build the envelope script core would produce for this message and ephemeral pubkey. */
function buildEnvelopeScript(messageBytes: Uint8Array, xOnlyPubkey: Uint8Array): Uint8Array | null {
  const split = splitMessage(messageBytes);
  if (!split) return null;
  const encoder = new TextEncoder();

  const bytes: number[] = [
    0x00, // OP_FALSE
    0x63, // OP_IF
    ...pushData(encoder.encode('ord')),
    ...pushData(new Uint8Array([0x07])),
    ...pushData(encoder.encode('xcp')),
    ...pushData(new Uint8Array([0x01])),
    ...pushData(encoder.encode(split.mimeType)),
  ];
  for (const chunk of chunkify(split.metadata, CHUNK_SIZE)) {
    bytes.push(...pushData(new Uint8Array([0x05])), ...pushData(chunk));
  }
  bytes.push(0x00); // OP_0 — start of body
  for (const chunk of chunkify(split.content, CHUNK_SIZE)) {
    bytes.push(...pushData(chunk));
  }
  bytes.push(0x68); // OP_ENDIF
  bytes.push(...pushData(xOnlyPubkey), 0xac); // pubkey, OP_CHECKSIG

  return new Uint8Array(bytes);
}

/**
 * The ephemeral x-only pubkey is the last push before the trailing OP_CHECKSIG.
 * Returns null when the script does not end in the expected `<32 bytes> OP_CHECKSIG` shape.
 */
function extractEnvelopePubkey(envelope: Uint8Array): Uint8Array | null {
  if (envelope.length < 34) return null;
  if (envelope[envelope.length - 1] !== 0xac) return null;
  if (envelope[envelope.length - 34] !== 0x20) return null;
  return envelope.slice(envelope.length - 33, envelope.length - 1);
}

export interface EnvelopeCheck {
  ok: boolean;
  error?: string;
  /** The P2TR address the commit output must pay, when the envelope verified. */
  commitAddress?: string;
}

type Network = 'mainnet' | 'testnet';

const TESTNET = { bech32: 'tb', pubKeyHash: 0x6f, scriptHash: 0xc4, wif: 0xef };

/** The P2TR address committing to this envelope under its own pubkey, as core derives it. */
function commitAddressFor(pubkey: Uint8Array, envelope: Uint8Array, network: Network): string | null {
  try {
    const payment = p2tr(pubkey, { script: envelope }, network === 'mainnet' ? undefined : TESTNET, true);
    return payment.address ?? null;
  } catch {
    return null;
  }
}

function hexBytes(hex: string): Uint8Array | null {
  try {
    return hexToBytes(hex.replace(/^0x/, ''));
  } catch {
    return null;
  }
}

/**
 * Verify a composed ord envelope script carries exactly the message the request should produce,
 * and report the commit address that envelope commits to.
 */
export function verifyInscriptionEnvelope(
  envelopeScriptHex: string,
  expectedMessage: Uint8Array,
  network: Network = 'mainnet'
): EnvelopeCheck {
  const composed = hexBytes(envelopeScriptHex);
  if (!composed) {
    return { ok: false, error: 'The composed envelope script could not be read.' };
  }

  const pubkey = extractEnvelopePubkey(composed);
  if (!pubkey) {
    return { ok: false, error: 'The composed envelope script has an unexpected structure.' };
  }

  const expected = buildEnvelopeScript(expectedMessage, pubkey);
  if (!expected) {
    return { ok: false, error: 'This inscription could not be rebuilt locally for comparison.' };
  }

  if (bytesToHex(expected) !== bytesToHex(composed)) {
    return {
      ok: false,
      error: 'Transaction verification failed: the inscription does not match your request.',
    };
  }

  const commitAddress = commitAddressFor(pubkey, composed, network);
  if (!commitAddress) {
    return { ok: false, error: 'The inscription commit address could not be derived.' };
  }
  return { ok: true, commitAddress };
}

/** Which of core's two envelopes a script is. */
export type EnvelopeKind = 'ord' | 'data';

function isPushOf(instruction: Instruction | undefined, bytes: number[]): boolean {
  if (!instruction || !('push' in instruction)) return false;
  return instruction.push.length === bytes.length && bytes.every((byte, i) => instruction.push[i] === byte);
}

/**
 * Classify an envelope script the way core decides how to reveal it (`is_ordinal_envelope_script`):
 * an ord envelope's third element is the "ord" tag. A script that is not
 * `OP_FALSE OP_IF … <32-byte pubkey> OP_CHECKSIG` is neither, and returns null.
 */
export function envelopeKind(envelopeScriptHex: string): EnvelopeKind | null {
  const bytes = hexBytes(envelopeScriptHex);
  if (!bytes || !extractEnvelopePubkey(bytes)) return null;
  const instructions = parseInstructions(bytes);
  if (!instructions || instructions.length < 5) return null;
  const opIf = instructions[1];
  if (!isPushOf(instructions[0], []) || !opIf || !('op' in opIf) || opIf.op !== 0x63) return null;
  return isPushOf(instructions[2], [0x6f, 0x72, 0x64]) ? 'ord' : 'data';
}

/** Core's plain data envelope for a message (without the CNTRPRTY prefix) and pubkey. */
function buildDataEnvelopeScript(data: Uint8Array, xOnlyPubkey: Uint8Array): Uint8Array {
  const bytes: number[] = [0x00, 0x63]; // OP_FALSE OP_IF
  for (const chunk of chunkify(data, CHUNK_SIZE)) bytes.push(...pushData(chunk));
  bytes.push(0x68); // OP_ENDIF
  bytes.push(...pushData(xOnlyPubkey), 0xac); // pubkey, OP_CHECKSIG
  return new Uint8Array(bytes);
}

export interface DataEnvelopeRead extends EnvelopeCheck {
  /** The message the envelope carries, CNTRPRTY prefix included, as the chain will read it. */
  messageHex?: string;
}

/**
 * Read the message out of a plain data envelope, and derive the commit address.
 *
 * The message is whatever the envelope's pushes concatenate to. The script is then rebuilt from
 * that message with core's construction and required to match byte for byte, so nothing but the
 * message and the pubkey can vary. What the message *says* is not judged here: the caller decodes
 * it for the review and holds it to the request exactly as it does an OP_RETURN payload.
 */
export function readDataEnvelope(envelopeScriptHex: string, network: Network = 'mainnet'): DataEnvelopeRead {
  const unexpected = { ok: false, error: 'The composed envelope script has an unexpected structure.' };
  const composed = hexBytes(envelopeScriptHex);
  if (!composed) return { ok: false, error: 'The composed envelope script could not be read.' };
  if (envelopeKind(envelopeScriptHex) !== 'data') return unexpected;
  const pubkey = extractEnvelopePubkey(composed);
  const instructions = parseInstructions(composed);
  if (!pubkey || !instructions) return unexpected;

  // OP_FALSE, OP_IF, the chunks, OP_ENDIF, pubkey, OP_CHECKSIG.
  const chunks: Uint8Array[] = [];
  for (const instruction of instructions.slice(2, -3)) {
    if (!('push' in instruction) || instruction.push.length === 0) return unexpected;
    chunks.push(instruction.push);
  }
  const data = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  if (data.length === 0) return { ok: false, error: 'The composed envelope carries no message.' };

  if (bytesToHex(buildDataEnvelopeScript(data, pubkey)) !== bytesToHex(composed)) return unexpected;

  const commitAddress = commitAddressFor(pubkey, composed, network);
  if (!commitAddress) {
    return { ok: false, error: 'The envelope commit address could not be derived.' };
  }
  return { ok: true, commitAddress, messageHex: COUNTERPARTY_PREFIX_HEX + bytesToHex(data) };
}

/** `config.DEFAULT_SEGWIT_DUST_SIZE`: core never funds a commit output below this. */
export const COMMIT_DUST_FLOOR = 330;

/** The reveal's OP_RETURN: the bare CNTRPRTY marker core's indexer requires (`get_reveal_outputs`). */
const REVEAL_MARKER_SCRIPT = `6a08${COUNTERPARTY_PREFIX_HEX}`;

export interface RevealCheckOptions {
  /** The envelope the reveal publishes, which decides the outputs core gives it. */
  kind: EnvelopeKind;
  /** Addresses the reveal may return value to (an ord reveal's dust output). */
  ownAddresses: string[];
  /** The unsigned commit transaction, whose output 0 the reveal must spend. */
  commitTxHex: string;
  /** The address derived from the verified envelope, which commit output 0 must pay. */
  commitAddress: string;
  /** The verified envelope, which the reveal must publish. */
  envelopeScriptHex: string;
  /** The fee rate the user chose (sat/vB); the reveal may not pay more than it. */
  feeRate: number;
}

export interface RevealCheck {
  ok: boolean;
  error?: string;
  /** The reveal's miner fee: the commit output's value less what the reveal returns. */
  revealFee?: number;
}

/**
 * Check the pre-signed reveal is exactly the transaction core builds for this commit.
 *
 * The reveal is built and signed by the server, so none of it is the user's choice — but all of it
 * is checkable against core's construction (`get_reveal_outputs`, `prepare_taproot_output`):
 *
 * - one input, spending output 0 of this commit, which must pay the derived commit address, and
 *   publishing the verified envelope as its tapleaf;
 * - a data envelope's reveal has only the zero-value CNTRPRTY marker, so the whole commit output
 *   is fee; an ord reveal adds exactly one output returning dust to the source;
 * - the commit output holds the reveal's fee at the user's rate plus that dust, raised to the
 *   segwit dust floor, and no more.
 *
 * Anything else means the reveal would carry value somewhere the user never asked for, or spend
 * more on fees than they chose, and the commit that funds it must not be signed.
 */
export function verifyRevealTransaction(revealHex: string, options: RevealCheckOptions): RevealCheck {
  let reveal: Transaction;
  let commit: Transaction;
  try {
    reveal = parseTransactionForSigning(revealHex);
  } catch {
    return { ok: false, error: 'The reveal transaction could not be read.' };
  }
  try {
    commit = parseTransactionForSigning(options.commitTxHex);
  } catch {
    return { ok: false, error: 'The commit transaction could not be read.' };
  }

  // The reveal spends the commit's output 0 and nothing else.
  const input = reveal.inputsLength === 1 ? reveal.getInput(0) : undefined;
  if (!input?.txid || input.index !== 0 || bytesToHex(input.txid) !== commit.id) {
    return { ok: false, error: 'The reveal does not spend this commit transaction.' };
  }
  // The script-path witness is [signature, tapleaf, control block]. The commit address already
  // binds the envelope, so a different leaf could not spend it; checked anyway so a reveal that
  // could never confirm is refused before the commit that funds it is signed.
  const witness = input.finalScriptWitness;
  const leaf = witness?.length === 3 ? witness[1] : undefined;
  if (!leaf || bytesToHex(leaf) !== options.envelopeScriptHex.replace(/^0x/, '').toLowerCase()) {
    return { ok: false, error: 'The reveal does not publish the verified envelope.' };
  }
  const commitOutput = commit.outputsLength > 0 ? commit.getOutput(0) : undefined;
  const commitScript = commitOutput?.script ? bytesToHex(commitOutput.script) : '';
  const commitPays = commitScript ? decodeAddressFromScript(commitScript) : null;
  if (commitOutput?.amount === undefined || !commitPays || commitPays !== options.commitAddress) {
    return { ok: false, error: 'The commit transaction does not fund the reveal it was composed with.' };
  }

  // Exactly the outputs core gives this kind of reveal.
  const outputsCoreCreates = options.kind === 'ord' ? 2 : 1;
  const marker = reveal.outputsLength === outputsCoreCreates ? reveal.getOutput(0) : undefined;
  if (!marker?.script || bytesToHex(marker.script) !== REVEAL_MARKER_SCRIPT || marker.amount !== 0n) {
    return { ok: false, error: 'The reveal has outputs core does not create, so it was not accepted.' };
  }
  let returned = 0n;
  if (options.kind === 'ord') {
    const own = new Set(options.ownAddresses.map((address) => address.toLowerCase()));
    const change = reveal.getOutput(1);
    const address = change?.script ? decodeAddressFromScript(bytesToHex(change.script)) : null;
    if (!address || !own.has(address.toLowerCase()) || change?.amount === undefined) {
      return { ok: false, error: 'The reveal pays an address that is not yours, so it was not accepted.' };
    }
    returned = change.amount;
  }

  // The commit output funds the reveal's fee and nothing more (`prepare_taproot_output`).
  const revealFee = commitOutput.amount - returned;
  if (revealFee < 0n) {
    return { ok: false, error: 'The reveal spends more than the commit provides.' };
  }
  const userRate = toFiniteNumber(options.feeRate);
  if (userRate === undefined || !isGreaterThan(userRate, 0)) {
    return { ok: false, error: 'The reveal fee cannot be checked without a fee rate.' };
  }
  const atRate = roundUp(multiply(reveal.vsize, userRate));
  // Core sizes the fee on a dummy reveal of the same shape, so the two agree exactly in practice;
  // the slack absorbs a serializer's rounding without admitting a meaningful overpayment.
  const slack = maximum(10, roundUp(multiply(atRate, '0.02')));
  const allowed = add(maximum(subtract(COMMIT_DUST_FLOOR, returned.toString()), atRate), slack);
  const fee = toSafeInteger(revealFee);
  if (fee === undefined || isGreaterThan(fee, allowed)) {
    return { ok: false, error: 'The reveal pays a higher fee than the rate you chose, so it was not accepted.' };
  }
  return { ok: true, revealFee: fee };
}

/**
 * Whether a reveal spends this (signed) transaction — checked after signing, before anything is
 * broadcast. Anything that changed the commit after it was composed (a nonce, a reordered output,
 * a signer that rewrote a field) changes its txid and leaves the reveal spending nothing.
 */
export function revealSpendsTransaction(revealHex: string, signedCommitHex: string): boolean {
  try {
    const reveal = parseTransactionForSigning(revealHex);
    const commit = parseTransactionForSigning(signedCommitHex);
    const input = reveal.inputsLength === 1 ? reveal.getInput(0) : undefined;
    return !!input?.txid && input.index === 0 && bytesToHex(input.txid) === commit.id;
  } catch {
    return false;
  }
}
