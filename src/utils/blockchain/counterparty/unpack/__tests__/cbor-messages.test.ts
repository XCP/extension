/**
 * CBOR (taproot_support era) message unpacking.
 *
 * With the taproot_support protocol flag active, counterparty-core encodes
 * every composed message as CBOR and packs addresses in the modern prefix
 * format (0x01 P2PKH / 0x02 P2SH / 0x03 witness). These tests encode
 * payloads exactly as core's cbor2.dumps does and assert the unpackers
 * recover the composed parameters.
 *
 * Two fixtures come from mainnet compose calls: an XCP enhanced send to a
 * Taproot address, and a 16-byte LANDMARKS issuance.
 */

import { describe, it, expect } from 'vitest';
import { base58 } from '@scure/base';
import { unpackCounterpartyMessage } from '../index';
import { verifyTransaction } from '../verify';
import { unpackEnhancedSend } from '../messages/enhancedSend';
import { unpackIssuance } from '../messages/issuance';
import { unpackSweep } from '../messages/sweep';
import { unpackBroadcast } from '../messages/broadcast';
import { unpackFairmint } from '../messages/fairmint';
import { packAddress, unpackAddress } from '../address';
import { assetNameToId } from '../assetId';
import { decodeCbor } from '../cbor';

// --- Minimal CBOR encoder mirroring cbor2.dumps for the types core emits ---

function uintBytes(value: bigint, byteCount: number): number[] {
  const bytes: number[] = [];
  for (let i = byteCount - 1; i >= 0; i -= 1) {
    bytes.push(Number((value >> BigInt(8 * i)) & 0xffn));
  }
  return bytes;
}

function cborHead(majorType: number, value: bigint): number[] {
  const base = majorType << 5;
  if (value < 24n) return [base | Number(value)];
  if (value < 256n) return [base | 24, ...uintBytes(value, 1)];
  if (value < 65536n) return [base | 25, ...uintBytes(value, 2)];
  if (value < 4294967296n) return [base | 26, ...uintBytes(value, 4)];
  return [base | 27, ...uintBytes(value, 8)];
}

type Encodable = bigint | number | boolean | string | Uint8Array | null | Encodable[];

function encodeCbor(value: Encodable): number[] {
  if (value === null) return [0xf6];
  if (value === false) return [0xf4];
  if (value === true) return [0xf5];
  if (typeof value === 'bigint') {
    if (value < 0n) throw new Error('negative ints not needed in tests');
    return cborHead(0, value);
  }
  if (typeof value === 'number') {
    // Always encode JS numbers as float64, like cbor2.dumps does for floats.
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, value, false);
    return [0xfb, ...new Uint8Array(view.buffer)];
  }
  if (typeof value === 'string') {
    const bytes = new TextEncoder().encode(value);
    return [...cborHead(3, BigInt(bytes.length)), ...bytes];
  }
  if (value instanceof Uint8Array) {
    return [...cborHead(2, BigInt(value.length)), ...value];
  }
  const items = value.flatMap((item) => encodeCbor(item));
  return [...cborHead(4, BigInt(value.length)), ...items];
}

function payloadOf(value: Encodable): Uint8Array {
  return new Uint8Array(encodeCbor(value));
}

const CNTRPRTY = [0x43, 0x4e, 0x54, 0x52, 0x50, 0x52, 0x54, 0x59];

/** Modern (taproot_support) packed form of a mainnet P2PKH address. */
function modernPackP2pkh(address: string): Uint8Array {
  const hash = base58.decode(address).slice(1, -4);
  return new Uint8Array([0x01, ...hash]);
}

describe('modern packed address format', () => {
  const TAPROOT = 'bc1pcm9gfgcy8q45y4m0ryskyc5nczex8yn9jc5r0tpuacz897y5rlfqn2u02z';
  const P2PKH = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

  it('round-trips a Taproot address through the 0x03 witness packing', () => {
    const packed = packAddress(TAPROOT);
    expect(packed[0]).toBe(0x03);
    expect(packed[1]).toBe(0x01);
    expect(packed.length).toBe(34);
    expect(unpackAddress(packed)).toBe(TAPROOT);
  });

  it('unpacks a 0x01-prefixed P2PKH packing', () => {
    expect(unpackAddress(modernPackP2pkh(P2PKH))).toBe(P2PKH);
  });

  it('unpacks a 0x03-prefixed witness v0 packing', () => {
    const legacy = packAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4');
    // Legacy marker packing still round-trips.
    expect(unpackAddress(legacy)).toBe('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4');
    // Modern packing of the same program also unpacks.
    const program = legacy.slice(1);
    const modern = new Uint8Array([0x03, 0x00, ...program]);
    expect(unpackAddress(modern)).toBe('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4');
  });

  it('rejects a truncated witness packing', () => {
    expect(() => unpackAddress(new Uint8Array([0x03, 0x01, 0xaa]))).toThrow();
  });
});

describe('CBOR enhanced send', () => {
  const DESTINATION = 'bc1pcm9gfgcy8q45y4m0ryskyc5nczex8yn9jc5r0tpuacz897y5rlfqn2u02z';

  // The real 500 XCP send that v0.6.0 mis-verified: asset XCP (id 1),
  // quantity 50000000000, Taproot destination, no memo.
  function realSendPayload(): Uint8Array {
    return payloadOf([1n, 50000000000n, packAddress(DESTINATION), new Uint8Array(0)]);
  }

  it('unpacks the real-world XCP send to a Taproot address', () => {
    const data = unpackEnhancedSend(realSendPayload());
    expect(data.asset).toBe('XCP');
    expect(data.quantity).toBe(50000000000n);
    expect(data.destination).toBe(DESTINATION);
    expect(data.memo).toBeUndefined();
  });

  it('unpacks through the full message dispatcher', () => {
    const message = new Uint8Array([...CNTRPRTY, 0x02, ...realSendPayload()]);
    const result = unpackCounterpartyMessage(message);
    expect(result.success).toBe(true);
    expect(result.messageType).toBe('enhanced_send');
    expect((result.data as { destination: string }).destination).toBe(DESTINATION);
  });

  it('carries a memo through', () => {
    const memo = new TextEncoder().encode('hello');
    const data = unpackEnhancedSend(
      payloadOf([1n, 100n, packAddress(DESTINATION), memo])
    );
    expect(data.memo).toBe('hello');
  });
});

describe('CBOR issuance', () => {
  const LR_ISSUANCE = 22;
  const LR_SUBASSET = 23;

  it('unpacks the real-world 16-byte LANDMARKS issuance', () => {
    // asset LANDMARKS, quantity 21, indivisible, no lock/reset, empty
    // mime type, no description — encodes to exactly 16 bytes, one short
    // of the legacy parser's minimum.
    const payload = payloadOf([
      assetNameToId('LANDMARKS'), 21n, false, false, false, '', null,
    ]);
    expect(payload.length).toBe(16);

    const data = unpackIssuance(payload, LR_ISSUANCE);
    expect(data.asset).toBe('LANDMARKS');
    expect(data.quantity).toBe(21n);
    expect(data.divisible).toBe(false);
    expect(data.isLock).toBe(false);
    expect(data.isReset).toBe(false);
    expect(data.description).toBeUndefined();
  });

  it('takes lock/reset from the payload, not the message type', () => {
    const payload = payloadOf([
      assetNameToId('LANDMARKS'), 0n, true, true, false, '', null,
    ]);
    const data = unpackIssuance(payload, LR_ISSUANCE);
    expect(data.isLock).toBe(true);
    expect(data.isReset).toBe(false);
  });

  it('decodes a description', () => {
    const description = new TextEncoder().encode('hello world');
    const payload = payloadOf([
      assetNameToId('LANDMARKS'), 21n, true, false, false, 'text/plain', description,
    ]);
    expect(unpackIssuance(payload, LR_ISSUANCE).description).toBe('hello world');
  });

  it('unpacks a subasset issuance with a base-68 compacted longname', () => {
    // Port of core's compact_subasset_longname: base-68 big-endian integer
    // over SUBASSET_DIGITS with digit values 1..68.
    const DIGITS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-_@!';
    const longname = 'LANDMARKS.paris';
    let nameInt = 0n;
    for (const c of longname) {
      nameInt = nameInt * 68n + BigInt(DIGITS.indexOf(c) + 1);
    }
    const compactedBytes: number[] = [];
    let n = nameInt;
    while (n > 0n) {
      compactedBytes.unshift(Number(n & 0xffn));
      n >>= 8n;
    }
    const compacted = new Uint8Array(compactedBytes);

    const payload = payloadOf([
      assetNameToId('A95428956661682177'), 21n, 1n, 0n, 0n,
      BigInt(compacted.length), compacted, '', null,
    ]);
    const data = unpackIssuance(payload, LR_SUBASSET);
    expect(data.subassetLongname).toBe(longname);
    expect(data.divisible).toBe(true);
    expect(data.isLock).toBe(false);
  });
});

describe('CBOR sweep', () => {
  const DESTINATION = 'bc1pcm9gfgcy8q45y4m0ryskyc5nczex8yn9jc5r0tpuacz897y5rlfqn2u02z';

  it('unpacks a sweep with a text memo', () => {
    const payload = payloadOf([
      packAddress(DESTINATION), 3n, new TextEncoder().encode('sweep memo'),
    ]);
    const data = unpackSweep(payload);
    expect(data.destination).toBe(DESTINATION);
    expect(data.flags).toBe(3);
    expect(data.sweepBalances).toBe(true);
    expect(data.sweepOwnership).toBe(true);
    expect(data.memo).toBe('sweep memo');
  });

  it('unpacks a sweep with no memo', () => {
    const payload = payloadOf([packAddress(DESTINATION), 1n, new Uint8Array(0)]);
    const data = unpackSweep(payload);
    expect(data.destination).toBe(DESTINATION);
    expect(data.memo).toBeUndefined();
  });
});

describe('CBOR broadcast', () => {
  it('unpacks a broadcast with a float value', () => {
    const payload = payloadOf([
      1722000000n, 1.5, 0n, '', new TextEncoder().encode('price feed'),
    ]);
    const data = unpackBroadcast(payload);
    expect(data.timestamp).toBe(1722000000);
    expect(data.value).toBe(1.5);
    expect(data.feeFractionInt).toBe(0);
    expect(data.text).toBe('price feed');
  });

  it('unpacks a broadcast with an integer value', () => {
    const payload = payloadOf([1722000000n, 100n, 0n, '', new Uint8Array(0)]);
    expect(unpackBroadcast(payload).value).toBe(100);
  });
});

describe('CBOR fairmint', () => {
  it('unpacks an [asset_id, quantity] pair', () => {
    const data = unpackFairmint(payloadOf([1n, 1000n]));
    expect(data.asset).toBe('XCP');
    expect(data.quantity).toBe(1000n);
  });
});

describe('verifyTransaction over CBOR messages', () => {
  const DESTINATION = 'bc1pcm9gfgcy8q45y4m0ryskyc5nczex8yn9jc5r0tpuacz897y5rlfqn2u02z';

  it('passes a CBOR XCP send to a Taproot destination', () => {
    const payload = payloadOf([1n, 50000000000n, packAddress(DESTINATION), new Uint8Array(0)]);
    const message = new Uint8Array([...CNTRPRTY, 0x02, ...payload]);

    const result = verifyTransaction(message, 'send', {
      destination: DESTINATION,
      asset: 'XCP',
      quantity: 50000000000,
    });
    expect(result.criticalMismatches).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('passes a CBOR indivisible issuance', () => {
    const payload = payloadOf([
      assetNameToId('LANDMARKS'), 21n, false, false, false, '', null,
    ]);
    const message = new Uint8Array([...CNTRPRTY, 22, ...payload]);

    const result = verifyTransaction(message, 'issuance', {
      asset: 'LANDMARKS',
      quantity: 21,
      divisible: false,
    });
    expect(result.criticalMismatches).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('does not report a difference for a blank memo field against an absent memo', () => {
    // The send form submits an untouched memo input as "", and a composed send without a memo
    // unpacks it as undefined. Both mean "no memo"; reporting them as a mismatch put a
    // "differs from your request" warning on every plain send.
    const payload = payloadOf([1n, 50000000000n, packAddress(DESTINATION), new Uint8Array(0)]);
    const message = new Uint8Array([...CNTRPRTY, 0x02, ...payload]);

    const result = verifyTransaction(message, 'send', {
      destination: DESTINATION,
      asset: 'XCP',
      quantity: 50000000000,
      memo: '',
    });
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.infoMismatches).toEqual([]);
  });

  it('still flags a composed memo the request did not ask for', () => {
    const memoBytes = new TextEncoder().encode('planted memo');
    const payload = payloadOf([1n, 50000000000n, packAddress(DESTINATION), memoBytes]);
    const message = new Uint8Array([...CNTRPRTY, 0x02, ...payload]);

    const result = verifyTransaction(message, 'send', {
      destination: DESTINATION,
      asset: 'XCP',
      quantity: 50000000000,
      memo: '',
    });
    expect(result.infoMismatches.some((m) => m.field === 'memo')).toBe(true);
  });

  it('still flags a destination substitution', () => {
    const other = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
    const payload = payloadOf([1n, 50000000000n, modernPackP2pkh(other), new Uint8Array(0)]);
    const message = new Uint8Array([...CNTRPRTY, 0x02, ...payload]);

    const result = verifyTransaction(message, 'send', {
      destination: DESTINATION,
      asset: 'XCP',
      quantity: 50000000000,
    });
    expect(result.valid).toBe(false);
    expect(result.criticalMismatches.some((m) => m.field === 'destination')).toBe(true);
  });
});

describe('CBOR float decoding', () => {
  it('decodes half, single, and double precision', () => {
    expect(decodeCbor(new Uint8Array([0xf9, 0x3c, 0x00]))).toBe(1);
    expect(decodeCbor(new Uint8Array([0xfa, 0x3f, 0xc0, 0x00, 0x00]))).toBe(1.5);
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, 2.75, false);
    expect(decodeCbor(new Uint8Array([0xfb, ...new Uint8Array(view.buffer)]))).toBe(2.75);
  });
});
