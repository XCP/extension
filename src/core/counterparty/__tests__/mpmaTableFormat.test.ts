/**
 * The MPMA address table on both sides of `mpma_taproot_support`, held to core's own bytes.
 *
 * Every vector below was produced by core 11.4.0's `mpmaencoding._encode_mpma_send`, run inside
 * the published `counterparty/counterparty:v11.4.0` image on mainnet settings, once at block
 * 971,699 (the legacy table) and once at 971,700 (the length-prefixed one), and decoded back with
 * core's `_decode_mpma_send_decode` at the same heights. Asset ids come from core's
 * `generate_asset_id`, standing in for the ledger lookup. Addresses were built from fixed hashes
 * with core's Rust `utils.unpack_address`, so each is a real mainnet address of its kind. Where
 * core's compose refuses a destination before activation (a Taproot or P2WSH recipient, whose
 * packing is over 22 bytes) there is no legacy vector.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeMemoList } from '@/core/counterparty/memo';
import {
  MPMA_ACTIVATION_NOTICE_BLOCKS,
  MPMA_TAPROOT_SUPPORT_HEIGHTS,
  type MpmaTableFormat,
  mpmaNearsActivation,
  mpmaTableFormatAt,
  mpmaTableWarning,
  resolveMpmaTableFormat,
} from '@/core/counterparty/mpmaTableFormat';
import { composesAsMpma, packComposeMessage } from '@/core/counterparty/pack/messages';
import { unpackCounterpartyMessage } from '@/core/counterparty/unpack';
import { packAddressLegacy } from '@/core/counterparty/unpack/address';
import { bytesToHex, hexToBytes } from '@/core/counterparty/unpack/binary';
import type { MPMAData } from '@/core/counterparty/unpack/messages/mpma';
import { COUNTERPARTY_PREFIX_HEX } from '@/core/counterparty/unpack/messageTypes';

vi.mock('@/core/counterparty/capabilities', () => ({ fetchCounterpartyServerInfo: vi.fn() }));
vi.mock('@/core/bitcoin/blockHeight', () => ({ getCurrentBlockHeight: vi.fn() }));

const { fetchCounterpartyServerInfo } = await import('@/core/counterparty/capabilities');
const { getCurrentBlockHeight } = await import('@/core/bitcoin/blockHeight');

const P2PKH = '12ZEw5Hcv1hTb6YUQJ69y1V7uhcoDz92PH';
const P2PKH2 = '112D2adLM3UKy4Z4giRbReR6gjWuvHUqB';
const P2SH = '34oVnh4gNviJGMnNvgquMeLAxvXJuaRVMZ';
const P2WPKH = 'bc1qxvenxvenxvenxvenxvenxvenxvenxven2ymjt8';
const P2WSH = 'bc1qg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zqd8sxw4';
const P2TR = 'bc1p242424242424242424242424242424242424242424242424242su9uzu8';

/** One send as core's encoder takes it: asset, destination, quantity, and optionally memo and is_hex. */
type CoreSend = [asset: string, destination: string, quantity: number, memo?: string, memoIsHex?: boolean];

interface CoreVector {
  name: string;
  sends: CoreSend[];
  memo?: string;
  memoIsHex?: boolean;
  /** Core's message body at block 971,699; null where core's compose refuses the request there. */
  legacy: string | null;
  /** Core's message body at block 971,700. */
  lengthPrefixed: string;
}

const CORE_VECTORS: CoreVector[] = [
  {
    name: 'two P2PKH recipients',
    sends: [['XCP', P2PKH, 100000000], ['XCP', P2PKH2, 25]],
    legacy: '000200000102030405060708090a0b0c0d0e0f10111213001111111111111111111111111111111111111111'
      + '400000000000000070000000005f5e10000000000000000064',
    lengthPrefixed: '00021501000102030405060708090a0b0c0d0e0f101112131501111111111111111111111111111111111111'
      + '1111400000000000000070000000005f5e10000000000000000064',
  },
  {
    name: 'P2PKH, P2SH and P2WPKH over two assets',
    sends: [['XCP', P2WPKH, 1], ['PEPECASH', P2SH, 2], ['XCP', P2PKH, 3], ['PEPECASH', P2PKH, 4]],
    legacy: '0003001111111111111111111111111111111111111111052222222222222222222222222222222222222222'
      + '8033333333333333333333333333333333333333334000000718588312d40000000000000008000000000000'
      + '000220000000000000002c00000000000000020000000000000000c0',
    lengthPrefixed: '0003150111111111111111111111111111111111111111111502222222222222222222222222222222222222'
      + '222216030033333333333333333333333333333333333333334000000718588312d400000000000000080000'
      + '00000000000220000000000000002c00000000000000020000000000000000c0',
  },
  {
    name: 'every address kind',
    sends: [['XCP', P2PKH, 1], ['XCP', P2SH, 2], ['XCP', P2WPKH, 3], ['XCP', P2WSH, 4], ['XCP', P2TR, 5]],
    legacy: null,
    lengthPrefixed: '0005150111111111111111111111111111111111111111111502222222222222222222222222222222222222'
      + '2222220301555555555555555555555555555555555555555555555555555555555555555522030044444444'
      + '4444444444444444444444444444444444444444444444444444444416030033333333333333333333333333'
      + '3333333333333340000000000000006000000000000000011000000000000000240000000000000003300000'
      + '000000000042000000000000000500',
  },
  {
    name: 'Taproot and P2WSH only, with a numeric asset',
    sends: [['XCP', P2TR, 7], ['A95428956661682177', P2WSH, 8]],
    legacy: null,
    lengthPrefixed: '0002220301555555555555555555555555555555555555555555555555555555555555555522030044444444'
      + '444444444444444444444444444444444444444444444444444444444054c20859c6c4005000000000000000'
      + '840000000000000004000000000000000700',
  },
  {
    name: 'one Taproot destination, two assets (nbits zero)',
    sends: [['XCP', P2TR, 9], ['PEPECASH', P2TR, 10]],
    legacy: null,
    lengthPrefixed: '0001220301555555555555555555555555555555555555555555555555555555555555555540000007185883'
      + '12c0000000000000029000000000000000100000000000000090',
  },
  {
    name: 'a whole-send UTF-8 memo',
    sends: [['XCP', P2PKH, 1], ['XCP', P2WPKH, 2]],
    memo: 'thanks ∞',
    memoIsHex: false,
    legacy: '0002001111111111111111111111111111111111111111803333333333333333333333333333333333333333'
      + '8a7468616e6b7320e2889e8000000000000000c000000000000000280000000000000010',
    lengthPrefixed: '0002150111111111111111111111111111111111111111111603003333333333333333333333333333333333'
      + '3333338a7468616e6b7320e2889e8000000000000000c000000000000000280000000000000010',
  },
  {
    name: 'a whole-send hex memo to P2SH and Taproot',
    sends: [['XCP', P2SH, 1], ['XCP', P2TR, 2]],
    memo: 'deadbeef',
    memoIsHex: true,
    legacy: null,
    lengthPrefixed: '0002150222222222222222222222222222222222222222222203015555555555555555555555555555555555'
      + '555555555555555555555555555555c4deadbeef8000000000000000c0000000000000002800000000000000'
      + '10',
  },
  {
    name: 'per-send text memos, one absent and one 63 bytes long',
    sends: [['XCP', P2PKH, 1, 'first', false], ['XCP', P2TR, 2], ['PEPECASH', P2WSH, 3, 'x'.repeat(63), false]],
    legacy: null,
    lengthPrefixed: '0003150111111111111111111111111111111111111111112203015555555555555555555555555555555555'
      + '5555555555555555555555555555552203004444444444444444444444444444444444444444444444444444'
      + '4444444444444000000718588312c8000000000000000efde1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1'
      + 'e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e200'
      + '00000000000002800000000000000030accd2e4e6e880000000000000010',
  },
  {
    name: 'per-send hex memos',
    sends: [['XCP', P2WPKH, 1, '00ff', true], ['XCP', P2SH, 2, '0102030405', true]],
    legacy: '0002052222222222222222222222222222222222222222803333333333333333333333333333333333333333'
      + '400000000000000070000000000000001c200ff00000000000000016280810182028',
    lengthPrefixed: '0002150222222222222222222222222222222222222222221603003333333333333333333333333333333333'
      + '333333400000000000000070000000000000001c200ff00000000000000016280810182028',
  },
  {
    name: 'a per-send memo holding a comma, as the JSON memo list carries it',
    sends: [['XCP', P2WPKH, 5, 'a, b', false], ['XCP', P2PKH, 6, 'c', false]],
    legacy: '0002001111111111111111111111111111111111111111803333333333333333333333333333333333333333'
      + '40000000000000007000000000000000584612c2062000000000000000340b18',
    lengthPrefixed: '0002150111111111111111111111111111111111111111111603003333333333333333333333333333333333'
      + '33333340000000000000007000000000000000584612c2062000000000000000340b18',
  },
];

/** The compose params the wallet's MPMA form sends for these sends; per-send memos as a JSON list. */
function paramsFor(vector: CoreVector): Record<string, unknown> {
  const params: Record<string, unknown> = {
    assets: vector.sends.map(([asset]) => asset).join(','),
    destinations: vector.sends.map(([, destination]) => destination).join(','),
    quantities: vector.sends.map(([, , quantity]) => String(quantity)).join(','),
  };
  if (vector.sends.some((send) => send.length > 3)) {
    params.memos = encodeMemoList(vector.sends.map(([, , , memo]) => memo ?? ''));
    params.memos_are_hex = vector.sends.map(([, , , , isHex]) => String(isHex ?? false)).join(',');
  }
  if (vector.memo !== undefined) {
    params.memo = vector.memo;
    params.memo_is_hex = vector.memoIsHex ?? false;
  }
  return params;
}

/** Core's decode of these sends: grouped by asset name, request order within a group. */
function expectedSends(vector: CoreVector) {
  const assets = [...new Set(vector.sends.map(([asset]) => asset))].sort();
  return assets.flatMap((asset) => vector.sends
    .filter(([sendAsset]) => sendAsset === asset)
    .map(([, destination, quantity, memo, isHex]) => ({
      asset,
      destination,
      quantity: BigInt(quantity),
      ...(memo !== undefined
        ? { memo, memoIsHex: isHex ?? false }
        : vector.memo !== undefined ? { memo: vector.memo, memoIsHex: vector.memoIsHex ?? false } : {}),
    })));
}

const message = (body: string) => `${COUNTERPARTY_PREFIX_HEX}03${body}`;

describe('packing matches core 11.4\'s MPMA encoder on each side of activation', () => {
  it.each(CORE_VECTORS.map((vector) => [vector.name, vector] as const))('%s', (_name, vector) => {
    const params = paramsFor(vector);

    const prefixed = packComposeMessage('mpma', params, undefined, { mpmaTableFormat: 'length-prefixed' });
    expect(prefixed && bytesToHex(prefixed.bytes)).toBe(message(vector.lengthPrefixed));

    const legacy = packComposeMessage('mpma', params, undefined, { mpmaTableFormat: 'legacy' });
    expect(legacy && bytesToHex(legacy.bytes)).toBe(vector.legacy === null ? null : message(vector.legacy));
  });

  it('packs nothing for an MPMA whose table was not named', () => {
    // There is nothing to compare against without the table, and guessing one would verify the
    // wrong bytes on one side of activation.
    for (const vector of CORE_VECTORS) {
      expect(packComposeMessage('mpma', paramsFor(vector))).toBeNull();
    }
    expect(packComposeMessage('send', { asset: 'XCP', destinations: `${P2PKH},${P2TR}`, quantity: '1' })).toBeNull();
  });

  it('packs the send form\'s several destinations as the same MPMA', () => {
    // `composeSendOrMPMA`'s shape: one asset and quantity to each destination, one whole-send memo.
    const vector: CoreVector = {
      name: 'send form',
      sends: [['XCP', P2PKH, 1], ['XCP', P2TR, 1]],
      memo: 'thanks ∞',
      memoIsHex: false,
      legacy: null,
      lengthPrefixed: '',
    };
    for (const mpmaTableFormat of ['legacy', 'length-prefixed'] as const) {
      const fromSendForm = packComposeMessage('send', {
        asset: 'XCP', destinations: `${P2PKH},${P2TR}`, quantity: '1', memo: 'thanks ∞',
      }, undefined, { mpmaTableFormat });
      const fromMpmaForm = packComposeMessage('mpma', paramsFor(vector), undefined, { mpmaTableFormat });
      expect(fromSendForm && bytesToHex(fromSendForm.bytes)).toBe(fromMpmaForm && bytesToHex(fromMpmaForm.bytes));
    }
    expect(composesAsMpma('send', { destinations: `${P2PKH},${P2WPKH}` })).toBe(true);
    expect(composesAsMpma('send', { destination: P2PKH })).toBe(false);
    expect(composesAsMpma('mpma', {})).toBe(true);
  });
});

describe('unpacking reads either table as core does', () => {
  it.each(CORE_VECTORS.flatMap((vector) => [
    [`${vector.name}, length-prefixed`, vector.lengthPrefixed, 'length-prefixed', vector] as const,
    ...(vector.legacy ? [[`${vector.name}, legacy`, vector.legacy, 'legacy', vector] as const] : []),
  ]))('%s', (_label, body, tableFormat, vector) => {
    const result = unpackCounterpartyMessage(message(body));

    expect(result.success).toBe(true);
    expect(result.messageType).toBe('mpma_send');
    const data = result.data as MPMAData;
    expect(data.tableFormat).toBe(tableFormat);
    expect(data.sends).toEqual(expectedSends(vector));
  });

  it('round-trips every address kind through the length-prefixed table', () => {
    const destinations = [P2PKH, P2PKH2, P2SH, P2WPKH, P2WSH, P2TR];
    const params = {
      assets: destinations.map(() => 'XCP').join(','),
      destinations: destinations.join(','),
      quantities: destinations.map((_, i) => String(i + 1)).join(','),
    };
    const packed = packComposeMessage('mpma', params, undefined, { mpmaTableFormat: 'length-prefixed' })!;
    const data = unpackCounterpartyMessage(packed.bytes).data as MPMAData;

    expect(data.sends.map(({ destination, quantity }) => [destination, quantity]))
      .toEqual(destinations.map((destination, i) => [destination, BigInt(i + 1)]));
    // Rebuilt from the decode, in the table it names, the bytes are the same.
    const again = packComposeMessage('mpma', params, undefined, { mpmaTableFormat: data.tableFormat })!;
    expect(bytesToHex(again.bytes)).toBe(bytesToHex(packed.bytes));
  });

  it('refuses a truncated length-prefixed table rather than reading past it', () => {
    // Core's own case: two addresses announced, the first cut off mid-program.
    expect(unpackCounterpartyMessage(message('0002220301879090')).success).toBe(false);
  });

  it('refuses an empty entry', () => {
    expect(unpackCounterpartyMessage(message(`000100${'00'.repeat(12)}`)).success).toBe(false);
  });

  it('refuses a legacy packing behind a length byte, which core\'s Rust unpacker does not read', () => {
    // Core's `test_decode_rejects_non_canonical_address`: each address has one layout in the table.
    const legacyEntry = bytesToHex(packAddressLegacy(P2PKH));
    const body = `0001${(legacyEntry.length / 2).toString(16)}${legacyEntry}4000000000000000080000000000000010`;
    expect(unpackCounterpartyMessage(message(body)).success).toBe(false);
  });

  it('refuses a witness entry whose program core would not accept', () => {
    // 0x03, witness v0, a 25-byte program: neither P2WPKH nor P2WSH.
    const entry = `1b0300${'ab'.repeat(25)}`;
    expect(unpackCounterpartyMessage(message(`0001${entry}4000000000000000080000000000000010`)).success).toBe(false);
  });

  it('tells the tables apart by the first entry, whose first bytes cannot overlap', () => {
    // A length-prefixed entry opens with its length (21 to 42); a legacy one with a base58 version
    // byte or the segwit marker. No byte is both.
    const lengths = new Set(Array.from({ length: 22 }, (_, i) => 21 + i));
    for (const legacyStart of [0x00, 0x05, 0x6f, 0xc4, ...Array.from({ length: 16 }, (_, i) => 0x80 + i)]) {
      expect(lengths.has(legacyStart)).toBe(false);
    }
    expect(hexToBytes(CORE_VECTORS[0]!.legacy!)[2]).toBe(0x00);
    expect(hexToBytes(CORE_VECTORS[0]!.lengthPrefixed)[2]).toBe(21);
  });
});

describe('which table a block reads', () => {
  it('switches at mpma_taproot_support\'s activation height, per network', () => {
    expect(mpmaTableFormatAt('mainnet', 971_699)).toBe('legacy');
    expect(mpmaTableFormatAt('mainnet', 971_700)).toBe('length-prefixed');
    expect(mpmaTableFormatAt('testnet3', 5_165_999)).toBe('legacy');
    expect(mpmaTableFormatAt('testnet3', 5_166_000)).toBe('length-prefixed');
    expect(mpmaTableFormatAt('testnet4', 155_500)).toBe('length-prefixed');
    expect(mpmaTableFormatAt('signet', 325_499)).toBe('legacy');
    // Regtest enables every change from the start.
    expect(mpmaTableFormatAt('regtest', 1)).toBe('length-prefixed');
    expect(mpmaTableFormatAt('elsewhere', 1)).toBeNull();
    expect(MPMA_TAPROOT_SUPPORT_HEIGHTS.mainnet).toBe(971_700);
  });
});

describe('resolving the table for a send made now', () => {
  const node = (network: string, height: number) =>
    vi.mocked(fetchCounterpartyServerInfo).mockResolvedValue({
      server_ready: true, network, version: '11.4.0', backend_height: height, counterparty_height: height,
    });
  afterEach(() => {
    vi.mocked(fetchCounterpartyServerInfo).mockReset();
    vi.mocked(getCurrentBlockHeight).mockReset();
  });

  it('uses the next block, as core composes for its tip plus one', async () => {
    node('mainnet', 971_698);
    vi.mocked(getCurrentBlockHeight).mockResolvedValue(971_698);
    expect(await resolveMpmaTableFormat())
      .toEqual({ format: 'legacy', nextBlockIndex: 971_699, activationHeight: 971_700 });

    node('mainnet', 971_699);
    vi.mocked(getCurrentBlockHeight).mockResolvedValue(971_699);
    expect(await resolveMpmaTableFormat())
      .toEqual({ format: 'length-prefixed', nextBlockIndex: 971_700, activationHeight: 971_700 });
  });

  it('refreshes a cached chain height once, then refuses when the two readings still disagree', async () => {
    // A node reporting a height past activation while the chain is not there yet — or a regtest
    // node — would otherwise have the new table accepted where mainnet reads the old one.
    node('mainnet', 971_750);
    vi.mocked(getCurrentBlockHeight).mockResolvedValue(971_000);
    expect(await resolveMpmaTableFormat()).toBeNull();
    expect(getCurrentBlockHeight).toHaveBeenLastCalledWith(true);

    node('regtest', 300);
    expect(await resolveMpmaTableFormat()).toBeNull();
  });

  it('accepts the refreshed chain height when it has caught up', async () => {
    node('mainnet', 971_699);
    vi.mocked(getCurrentBlockHeight).mockResolvedValueOnce(971_690).mockResolvedValueOnce(971_699);
    expect((await resolveMpmaTableFormat())?.format).toBe('length-prefixed');
  });

  it('lets either reading decide alone, and neither means unknown', async () => {
    node('regtest', 300);
    vi.mocked(getCurrentBlockHeight).mockRejectedValue(new Error('offline'));
    expect((await resolveMpmaTableFormat())?.format).toBe('length-prefixed');

    vi.mocked(fetchCounterpartyServerInfo).mockRejectedValue(new Error('down'));
    vi.mocked(getCurrentBlockHeight).mockResolvedValue(971_000);
    expect((await resolveMpmaTableFormat())?.format).toBe('legacy');

    vi.mocked(getCurrentBlockHeight).mockRejectedValue(new Error('offline'));
    expect(await resolveMpmaTableFormat()).toBeNull();
  });
});

describe('the notice for a legacy send close to activation', () => {
  const at = (nextBlockIndex: number, format: MpmaTableFormat = 'legacy') =>
    mpmaNearsActivation({ format, nextBlockIndex, activationHeight: 971_700 });

  it(`covers the ${MPMA_ACTIVATION_NOTICE_BLOCKS} blocks before activation and no others`, () => {
    expect(at(971_693)).toBe(false);
    expect(at(971_694)).toBe(true);
    expect(at(971_699)).toBe(true);
    expect(at(971_700, 'length-prefixed')).toBe(false);
    expect(mpmaNearsActivation(null)).toBe(false);
  });
});

describe('the approval\'s check of a site\'s table', () => {
  const PRE = { format: 'legacy', nextBlockIndex: 971_000, activationHeight: 971_700 } as const;
  const POST = { format: 'length-prefixed', nextBlockIndex: 971_701, activationHeight: 971_700 } as const;

  it('blocks only a table core would not read as shown', () => {
    expect(mpmaTableWarning('legacy', PRE)).toBeNull();
    expect(mpmaTableWarning('length-prefixed', POST)).toBeNull();
    expect(mpmaTableWarning('length-prefixed', PRE)).toMatchObject({ severity: 'block' });
    expect(mpmaTableWarning('legacy', POST)).toMatchObject({ severity: 'block' });
    expect(mpmaTableWarning('length-prefixed', null)).toBeNull();
  });
});
