/**
 * Cases where this decoder and counterparty-core previously disagreed about the same bytes.
 *
 * A disagreement here is the worst class of defect the wallet can have: the approval screen
 * describes one thing and the chain records another, with both halves chosen by whoever built the
 * transaction. Each case below is pinned to the core source that defines the behaviour.
 */

import { describe, expect, it } from 'vitest';
import { unpackAddress, unpackAddressLegacy } from '@/core/counterparty/unpack/address';
import { unpackBroadcast } from '@/core/counterparty/unpack/messages/broadcast';
import { encodeCbor } from '@/core/counterparty/pack/cbor';
import { compactSubassetLongname } from '@/core/counterparty/pack/messages';
import { unpackIssuance } from '@/core/counterparty/unpack/messages/issuance';

/** ">IdI" header: timestamp, value (float64 BE), fee_fraction_int. */
function broadcastHeader(timestamp = 1735689600, value = 0, feeFractionInt = 0): number[] {
  const head = new Uint8Array(16);
  const view = new DataView(head.buffer);
  view.setUint32(0, timestamp, false);
  view.setFloat64(4, value, false);
  view.setUint32(12, feeFractionInt, false);
  return Array.from(head);
}

const ascii = (s: string): number[] => Array.from(new TextEncoder().encode(s));


/** CBOR subasset issuance: [asset_id, quantity, divisible, lock, reset, len, name, mime, desc]. */
function cborSubasset(compactedName: Uint8Array): Uint8Array {
  return encodeCbor([
    95428956661682177n, 1000n, true, false, false,
    BigInt(compactedName.length), compactedName, '', new TextEncoder().encode('d'),
  ]);
}

describe('broadcast text — core takes the tail', () => {
  it('reads a well-formed varint-prefixed text', () => {
    const payload = new Uint8Array([...broadcastHeader(), 3, ...ascii('ABC')]);
    expect(unpackBroadcast(payload).text).toBe('ABC');
  });

  it('takes the last textlen bytes when the payload is padded, as core does', () => {
    // broadcast.py: `text = rawtext[-textlen:]` then `assert len(text) == textlen`. Core accepts
    // this message and records "DEF"; slicing from just after the prefix would show "ABC".
    const payload = new Uint8Array([...broadcastHeader(), 3, ...ascii('ABCDEF')]);
    expect(unpackBroadcast(payload).text).toBe('DEF');
  });

  it('treats a zero length as no text', () => {
    const payload = new Uint8Array([...broadcastHeader(), 0]);
    expect(unpackBroadcast(payload).text).toBe('');
  });

  it('refuses a length that cannot fit rather than inventing text', () => {
    // Core's assert fails here, so there is no honest reading of these bytes.
    const payload = new Uint8Array([...broadcastHeader(), 200, ...ascii('short')]);
    expect(() => unpackBroadcast(payload)).toThrow(/does not fit/);
  });

  it('handles a multi-byte varint length', () => {
    // 0xfd introduces a 2-byte little-endian length. 300 bytes of text.
    const text = 'x'.repeat(300);
    const payload = new Uint8Array([...broadcastHeader(), 0xfd, 0x2c, 0x01, ...ascii(text)]);
    expect(unpackBroadcast(payload).text).toBe(text);
  });
});

describe('legacy issuance — ">QQ???" since block 753500', () => {
  /** asset_id, quantity, divisible, lock, reset, then description. */
  function issuance(lock: number, reset: number, description: string): Uint8Array {
    const head = new Uint8Array(19);
    const view = new DataView(head.buffer);
    view.setBigUint64(0, 95428956661682177n, false); // a valid numeric asset id
    view.setBigUint64(8, 1000n, false);
    head[16] = 1; // divisible
    head[17] = lock;
    head[18] = reset;
    return new Uint8Array([...head, ...ascii(description)]);
  }

  it('reads lock and reset from the wire, not from the message type id', () => {
    // A type 20 carrying lock=1 previously reported false, because isLock was derived from the
    // type id. issuance.py unpacks lock and reset from these bytes.
    const locked = unpackIssuance(issuance(1, 0, 'hello'), 20);
    expect(locked.isLock).toBe(true);
    expect(locked.isReset).toBe(false);

    const unlocked = unpackIssuance(issuance(0, 1, 'hello'), 22);
    expect(unlocked.isLock).toBe(false);
    expect(unlocked.isReset).toBe(true);
  });

  it('keeps the whole description', () => {
    // The old code consumed lock, reset and seven description bytes as callable/call_date/
    // call_price, so the description lost its first characters and the call fields were invented.
    const result = unpackIssuance(issuance(0, 0, 'A memorable description'), 20);
    expect(result.description).toBe('A memorable description');
    expect(result.callable).toBeUndefined();
    expect(result.callDate).toBeUndefined();
  });

  it('reads a subasset name length at offset 19, after lock and reset', () => {
    // ">QQ???B" — the length byte follows reset. Reading it at 17 read the lock byte as a length.
    const name = [0x01, 0x02, 0x03];
    const payload = new Uint8Array([
      ...issuance(0, 0, ''),
      name.length,
      ...name,
      ...ascii('desc'),
    ]);
    const result = unpackIssuance(payload, 21);
    expect(result.description).toBe('desc');
  });

  it('refuses a subasset name length that overruns the payload', () => {
    // Core raises UnpackError when description_length < 0 rather than skipping the name.
    const payload = new Uint8Array([...issuance(0, 0, ''), 40, ...ascii('short')]);
    expect(() => unpackIssuance(payload, 21)).toThrow(/exceeds/);
  });
});

describe('mpma address table — core decodes it with legacy rules only', () => {
  it('reads a leading 0x01 as a base58 version byte, not as a modern P2PKH tag', () => {
    // utils/mpmaencoding.py _decode_decode_lut calls address.unpack_legacy unconditionally, never
    // the taproot-aware unpack. Under the modern rules 0x01 is a P2PKH type tag and this renders
    // as an ordinary '1…' address; core base58-encodes it under version 0x01 and credits a
    // different one. An MPMA carries its recipients in the payload, so the approval screen has no
    // second source to contradict a wrong string.
    const hash160 = new Uint8Array(20).fill(0xab);
    const packed = new Uint8Array([0x01, ...hash160]);

    // 0x01 is not one of the four defined base58 versions, so it is refused rather than rendered.
    expect(() => unpackAddressLegacy(packed)).toThrow(/version byte/);

    // The modern unpacker is what used to be called here, and it happily produces an address.
    expect(unpackAddress(packed).startsWith('1')).toBe(true);
  });

  it('still decodes ordinary legacy entries', () => {
    const hash160 = new Uint8Array(20).fill(0x11);
    expect(unpackAddressLegacy(new Uint8Array([0x00, ...hash160])).startsWith('1')).toBe(true);
    expect(unpackAddressLegacy(new Uint8Array([0x05, ...hash160])).startsWith('3')).toBe(true);
  });

  it('decodes a 0x80-marked segwit entry as bech32, as core does', () => {
    const program = new Uint8Array(20).fill(0x22);
    expect(unpackAddressLegacy(new Uint8Array([0x80, ...program])).startsWith('bc1q')).toBe(true);
  });
});

describe('subasset longname — canonical compaction only', () => {
  it('refuses a zero-padded compaction that expands to the same name', () => {
    // Distinct byte strings expand to the same longname, so without re-compacting and comparing,
    // a familiar name renders here for bytes core refuses to unpack. Core raises deliberately
    // outside its own legacy fallback so the rejection cannot be swallowed.
    const canonical = compactSubassetLongname('sub')!;
    const padded = new Uint8Array([0x00, ...canonical]);

    // Both expand to the same string...
    expect(padded.length).toBeGreaterThan(canonical.length);

    // ...but only the minimal encoding is accepted.
    expect(() => unpackIssuance(cborSubasset(canonical), 21)).not.toThrow();
    expect(() => unpackIssuance(cborSubasset(padded), 21)).toThrow(/non-canonical/i);
  });
});
