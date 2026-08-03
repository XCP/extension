/**
 * CBOR/legacy encoding ambiguity.
 *
 * The two wire encodings are not distinguishable by inspection: a legacy asset
 * id can begin with a byte that is also a valid CBOR array header. Unpackers
 * therefore try CBOR first and fall back to legacy, matching counterparty-core's
 * unpack order. That precedence decides which of two readings the user is shown,
 * so these tests pin it with payloads that are genuinely valid under BOTH
 * readings, and with payloads that merely look CBOR-ish and must fall back.
 *
 * Enhanced send is the representative case: its legacy layout (asset id,
 * quantity, packed address, memo) is permissive enough for a real CBOR message
 * to double as a parseable legacy struct.
 */

import { describe, it, expect } from 'vitest';
import { unpackEnhancedSend } from '../messages/enhancedSend';
import { unpackAddress } from '../address';
import { assetIdToName } from '../assetId';

describe('CBOR-first precedence on an ambiguous enhanced send', () => {
  // A CBOR enhanced send [asset_id, quantity, address, memo], hand-laid so the
  // same 42 bytes also parse as a legacy struct:
  //
  //   CBOR reading                          legacy reading (fixed offsets)
  //   ------------------------------------  -----------------------------------
  //   0x84            array(4)              bytes 0-7   asset id 0x841b…0f
  //   0x1b + 8 bytes  asset id 1_000_000    bytes 8-15  quantity 0x42401b…
  //   0x1b + 8 bytes  quantity 100          bytes 16-36 address (starts 0x00 ✓)
  //   0x55 + 21 bytes packed P2PKH address  bytes 37-41 memo
  //   0x40            empty memo
  //
  // The legacy address column starts at byte 16, which lands inside the CBOR
  // quantity's zero padding — a version byte 0x00, so the legacy reading
  // unpacks a plausible P2PKH destination of its own.
  const cborAddress = new Uint8Array([0x00, ...Array(20).fill(0x11)]);
  const payload = new Uint8Array([
    0x84,
    0x1b, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0f, 0x42, 0x40, // asset id 1_000_000
    0x1b, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x64, // quantity 100
    0x55, ...cborAddress,
    0x40,
  ]);

  it('is genuinely ambiguous: the legacy reading also yields a valid address', () => {
    // Not a tautology — proves the fixture would decode either way, so the
    // assertion below is exercising precedence, not a parse failure.
    const legacyDestination = unpackAddress(payload.slice(16, 37));
    expect(legacyDestination).toMatch(/^1/);
    expect(legacyDestination).not.toBe(unpackAddress(cborAddress));
  });

  it('decodes as the CBOR reading, matching core, not the legacy one', () => {
    const result = unpackEnhancedSend(payload);

    expect(result.assetId).toBe(1_000_000n);
    expect(result.asset).toBe(assetIdToName(1_000_000n));
    expect(result.quantity).toBe(100n);
    expect(result.destination).toBe(unpackAddress(cborAddress));
    expect(result.memo).toBeUndefined();

    // And explicitly not the legacy reading's fields.
    expect(result.assetId).not.toBe(0x841b0000_0000000fn);
    expect(result.destination).not.toBe(unpackAddress(payload.slice(16, 37)));
  });
});

describe('legacy fallback when the payload only looks like CBOR', () => {
  it('falls back to legacy for an asset id that begins with a CBOR array header', () => {
    // A real legacy enhanced send whose numeric asset id starts 0x84. The CBOR
    // attempt reads an array of four zero-valued integers and then chokes on
    // the 32 trailing bytes, so the fallback must recover the legacy fields.
    const legacyAddress = new Uint8Array([0x00, ...Array(20).fill(0x22)]);
    const payload = new Uint8Array([
      0x84, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, // asset id 0x8400000000000001
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0xf4, // quantity 500
      ...legacyAddress,
    ]);

    const result = unpackEnhancedSend(payload);

    expect(result.assetId).toBe(0x8400000000000001n);
    expect(result.asset).toBe(assetIdToName(0x8400000000000001n));
    expect(result.quantity).toBe(500n);
    expect(result.destination).toBe(unpackAddress(legacyAddress));
    expect(result.memo).toBeUndefined();
  });
});
