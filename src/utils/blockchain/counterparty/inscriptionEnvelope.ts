/**
 * Verification for ord-style inscription composes.
 *
 * When a compose sets `inscription`, core does not put the Counterparty message in an OP_RETURN.
 * It builds an ord envelope script carrying the message, commits to that script in a P2TR output,
 * and returns a pre-signed *reveal* transaction that spends the commit and publishes the content
 * (`lib/api/composer.py`, `generate_ordinal_envelope_script` / `prepare_taproot_output`). The
 * transaction the wallet signs is only the commit.
 *
 * That makes the ordinary checks inapplicable: there is no OP_RETURN to unpack, and the commit
 * output pays an address no request names. Rather than exempt the type — which would leave the
 * whole flow unverified — this rebuilds the envelope from the message the request should produce
 * and requires the composed one to match, then derives the commit address from that envelope and
 * requires the commit output to pay exactly it. counterparty-core applies the same test to its own
 * output in `check_transaction_sanity`, comparing a regenerated envelope script against the
 * composed one.
 *
 * Envelope layout, verified against the ord reference implementation (`src/inscriptions/tag.rs`:
 * ContentType = 1, Metadata = 5, Metaprotocol = 7, and Metadata is chunked so each 520-byte piece
 * repeats its tag) and against core's construction:
 *
 *   OP_FALSE OP_IF
 *     "ord" 0x07 "xcp"          — metaprotocol tag and identifier
 *     0x01 <mime type>          — content type
 *     (0x05 <metadata chunk>)*  — CBOR [message_type_id, ...message fields except mime and content]
 *     OP_0 (<content chunk>)*   — the body
 *   OP_ENDIF
 *   <32-byte x-only pubkey> OP_CHECKSIG
 *
 * The trailing pubkey is chosen randomly by the server per compose, so it cannot be predicted and
 * is read from the composed script — the same allowance core makes when it strips the last two
 * elements before comparing. It is safe to accept because it does not decide where value goes: the
 * commit address is derived from it *and* the verified envelope, and the reveal's outputs are
 * checked separately (`verifyRevealTransaction`).
 */

import { p2tr, Transaction } from '@scure/btc-signer';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils.js';
import { encodeCbor, type CborEncodable } from './pack/cbor';
import { decodeCbor } from './unpack/cbor';
import { COUNTERPARTY_PREFIX_HEX } from './unpack/messageTypes';
import { decodeAddressFromScript } from '@/utils/blockchain/bitcoin/address';

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

/** Bitcoin script push of arbitrary data, matching python-bitcoin-utils' Script serialization. */
function pushData(data: Uint8Array): number[] {
  if (data.length < 0x4c) return [data.length, ...data];
  if (data.length <= 0xff) return [0x4c, data.length, ...data];
  if (data.length <= 0xffff) return [0x4d, data.length & 0xff, data.length >> 8, ...data];
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

  let decoded;
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

/**
 * Verify a composed envelope script carries exactly the message the request should produce, and
 * report the commit address that envelope commits to.
 */
export function verifyInscriptionEnvelope(
  envelopeScriptHex: string,
  expectedMessage: Uint8Array,
  network: 'mainnet' | 'testnet' = 'mainnet'
): EnvelopeCheck {
  let composed: Uint8Array;
  try {
    composed = hexToBytes(envelopeScriptHex.replace(/^0x/, ''));
  } catch {
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

  try {
    const payment = p2tr(
      pubkey,
      { script: composed },
      network === 'mainnet' ? undefined : { bech32: 'tb', pubKeyHash: 0x6f, scriptHash: 0xc4, wif: 0xef },
      true
    );
    if (!payment.address) {
      return { ok: false, error: 'The inscription commit address could not be derived.' };
    }
    return { ok: true, commitAddress: payment.address };
  } catch {
    return { ok: false, error: 'The inscription commit address could not be derived.' };
  }
}

/**
 * Check the pre-signed reveal transaction only moves value back to the signer.
 *
 * The reveal is built and signed by the server, so its outputs are not the user's choice — but they
 * are checkable: core pays an OP_RETURN marker plus dust to the source's change address
 * (`get_reveal_outputs`). Anything else means the reveal would carry value somewhere the user never
 * asked for, and the commit that funds it must not be signed.
 */
export function verifyRevealTransaction(
  revealHex: string,
  ownAddresses: string[],
  network: 'mainnet' | 'testnet' = 'mainnet'
): { ok: boolean; error?: string } {
  let tx: Transaction;
  try {
    tx = Transaction.fromRaw(hexToBytes(revealHex), {
      allowUnknownInputs: true,
      allowUnknownOutputs: true,
      allowLegacyWitnessUtxo: true,
      disableScriptCheck: true,
    });
  } catch {
    return { ok: false, error: 'The inscription reveal transaction could not be read.' };
  }

  const own = new Set(ownAddresses.map((address) => address.toLowerCase()));
  for (let index = 0; index < tx.outputsLength; index += 1) {
    const script = tx.getOutput(index)?.script;
    if (!script) return { ok: false, error: 'The inscription reveal has an unreadable output.' };
    if (script[0] === 0x6a) continue; // OP_RETURN marker carries no value

    const address = decodeAddressFromScript(bytesToHex(script));
    if (!address || !own.has(address.toLowerCase())) {
      return {
        ok: false,
        error: 'The inscription reveal pays an address that is not yours, so it was not accepted.',
      };
    }
  }
  return { ok: true };
}
