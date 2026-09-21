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

import { describe, expect, it } from 'vitest';
import { asBaseUnits } from '@/core/numeric';
import { unpackCounterpartyMessage } from '../../unpack';
import { packAddress } from '../../unpack/address';
import { assetNameToId } from '../../unpack/assetId';
import { bytesToHex, hexToBytes } from '../../unpack/binary';
import { COUNTERPARTY_PREFIX_HEX } from '../../unpack/messageTypes';
import { encodeCbor } from '../cbor';
import { packComposeMessage } from '../messages';

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
      quantity: asBaseUnits(21),
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
      { asset: 'JPJA.HELLOKITTY', quantity: asBaseUnits(1000), divisible: false, description: 'a subasset' },
      { messageTypeId: 23, assetId: 95428956661682177n }
    );

    expect(packed).not.toBeNull();
    expect(bytesToHex(packed!.bytes)).toBe(
      '434e54525052545917891b01530821671b10011903e80000000c4c05595523c6457390627d610b604a61207375626173736574'
    );
  });

  it('reproduces a divisible subasset issuance with no description', () => {
    const packed = packComposeMessage(
      'issuance',
      { asset: 'PEPE.rare-pepe_2026', quantity: 100_000_000, divisible: true },
      { messageTypeId: 23, assetId: 18446744073709551615n }
    );

    expect(packed).not.toBeNull();
    expect(bytesToHex(packed!.bytes)).toBe(
      '434e54525052545917891bffffffffffffffff1a05f5e1000100000f4f07e75b9a418da186050a715c3ec2e760f6'
    );
  });

  it('packs an ownership transfer as the reissuance message core composes for it', () => {
    // The new owner lives only in an output paying transfer_destination; the message is
    // byte-for-byte a reissuance, and the output policy pins the ownership output.
    const packed = packComposeMessage(
      'issuance',
      {
        asset: 'LANDMARKS', quantity: asBaseUnits(0), divisible: false,
        transfer_destination: TAPROOT_DESTINATION,
      }
    );

    expect(packed).not.toBeNull();
    const body = encodeCbor([assetNameToId('LANDMARKS'), 0n, false, false, false, '', null]);
    expect(bytesToHex(packed!.bytes)).toBe(expectedMessage(22, body));
  });
});

describe('packing matches bytes generated with core\'s MPMA encoder', () => {
  // These hexes come from running core's own `mpmaencoding` functions (copied verbatim, with
  // `address.pack_legacy` and the ledger asset lookup replaced by pure equivalents) under the
  // same bitstring library core uses.
  const P2PKH_A = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
  const P2PKH_B = '1CounterpartyXXXXXXXXXXXXXXXUWLpVr';
  const P2WPKH = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

  it('reproduces a two-asset MPMA send with no memos', () => {
    const packed = packComposeMessage('mpma', {
      assets: 'XCP,PEPECASH',
      destinations: `${P2PKH_A},${P2PKH_B}`,
      quantities: '100,500',
    });

    expect(packed).not.toBeNull();
    expect(bytesToHex(packed!.bytes)).toBe(
      '434e5452505254590300020062e907b15cbf27d5425399ebf6f0fb50ebb88f1800818895f3dc2c178629d3d2d8fa3ec4a3f81798214000000718588312d00000000000001f440000000000000004000000000000006400'
    );
  });

  it('reproduces a whole-send memo, encoded once ahead of the send lists', () => {
    const packed = packComposeMessage('mpma', {
      assets: 'XCP,XCP',
      destinations: `${P2PKH_A},${P2WPKH}`,
      quantities: '1,2',
      memo: 'thanks',
      memo_is_hex: false,
    });

    expect(packed).not.toBeNull();
    expect(bytesToHex(packed!.bytes)).toBe(
      '434e5452505254590300020062e907b15cbf27d5425399ebf6f0fb50ebb88f1880751e76e8199196d454941c45d1b3a323f1433bd6867468616e6b738000000000000000c000000000000000280000000000000010'
    );
  });

  it('reproduces per-send hex memos, pinning the is_hex bit and byte-length encoding', () => {
    const packed = packComposeMessage('mpma', {
      assets: 'XCP,XCP',
      destinations: `${P2PKH_A},${P2WPKH}`,
      quantities: '7,9',
      memos: 'beef,68656c6c6f',
      memos_are_hex: 'true,true',
    });

    expect(packed).not.toBeNull();
    expect(bytesToHex(packed!.bytes)).toBe(
      '434e5452505254590300020062e907b15cbf27d5425399ebf6f0fb50ebb88f1880751e76e8199196d454941c45d1b3a323f1433bd6400000000000000060000000000000007c2beef8000000000000004e2b432b636378'
    );
  });

  it('packs a hex memo alongside a send with no memo', () => {
    // The form emits one flag per row and a row with no memo emits `false`, so this batch arrives
    // as memos_are_hex="true,false". Only the flags belonging to an actual memo describe the
    // encoding, and `composeMPMA` sends the single flag `true` — so declining here would have
    // silently dropped byte verification for any batch where only some rows carry memos.
    const packed = packComposeMessage('mpma', {
      assets: 'XCP,XCP',
      destinations: `${P2PKH_A},${P2WPKH}`,
      quantities: '7,9',
      memos: 'beef,',
      memos_are_hex: 'true,false',
    });

    expect(packed).not.toBeNull();
    expect(bytesToHex(packed!.bytes)).toBe(
      '434e5452505254590300020062e907b15cbf27d5425399ebf6f0fb50ebb88f1880751e76e8199196d454941c45d1b3a323f1433bd6400000000000000060000000000000007c2beef80000000000000048'
    );
  });

  it('still declines memos that genuinely mix hex and text', () => {
    // Two real memos with different encodings cannot travel under core's single flag.
    expect(packComposeMessage('mpma', {
      assets: 'XCP,XCP',
      destinations: `${P2PKH_A},${P2WPKH}`,
      quantities: '7,9',
      memos: 'beef,hello',
      memos_are_hex: 'true,false',
    })).toBeNull();
  });

  it('packs the send form\'s comma-separated destinations as the same MPMA message', () => {
    // composeSendOrMPMA replicates the asset and quantity per destination and carries the memo
    // once as the whole-send memo; the fixture is core's encoding of exactly that request.
    const packed = packComposeMessage('send', {
      asset: 'XCP',
      destinations: `${P2PKH_A},${P2WPKH}`,
      quantity: asBaseUnits(1),
      memo: 'thanks',
    });

    expect(packed).not.toBeNull();
    expect(bytesToHex(packed!.bytes)).toBe(
      '434e5452505254590300020062e907b15cbf27d5425399ebf6f0fb50ebb88f1880751e76e8199196d454941c45d1b3a323f1433bd6867468616e6b738000000000000000c000000000000000280000000000000008'
    );
  });

  it('reproduces a single-destination send, whose count and index fields occupy no bits', () => {
    // One distinct destination makes nbits zero. Core's pinned bitstring (4.1.4) appends nothing
    // for a zero-width field — newer versions raise, so this shape looked uncomposable until the
    // fixture generator ran under the pin. Every recent on-chain MPMA is this shape.
    const packed = packComposeMessage('mpma', {
      assets: 'PEPECASH,XCP',
      destinations: `${P2PKH_A},${P2PKH_A}`,
      quantities: '5,3',
    });

    expect(packed).not.toBeNull();
    expect(bytesToHex(packed!.bytes)).toBe(
      '434e5452505254590300010062e907b15cbf27d5425399ebf6f0fb50ebb88f184000000718588312c0000000000000015000000000000000100000000000000030'
    );
  });

  it('round-trips through the MPMA unpacker, which was verified against core independently', () => {
    const packed = packComposeMessage('mpma', {
      assets: 'XCP,PEPECASH',
      destinations: `${P2PKH_A},${P2PKH_B}`,
      quantities: '100,500',
    });

    const result = unpackCounterpartyMessage(packed!.bytes);
    expect(result.success).toBe(true);
    expect(result.messageType).toBe('mpma_send');
    const data = result.data as { sends: Array<{ asset: string; destination: string; quantity: bigint }> };
    // The wire orders asset groups by name; each send keeps its request destination.
    expect(data.sends).toEqual([
      { asset: 'PEPECASH', destination: P2PKH_B, quantity: 500n },
      { asset: 'XCP', destination: P2PKH_A, quantity: 100n },
    ]);
  });
});

describe('inscription composes pack the same message, only carried differently', () => {
  it('hex-decodes binary content, so the packed message matches what core composes', () => {
    // An inscription's content reaches the API as hex when the MIME type is binary, because core
    // unhexlifies it (`helpers.content_to_bytes`). The message is otherwise an ordinary broadcast.
    const packed = packComposeMessage('broadcast', {
      text: '89504e470d0a1a0a', mime_type: 'image/png', inscription: 'true',
      value: '0', fee_fraction: '0', timestamp: 1722700000,
    });

    expect(packed).not.toBeNull();
    const body = encodeCbor([
      1722700000n, 0, 0n, 'image/png',
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ]);
    expect(bytesToHex(packed!.bytes)).toBe(expectedMessage(30, body));
  });

  it('encodes textual content as UTF-8 rather than hex', () => {
    const packed = packComposeMessage('broadcast', {
      text: 'hello', mime_type: 'text/plain', inscription: 'true',
      value: '0', fee_fraction: '0', timestamp: 1722700000,
    });

    const body = encodeCbor([
      1722700000n, 0, 0n, 'text/plain', new TextEncoder().encode('hello'),
    ]);
    expect(bytesToHex(packed!.bytes)).toBe(expectedMessage(30, body));
  });
});

describe('borrowing only what the request cannot determine', () => {
  it('packs the explicit parent of a subasset fairminter', () => {
    const packed = packComposeMessage('fairminter', {
      asset: 'A95428956661682177',
      asset_parent: 'PEPECASH',
      max_mint_per_tx: 1,
    });

    expect(packed).not.toBeNull();
    const decoded = unpackCounterpartyMessage(packed!.bytes);
    expect(decoded.success).toBe(true);
    expect(decoded.data).toMatchObject({
      asset: 'A95428956661682177',
      assetParent: 'PEPECASH',
      maxMintPerTx: 1n,
    });
  });

  it('packs a reissuance by taking divisibility from the composed message', () => {
    // update-description and transfer-ownership omit `divisible` because the asset already fixes
    // it. Borrowing that one field keeps the rest of the message byte-verified instead of falling
    // back to field comparison for the whole transaction.
    const packed = packComposeMessage(
      'issuance',
      { asset: 'LANDMARKS', quantity: asBaseUnits(0), description: 'updated text' },
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
        { asset: 'JPJA.HELLOKITTY', quantity: asBaseUnits(1000), divisible: false },
        { messageTypeId: 23, assetId }
      )).toBeNull();
    }
  });

  it('still compares the description the user wrote, rather than borrowing it', () => {
    // The borrowed-field channel must never cover something the user authored: a response that
    // rewrote the description has to produce different bytes.
    const packed = packComposeMessage(
      'issuance',
      { asset: 'LANDMARKS', quantity: asBaseUnits(0), description: 'what the user wrote' },
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
    // attach used to sit here; it is packable now. bet is not, and core still parses it.
    ['an unsupported compose type', 'bet', { feed_address: 'bc1qa', bet_type: 2, wager_quantity: asBaseUnits(1) }],
    ['a multi-destination send', 'send', { asset: 'XCP', destination: 'bc1qa,bc1qb', quantity: asBaseUnits(1) }],
    ['a hex memo, which core encodes differently', 'send', {
      asset: 'XCP', destination: TAPROOT_DESTINATION, quantity: asBaseUnits(1), memo: 'ff00', memo_is_hex: true,
    }],
    ['a BTC "send", which is not a Counterparty message', 'send', {
      asset: 'BTC', destination: TAPROOT_DESTINATION, quantity: asBaseUnits(1),
    }],
    ['a subasset issuance with no composed message to borrow the asset id from', 'issuance', {
      asset: 'PARENT.child', quantity: asBaseUnits(1), divisible: false,
    }],
    ['a broadcast with no timestamp and no composed message to borrow one from', 'broadcast', {
      text: 'hello', value: 0, fee_fraction: 0,
    }],
    // timestamp=0 asks the server to continue the feed from ledger state, which is unknowable here.
    ['a broadcast that lets the server continue the feed', 'broadcast', {
      text: 'hello', value: 0, fee_fraction: 0, timestamp: 0,
    }],
    // Binary content rides the request as hex; anything else is not what core would unhexlify.
    ['a binary-mime broadcast whose content is not hex', 'broadcast', {
      text: 'not hex at all', mime_type: 'image/png', inscription: 'true', timestamp: 1722700000,
    }],
    // At nbits zero (one distinct destination) the count field has no bits, so a second send of
    // the same asset is not expressible; core's own encoder would raise on `uint:0=1`.
    ['an MPMA send repeating an asset to one distinct destination', 'mpma', {
      assets: 'XCP,XCP',
      destinations: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa,1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      quantities: '1,2',
    }],
    // A 32-byte witness program does not fit the 21-byte legacy LUT slot.
    ['an MPMA send to a Taproot destination', 'mpma', {
      assets: 'XCP,XCP',
      destinations: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa,'
        + 'bc1pcm9gfgcy8q45y4m0ryskyc5nczex8yn9jc5r0tpuacz897y5rlfqn2u02z',
      quantities: '1,2',
    }],
    // Core's encoder silently drops a memo its 6-bit length cannot carry; declining is the
    // honest mirror — agreeing with a message that ignored the memo would verify a substitution.
    ['an MPMA memo longer than 63 bytes', 'mpma', {
      assets: 'XCP,XCP',
      destinations: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa,1CounterpartyXXXXXXXXXXXXXXXUWLpVr',
      quantities: '1,2',
      memos: `${'x'.repeat(64)},`,
      memos_are_hex: 'false,false',
    }],
    ['an MPMA hex memo with an odd length', 'mpma', {
      assets: 'XCP,XCP',
      destinations: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa,1CounterpartyXXXXXXXXXXXXXXXUWLpVr',
      quantities: '1,2',
      memos: 'abc,',
      memos_are_hex: 'true,true',
    }],
    // One memos_are_hex flag covers every memo on the API, so a mix is not expressible.
    ['MPMA memos mixing hex and text', 'mpma', {
      assets: 'XCP,XCP',
      destinations: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa,1CounterpartyXXXXXXXXXXXXXXXUWLpVr',
      quantities: '1,2',
      memos: 'beef,hello',
      memos_are_hex: 'true,false',
    }],
    // A subasset in the list resolves to its numeric id through the ledger.
    ['an MPMA send that includes a subasset', 'mpma', {
      assets: 'XCP,PARENT.child',
      destinations: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa,1CounterpartyXXXXXXXXXXXXXXXUWLpVr',
      quantities: '1,2',
    }],
    ['an MPMA send that includes BTC', 'mpma', {
      assets: 'XCP,BTC',
      destinations: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa,1CounterpartyXXXXXXXXXXXXXXXUWLpVr',
      quantities: '1,2',
    }],
    ['a reissuance with no observed message to borrow divisibility from', 'issuance', {
      asset: 'LANDMARKS', quantity: asBaseUnits(0), description: 'new text',
    }],
    ['a quantity that is not whole base units', 'send', {
      asset: 'XCP', destination: TAPROOT_DESTINATION, quantity: asBaseUnits('1.5'),
    }],
    // Current Core's `/compose/movetoutxo` action is message-less (`move.py`); type 100 belongs to
    // the historical `utxo.py` message and must not be expected from this compose route.
    ['a current move-to-UTXO compose', 'move', {
      source: `${'a'.repeat(64)}:0`, destination: TAPROOT_DESTINATION, asset: 'XCP', quantity: 1,
    }],
  ])('returns null for %s', (_label, composeType, params) => {
    expect(packComposeMessage(composeType, params as Record<string, unknown>)).toBeNull();
  });

  it('packs a locked subasset, the most common issuance shape on the chain', () => {
    // Declining this once sent it to a fallback that compared "PARENT.child" against the numeric
    // asset name and called the difference critical, so locking a subasset failed outright. Byte
    // equality covers the flags, quantity, longname and description; only the borrowed id is
    // beyond any local check, and declining never changed that.
    const packed = packComposeMessage(
      'issuance',
      { asset: 'JPJA.HELLOKITTY', quantity: asBaseUnits(1000), divisible: false, lock: true },
      { messageTypeId: 23, assetId: 95428956661682177n }
    );

    expect(packed).not.toBeNull();
    const decoded = unpackCounterpartyMessage(packed!.bytes);
    const data = decoded.data as { subassetLongname?: string; isLock?: boolean };
    expect(data.subassetLongname).toBe('JPJA.HELLOKITTY');
    expect(data.isLock).toBe(true);
  });
});

describe('subasset reissuance borrows the ledger-resolved asset id', () => {
  it('packs a description update in the standard layout under the borrowed id', () => {
    // Core resolves PARENT.child to its numeric asset through the ledger and composes the
    // standard layout; the id is borrowed, and every field the user authored is byte-compared.
    const packed = packComposeMessage(
      'issuance',
      { asset: 'PARENT.child', quantity: asBaseUnits(0), description: 'updated text' },
      { messageTypeId: 22, assetId: 95428956661682177n, divisible: true }
    );

    expect(packed).not.toBeNull();
    const body = encodeCbor([
      95428956661682177n, 0n, true, false, false, '',
      new TextEncoder().encode('updated text'),
    ]);
    expect(bytesToHex(packed!.bytes)).toBe(expectedMessage(22, body));
  });

  it('still compares the description against what the user wrote', () => {
    const packed = packComposeMessage(
      'issuance',
      { asset: 'PARENT.child', quantity: asBaseUnits(0), description: 'what the user wrote' },
      { messageTypeId: 22, assetId: 95428956661682177n, divisible: true, description: 'substituted' }
    );

    const substituted = encodeCbor([
      95428956661682177n, 0n, true, false, false, '',
      new TextEncoder().encode('substituted'),
    ]);
    expect(bytesToHex(packed!.bytes)).not.toBe(expectedMessage(22, substituted));
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

describe('the compose types that carry no message', () => {
  /**
   * The composer refuses a transaction that carries no payload when this function can build one
   * (`composer-context.tsx`), so whether it returns null decides whether a legitimate compose is
   * blocked. These are the types whose transactions correctly have no Counterparty message at all.
   */
  const BECH32 = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
  const P2PKH = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

  it('a BTC send builds no message', () => {
    // packEnhancedSend stops at asset id 0 — BTC is not a Counterparty send.
    expect(packComposeMessage('send', { asset: 'BTC', destination: BECH32, quantity: '50000' }))
      .toBeNull();
  });

  it('a BTC send to several destinations builds no message either', () => {
    // This one goes through the MPMA packer rather than packEnhancedSend, so it needs its own case.
    expect(packComposeMessage('send', {
      asset: 'BTC',
      destinations: `${BECH32},${P2PKH}`,
      quantity: '50000',
    })).toBeNull();
  });

  it('a burn builds no message', () => {
    expect(packComposeMessage('burn', { quantity: '50000' })).toBeNull();
  });

  it('an asset send does build one, so the guard has something to compare', () => {
    expect(packComposeMessage('send', { asset: 'XCP', destination: BECH32, quantity: '50000' }))
      .not.toBeNull();
  });
});
