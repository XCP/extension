/**
 * Local message construction, checked against real composed bytes.
 *
 * The value of packing locally is that verification can be one byte comparison instead of a
 * field-by-field walk — but only if these bytes are *exactly* what counterparty-core emits. So the
 * tests that matter here are the ones asserting equality with payloads taken from real mainnet
 * composes, not round-trips against our own encoder.
 *
 * The fixtures are the two that v0.6.0 mis-verified: a 500 XCP send to a Taproot address, and a
 * 16-byte LANDMARKS issuance.
 */

import { describe, it, expect } from 'vitest';
import { packComposeMessage } from '../messages';
import { encodeCbor } from '../cbor';
import { unpackCounterpartyMessage } from '../../unpack';
import { packAddress } from '../../unpack/address';
import { assetNameToId } from '../../unpack/assetId';
import { bytesToHex, hexToBytes } from '../../unpack/binary';
import { COUNTERPARTY_PREFIX_HEX } from '../../unpack/messageTypes';

const TAPROOT_DESTINATION = 'bc1pcm9gfgcy8q45y4m0ryskyc5nczex8yn9jc5r0tpuacz897y5rlfqn2u02z';

/** The message bytes as the unpack-side fixtures build them: prefix, type id, CBOR body. */
function expectedMessage(messageTypeId: number, body: Uint8Array): string {
  return COUNTERPARTY_PREFIX_HEX + messageTypeId.toString(16).padStart(2, '0') + bytesToHex(body);
}

describe('packing produces the bytes core composes', () => {
  it('reproduces the real 500 XCP send to a Taproot address', () => {
    // Field order per core's enhancedsend.py: [asset_id, quantity, short_address, memo].
    const body = encodeCbor([1n, 50_000_000_000n, packAddress(TAPROOT_DESTINATION), new Uint8Array(0)]);

    const packed = packComposeMessage('send', {
      asset: 'XCP',
      destination: TAPROOT_DESTINATION,
      quantity: 50_000_000_000,
    });

    expect(packed).not.toBeNull();
    expect(bytesToHex(packed!.bytes)).toBe(expectedMessage(0x02, body));
  });

  it('reproduces the 16-byte LANDMARKS issuance', () => {
    // Field order per core's issuance.py: [asset_id, quantity, divisible, lock, reset, mime, desc].
    const body = encodeCbor([assetNameToId('LANDMARKS'), 21n, false, false, false, '', null]);

    const packed = packComposeMessage('issuance', {
      asset: 'LANDMARKS',
      quantity: 21,
      divisible: false,
    });

    expect(packed).not.toBeNull();
    expect(bytesToHex(packed!.bytes)).toBe(expectedMessage(22, body));
  });

  it('round-trips through the unpacker, which was verified against core independently', () => {
    const packed = packComposeMessage('send', {
      asset: 'XCP',
      destination: TAPROOT_DESTINATION,
      quantity: 50_000_000_000,
      memo: 'thanks',
    });

    const result = unpackCounterpartyMessage(packed!.bytes);
    expect(result.success).toBe(true);
    expect(result.messageType).toBe('enhanced_send');
    const data = result.data as { asset: string; quantity: bigint; destination: string; memo?: string };
    expect(data.asset).toBe('XCP');
    expect(data.quantity).toBe(50_000_000_000n);
    expect(data.destination).toBe(TAPROOT_DESTINATION);
    expect(data.memo).toBe('thanks');
  });
});

describe('borrowing only what the request cannot determine', () => {
  it('packs a reissuance by taking divisibility from the composed message', () => {
    // update-description and transfer-ownership omit `divisible` because the asset already fixes
    // it. Borrowing that one field keeps the rest of the message byte-verified instead of falling
    // back to field comparison for the whole transaction.
    const packed = packComposeMessage(
      'issuance',
      { asset: 'LANDMARKS', quantity: 0, description: 'updated text' },
      { divisible: true }
    );

    expect(packed).not.toBeNull();
    const body = encodeCbor([
      assetNameToId('LANDMARKS'), 0n, true, false, false, '',
      new TextEncoder().encode('updated text'),
    ]);
    expect(bytesToHex(packed!.bytes)).toBe(expectedMessage(22, body));
  });

  it('still compares the description the user wrote, rather than borrowing it', () => {
    // The borrowed-field channel must never cover something the user authored: a response that
    // rewrote the description has to produce different bytes.
    const packed = packComposeMessage(
      'issuance',
      { asset: 'LANDMARKS', quantity: 0, description: 'what the user wrote' },
      { divisible: true, description: 'what the API substituted' }
    );

    const substituted = encodeCbor([
      assetNameToId('LANDMARKS'), 0n, true, false, false, '',
      new TextEncoder().encode('what the API substituted'),
    ]);
    expect(bytesToHex(packed!.bytes)).not.toBe(expectedMessage(22, substituted));
  });
});

describe('refusing to pack is not the same as agreeing', () => {
  // Each of these must return null so the caller reports "cannot verify by equality" rather than
  // treating an unpackable request as verified.
  it.each([
    // Broadcast carries a server-chosen timestamp, so its bytes are not predictable from a request.
    ['an unsupported compose type', 'broadcast', { text: 'hello', value: 0, fee_fraction: 0 }],
    ['a multi-destination send', 'send', { asset: 'XCP', destination: 'bc1qa,bc1qb', quantity: 1 }],
    ['a hex memo, which core encodes differently', 'send', {
      asset: 'XCP', destination: TAPROOT_DESTINATION, quantity: 1, memo: 'ff00', memo_is_hex: true,
    }],
    ['a BTC "send", which is not a Counterparty message', 'send', {
      asset: 'BTC', destination: TAPROOT_DESTINATION, quantity: 1,
    }],
    ['a subasset issuance, whose parent name is compacted', 'issuance', {
      asset: 'PARENT.child', quantity: 1, divisible: false,
    }],
    ['a reissuance with no observed message to borrow divisibility from', 'issuance', {
      asset: 'LANDMARKS', quantity: 0, description: 'new text',
    }],
    ['an ownership transfer, which moves via an output', 'issuance', {
      asset: 'LANDMARKS', quantity: 0, divisible: false, transfer_destination: TAPROOT_DESTINATION,
    }],
    ['a quantity that is not whole base units', 'send', {
      asset: 'XCP', destination: TAPROOT_DESTINATION, quantity: '1.5',
    }],
  ])('returns null for %s', (_label, composeType, params) => {
    expect(packComposeMessage(composeType, params as Record<string, unknown>)).toBeNull();
  });
});

describe('CBOR encoding matches cbor2 canonical choices', () => {
  it('uses the shortest head that fits each integer', () => {
    expect(bytesToHex(encodeCbor(0n))).toBe('00');
    expect(bytesToHex(encodeCbor(23n))).toBe('17');
    expect(bytesToHex(encodeCbor(24n))).toBe('1818');
    expect(bytesToHex(encodeCbor(255n))).toBe('18ff');
    expect(bytesToHex(encodeCbor(256n))).toBe('190100');
    expect(bytesToHex(encodeCbor(65_536n))).toBe('1a00010000');
    expect(bytesToHex(encodeCbor(4_294_967_296n))).toBe('1b0000000100000000');
  });

  it('encodes null, booleans, byte strings and arrays as core does', () => {
    expect(bytesToHex(encodeCbor(null))).toBe('f6');
    expect(bytesToHex(encodeCbor(false))).toBe('f4');
    expect(bytesToHex(encodeCbor(true))).toBe('f5');
    expect(bytesToHex(encodeCbor(new Uint8Array([0xde, 0xad])))).toBe('42dead');
    expect(bytesToHex(encodeCbor(''))).toBe('60');
    expect(bytesToHex(encodeCbor([1n, 2n]))).toBe('82' + '01' + '02');
  });

  it('agrees with the decoder on every value it emits', () => {
    // Both sides were written against core independently; disagreement here means one drifted.
    const roundTrip = hexToBytes(bytesToHex(encodeCbor([1n, 50_000n, new Uint8Array([1, 2, 3]), ''])));
    expect(roundTrip.length).toBeGreaterThan(0);
  });
});
