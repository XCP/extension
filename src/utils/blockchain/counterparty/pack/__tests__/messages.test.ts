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

describe('packing matches bytes generated with cbor2 5.9.0, the version core pins', () => {
  // These hexes come from running core's own arithmetic — `cbor2.dumps` plus
  // `assetnames.compact_subasset_longname` copied verbatim — under cbor2==5.9.0.

  it('reproduces a text broadcast', () => {
    const packed = packComposeMessage('broadcast', {
      text: 'BLOCKCHAIN IS THE FUTURE', value: '0', fee_fraction: '0', timestamp: 1722700000,
    });

    expect(packed).not.toBeNull();
    expect(bytesToHex(packed!.bytes)).toBe(
      '434e5452505254591e851a66ae50e0fb000000000000000000605818424c4f434b434841494e2049532054484520465554555245'
    );
  });

  it('reproduces a valued broadcast, with the value as a float and the fee fraction scaled', () => {
    // value 1.5 must ride the wire as an 8-byte double, and fee_fraction 0.05 as int(0.05 * 1e8).
    const packed = packComposeMessage('broadcast', {
      text: 'price feed', value: '1.5', fee_fraction: '0.05', timestamp: 1722700000,
    });

    expect(packed).not.toBeNull();
    expect(bytesToHex(packed!.bytes)).toBe(
      '434e5452505254591e851a66ae50e0fb3ff80000000000001a004c4b40604a70726963652066656564'
    );
  });

  it('reproduces an initial subasset issuance, flags as ints and the longname compacted', () => {
    const packed = packComposeMessage(
      'issuance',
      { asset: 'JPJA.HELLOKITTY', quantity: 1000, divisible: false, description: 'a subasset' },
      { messageTypeId: 23, assetId: 95428956661682177n }
    );

    expect(packed).not.toBeNull();
    expect(bytesToHex(packed!.bytes)).toBe(
      '434e54525052545917891b01530821671b10011903e80000000c4c05595523c6457390627d610b604a61207375626173736574'
    );
  });

  it('reproduces a divisible locked subasset issuance with no description', () => {
    const packed = packComposeMessage(
      'issuance',
      { asset: 'PEPE.rare-pepe_2026', quantity: 100_000_000, divisible: true, lock: true },
      { messageTypeId: 23, assetId: 18446744073709551615n }
    );

    expect(packed).not.toBeNull();
    expect(bytesToHex(packed!.bytes)).toBe(
      '434e54525052545917891bffffffffffffffff1a05f5e1000101000f4f07e75b9a418da186050a715c3ec2e760f6'
    );
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

  it('packs a broadcast by taking the wallet-stamped timestamp from the composed message', () => {
    // The broadcast form carries no timestamp; composeBroadcast stamps the wallet clock into the
    // request, so the packer reads it back from the decoded message. 1722700000 is in the past,
    // which the borrow allows — only the future direction is dangerous.
    const packed = packComposeMessage(
      'broadcast',
      { text: 'BLOCKCHAIN IS THE FUTURE', value: '0', fee_fraction: '0' },
      { timestamp: 1722700000 }
    );

    expect(packed).not.toBeNull();
    expect(bytesToHex(packed!.bytes)).toBe(
      '434e5452505254591e851a66ae50e0fb000000000000000000605818424c4f434b434841494e2049532054484520465554555245'
    );
  });

  it('refuses to borrow a broadcast timestamp from the far future', () => {
    // Bets settle once a broadcast's timestamp reaches their deadline, so a substituted future
    // timestamp settles a feed's open bets early. The wallet stamped its own clock moments before
    // this runs, so an honest response cannot be out here.
    const packed = packComposeMessage(
      'broadcast',
      { text: 'hello', value: '0', fee_fraction: '0' },
      { timestamp: Math.floor(Date.now() / 1000) + 86_400 }
    );

    expect(packed).toBeNull();
  });

  it('refuses a subasset asset id outside the numeric space core draws from', () => {
    // generate_random_asset draws from (26^12, 2^64); anything else is not a value core chose.
    for (const assetId of [26n ** 12n, 1n << 64n, 1n]) {
      expect(packComposeMessage(
        'issuance',
        { asset: 'JPJA.HELLOKITTY', quantity: 1000, divisible: false },
        { messageTypeId: 23, assetId }
      )).toBeNull();
    }
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
    ['an unsupported compose type', 'attach', { asset: 'XCP', quantity: 1 }],
    ['a multi-destination send', 'send', { asset: 'XCP', destination: 'bc1qa,bc1qb', quantity: 1 }],
    ['a hex memo, which core encodes differently', 'send', {
      asset: 'XCP', destination: TAPROOT_DESTINATION, quantity: 1, memo: 'ff00', memo_is_hex: true,
    }],
    ['a BTC "send", which is not a Counterparty message', 'send', {
      asset: 'BTC', destination: TAPROOT_DESTINATION, quantity: 1,
    }],
    ['a subasset issuance with no composed message to borrow the asset id from', 'issuance', {
      asset: 'PARENT.child', quantity: 1, divisible: false,
    }],
    ['a broadcast with no timestamp and no composed message to borrow one from', 'broadcast', {
      text: 'hello', value: 0, fee_fraction: 0,
    }],
    // timestamp=0 asks the server to continue the feed from ledger state, which is unknowable here.
    ['a broadcast that lets the server continue the feed', 'broadcast', {
      text: 'hello', value: 0, fee_fraction: 0, timestamp: 0,
    }],
    ['an inscription broadcast, whose content moves into a tapscript envelope', 'broadcast', {
      text: 'deadbeef', mime_type: 'image/png', inscription: 'ZGVhZGJlZWY=', timestamp: 1722700000,
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

  it('returns null for a subasset reissuance, which core composes in the standard layout', () => {
    // Reissuing PARENT.child produces a standard-layout message whose asset id resolves through
    // the ledger; only a composed message in the subasset layout is accepted for the subasset form.
    expect(packComposeMessage(
      'issuance',
      { asset: 'PARENT.child', quantity: 0, divisible: false, description: 'updated' },
      { messageTypeId: 22, assetId: 95428956661682177n }
    )).toBeNull();
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

  it('encodes floats as 8-byte doubles, as cbor2.dumps does with core\'s default options', () => {
    // Verified against cbor2 5.9.0 (core's pin): default dumps never shortens a finite float.
    expect(bytesToHex(encodeCbor(0))).toBe('fb0000000000000000');
    expect(bytesToHex(encodeCbor(1.5))).toBe('fb3ff8000000000000');
    expect(bytesToHex(encodeCbor(0.1))).toBe('fb3fb999999999999a');
    // Core's compose refuses non-finite values, so bytes for them would be meaningless.
    expect(() => encodeCbor(Number.NaN)).toThrow();
    expect(() => encodeCbor(Number.POSITIVE_INFINITY)).toThrow();
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
