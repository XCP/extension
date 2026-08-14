/**
 * The envelope reader against both constructions that exist in the wild: core's own composes
 * (metadata = bare CBOR array) and the launchpad's ord-style inscriptions (metadata = CBOR map
 * with the message under "xcp"). Fixtures are built with the same push/tag logic as the
 * launchpad's `buildInscriptionScript`, so what is tested is the construction sites actually
 * emit — and the round-trip test proves the reassembled message flows through the wallet's
 * ordinary unpack exactly as an OP_RETURN payload would.
 */

import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import { encodeCbor } from '@/core/counterparty/pack/cbor';
import { decodeCbor } from '@/core/counterparty/unpack/cbor';
import { unpackCounterpartyMessage } from '@/core/counterparty/unpack/index';
import { extractEnvelopeMessage } from '@/core/counterparty/unpack/ordEnvelope';

const USER_KEY = new Uint8Array(32).fill(7);

function push(ops: number[], data: Uint8Array): void {
  if (data.length < 76) ops.push(data.length);
  else if (data.length < 256) ops.push(0x4c, data.length);
  else ops.push(0x4d, data.length & 0xff, (data.length >> 8) & 0xff);
  ops.push(...data);
}

function pushTaggedChunked(ops: number[], tag: number, data: Uint8Array): void {
  for (let i = 0; i < data.length; i += 520) {
    push(ops, new Uint8Array([tag]));
    push(ops, data.slice(i, i + 520));
  }
}

/** Mirror of the launchpad's buildInscriptionScript, parameterized on the metadata bytes. */
function buildEnvelope(options: {
  metadataCbor: Uint8Array;
  body: Uint8Array;
  mimeType?: string;
  metaprotocol?: string;
  pubkey?: Uint8Array;
}): Uint8Array {
  const encoder = new TextEncoder();
  const ops: number[] = [0x00, 0x63];
  push(ops, encoder.encode('ord'));
  if (options.metaprotocol !== undefined) {
    push(ops, new Uint8Array([0x07]));
    push(ops, encoder.encode(options.metaprotocol));
  }
  push(ops, new Uint8Array([0x01]));
  push(ops, encoder.encode(options.mimeType ?? 'image/png'));
  pushTaggedChunked(ops, 0x05, options.metadataCbor);
  ops.push(0x00);
  for (let i = 0; i < options.body.length; i += 520) {
    push(ops, options.body.slice(i, i + 520));
  }
  ops.push(0x68); // OP_ENDIF
  push(ops, options.pubkey ?? USER_KEY);
  ops.push(0xac); // OP_CHECKSIG
  return new Uint8Array(ops);
}

/** CBOR map with text keys — the ord metadata shape; the wallet only decodes maps, so encode here. */
function encodeCborMap(entries: [string, Uint8Array][]): Uint8Array {
  const bytes: number[] = [0xa0 + entries.length];
  const encoder = new TextEncoder();
  for (const [key, valueBytes] of entries) {
    const keyBytes = encoder.encode(key);
    bytes.push(0x60 + keyBytes.length, ...keyBytes, ...valueBytes);
  }
  return new Uint8Array(bytes);
}

// The launchpad's XCP-69 fairminter array: [90, asset_id, parent, price, qty_by_price, max_tx,
// max_addr, hard_cap, premint, start, end, soft_cap, deadline, commission, burn, lock_desc,
// lock_qty, divisible, pool_qty, lp_asset_id]
const FAIRMINTER_XCP_ARRAY = encodeCbor([
  90n, 95428956661682177n, 0n, 100000000n, 1000000000n, 1000000000n, 0n, 100000000000n, 0n,
  900000n, 0n, 10000000000n, 900420n, 0n, false, true, true, true, 5000000000n, 95428956661682178n,
]);

const BODY = new Uint8Array(1200).map((_, i) => i % 251);

describe('extractEnvelopeMessage', () => {
  it('reads a core-style envelope whose metadata is the bare message array', () => {
    const script = buildEnvelope({
      metadataCbor: FAIRMINTER_XCP_ARRAY,
      body: BODY,
      metaprotocol: 'xcp',
    });

    const message = extractEnvelopeMessage(script);
    expect(message).not.toBeNull();
    expect(message!.mimeType).toBe('image/png');
    expect(message!.contentLength).toBe(BODY.length);
    expect(bytesToHex(message!.checksigPubkey)).toBe(bytesToHex(USER_KEY));
    // CNTRPRTY prefix, then the type id byte core would emit (90 = 0x5a).
    expect(message!.messageHex.startsWith('434e5452505254595a')).toBe(true);
  });

  it('reads the launchpad shape: metadata map with the message under "xcp"', () => {
    const metadata = encodeCborMap([['xcp', FAIRMINTER_XCP_ARRAY]]);
    const script = buildEnvelope({ metadataCbor: metadata, body: BODY, metaprotocol: 'xcp' });

    const mapMessage = extractEnvelopeMessage(script);
    const arrayMessage = extractEnvelopeMessage(
      buildEnvelope({ metadataCbor: FAIRMINTER_XCP_ARRAY, body: BODY, metaprotocol: 'xcp' })
    );
    // Core re-encodes both shapes to byte-identical messages; so must this.
    expect(mapMessage!.messageHex).toBe(arrayMessage!.messageHex);
  });

  it('round-trips into the ordinary unpack as a fairminter with the image as description', () => {
    const metadata = encodeCborMap([['xcp', FAIRMINTER_XCP_ARRAY]]);
    const script = buildEnvelope({ metadataCbor: metadata, body: BODY, metaprotocol: 'xcp' });
    const message = extractEnvelopeMessage(script)!;

    const unpacked = unpackCounterpartyMessage(message.messageHex);
    expect(unpacked.success).toBe(true);
    expect(unpacked.messageType).toBe('fairminter');
    const data = unpacked.data as { asset: string; mimeType: string; description: string };
    expect(data.asset).toBe('A95428956661682177');
    expect(data.mimeType).toBe('image/png');
    // Binary content reads as hex, core's bytes_to_content rule for a non-textual MIME type.
    expect(data.description).toBe(bytesToHex(BODY));
  });

  it('keeps ordinals provenance keys out of the message', () => {
    const metadata = encodeCborMap([
      ['asset', encodeCbor(['DECOY'])],
      ['xcp', FAIRMINTER_XCP_ARRAY],
    ]);
    const script = buildEnvelope({ metadataCbor: metadata, body: BODY, metaprotocol: 'xcp' });
    const bare = extractEnvelopeMessage(
      buildEnvelope({ metadataCbor: FAIRMINTER_XCP_ARRAY, body: BODY, metaprotocol: 'xcp' })
    );

    expect(extractEnvelopeMessage(script)!.messageHex).toBe(bare!.messageHex);
  });

  it('appends no content field when the envelope has no body', () => {
    const script = buildEnvelope({
      metadataCbor: FAIRMINTER_XCP_ARRAY,
      body: new Uint8Array(0),
      metaprotocol: 'xcp',
      mimeType: 'text/plain',
    });

    const message = extractEnvelopeMessage(script)!;
    const cborPart = hexToBytes(message.messageHex.slice(18)); // past prefix + type id
    const fields = decodeCbor(cborPart);
    expect(Array.isArray(fields)).toBe(true);
    // 19 message fields + mime type, no content element.
    expect((fields as unknown[]).length).toBe(20);
  });

  it.each([
    ['not an envelope: no leading OP_FALSE', new Uint8Array([0x51, 0x63, 0x68, 0xac])],
    ['not an envelope: OP_RETURN script', new Uint8Array([0x6a, 0x04, 1, 2, 3, 4])],
    ['truncated push', new Uint8Array([0x00, 0x63, 0x4c, 0xff, 0x01])],
  ])('returns null for %s', (_name, script) => {
    expect(extractEnvelopeMessage(script)).toBeNull();
  });

  it('returns null for an envelope that is not an ord inscription', () => {
    // "foo" instead of "ord" at instruction 2.
    const script = buildEnvelope({ metadataCbor: FAIRMINTER_XCP_ARRAY, body: BODY, metaprotocol: 'xcp' });
    const mutated = script.slice();
    mutated.set(new TextEncoder().encode('foo'), 3);
    expect(extractEnvelopeMessage(mutated)).toBeNull();
  });

  it('returns null when the map carries no xcp key, or an empty one', () => {
    const noKey = buildEnvelope({
      metadataCbor: encodeCborMap([['name', encodeCbor(['x'])]]),
      body: BODY,
      metaprotocol: 'xcp',
    });
    const emptyArray = buildEnvelope({
      metadataCbor: encodeCborMap([['xcp', encodeCbor([])]]),
      body: BODY,
      metaprotocol: 'xcp',
    });

    expect(extractEnvelopeMessage(noKey)).toBeNull();
    expect(extractEnvelopeMessage(emptyArray)).toBeNull();
  });

  it('returns null when metadata is missing entirely', () => {
    const encoder = new TextEncoder();
    const ops: number[] = [0x00, 0x63];
    push(ops, encoder.encode('ord'));
    push(ops, new Uint8Array([0x07]));
    push(ops, encoder.encode('xcp'));
    push(ops, new Uint8Array([0x01]));
    push(ops, encoder.encode('image/png'));
    ops.push(0x00);
    push(ops, BODY.slice(0, 100));
    ops.push(0x68);
    push(ops, USER_KEY);
    ops.push(0xac);

    expect(extractEnvelopeMessage(new Uint8Array(ops))).toBeNull();
  });

  it('reports the checksig key even for chunked metadata and body', () => {
    const bigBody = new Uint8Array(2000).fill(0xab);
    const script = buildEnvelope({
      metadataCbor: FAIRMINTER_XCP_ARRAY,
      body: bigBody,
      metaprotocol: 'xcp',
    });

    const message = extractEnvelopeMessage(script)!;
    expect(message.contentLength).toBe(2000);
    expect(bytesToHex(message.checksigPubkey)).toBe(bytesToHex(USER_KEY));
  });
});
