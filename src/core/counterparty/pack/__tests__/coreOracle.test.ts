/**
 * Equivalence oracle: prove the local packer emits exactly what counterparty-core composes.
 *
 * The fixture tests next door compare against bytes captured from real mainnet composes, which is
 * good evidence but frozen in time. This asks a live node instead, so protocol drift is caught
 * before release rather than by users: core's compose API accepts `return_only_data`, which skips
 * transaction construction and returns just the Counterparty message —
 *
 *     if construct_params.get("return_only_data", False):
 *         return {"data": config.PREFIX + data if data else None}
 *
 * — so each case below is "what would you compose for these params?" answered by core itself.
 *
 * Skipped unless `COUNTERPARTY_API_URL` is set, so ordinary runs stay offline and deterministic.
 * The nightly workflow sets it (see `.github/workflows/nightly-tests.yml`), so this does run on a
 * schedule rather than only on request — a skipped-by-default check that nothing ever executes
 * protects nobody. To run it locally:
 *
 *     COUNTERPARTY_API_URL=https://api.counterparty.io:4000 npx vitest run src/utils/blockchain/counterparty/pack
 *
 * Its first live run earned its keep: `packAddress` was emitting the legacy base58 version byte for
 * P2PKH destinations where core emits the modern 0x01 prefix, which would have made byte equality
 * reject every send to a legacy address.
 *
 * A failure here means one of three things, all worth knowing immediately: core changed an
 * encoding, our packer is wrong, or a protocol feature activated at a new block height. Byte
 * equality is fail-closed, so drift blocks composes — this is the check that catches it first.
 */

import { describe, expect, it } from 'vitest';
import { asBaseUnits } from '@/core/numeric';
import { unpackCounterpartyMessage } from '../../unpack';
import { bytesToHex } from '../../unpack/binary';
import { packComposeMessage } from '../messages';

const API_URL = process.env.COUNTERPARTY_API_URL;
/** A funded mainnet address is only needed to satisfy the endpoint's shape; nothing is broadcast. */
const SOURCE = process.env.COUNTERPARTY_ORACLE_SOURCE
  ?? '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

interface OracleCase {
  label: string;
  composeType: string;
  /** Params as the wallet's forms normalize them, fed to the local packer. */
  params: Record<string, unknown>;
  /** Query string for core's compose endpoint. An array value becomes repeated keys, which is
   * how core's `query_params()` receives a list (MPMA per-send memos travel this way). */
  query: Record<string, string | string[]>;
  /**
   * Decode core's response and hand it to the packer as the observed message, exactly as
   * production does — for types with a value the request cannot determine, such as the random
   * numeric asset id core draws for a new subasset. Equality then proves every *other* byte.
   */
  observedFromResponse?: boolean;
}

const CASES: OracleCase[] = [
  {
    label: 'XCP send to a Taproot address',
    composeType: 'send',
    params: {
      asset: 'XCP',
      destination: 'bc1pcm9gfgcy8q45y4m0ryskyc5nczex8yn9jc5r0tpuacz897y5rlfqn2u02z',
      quantity: 50_000_000_000,
    },
    query: {
      asset: 'XCP',
      destination: 'bc1pcm9gfgcy8q45y4m0ryskyc5nczex8yn9jc5r0tpuacz897y5rlfqn2u02z',
      quantity: '50000000000',
    },
  },
  {
    label: 'XCP send with a memo',
    composeType: 'send',
    params: {
      asset: 'XCP',
      destination: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      quantity: asBaseUnits(100),
      memo: 'thanks',
    },
    query: {
      asset: 'XCP',
      destination: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      quantity: '100',
      memo: 'thanks',
    },
  },
  {
    label: 'indivisible issuance',
    composeType: 'issuance',
    params: { asset: 'LANDMARKS', quantity: asBaseUnits(21), divisible: false },
    query: { asset: 'LANDMARKS', quantity: '21', divisible: 'false' },
  },
  {
    label: 'divisible issuance with a description',
    composeType: 'issuance',
    params: { asset: 'LANDMARKS', quantity: 100_000_000, divisible: true, description: 'a token' },
    query: {
      asset: 'LANDMARKS', quantity: '100000000', divisible: 'true', description: 'a token',
    },
  },
  {
    // The new owner rides in an output, not the message, so the composed data is byte-for-byte a
    // reissuance — this proves core agrees the transfer changes nothing about the message.
    label: 'issuance transferring ownership',
    composeType: 'issuance',
    params: {
      asset: 'LANDMARKS', quantity: asBaseUnits(0), divisible: false,
      transfer_destination: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
    },
    query: {
      asset: 'LANDMARKS', quantity: '0', divisible: 'false',
      transfer_destination: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
    },
  },
  {
    label: 'sweep of balances and ownership',
    composeType: 'sweep',
    params: { destination: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', flags: 3, memo: 'moving' },
    query: { destination: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', flags: '3', memo: 'moving' },
  },
  {
    label: 'destroy with a tag',
    composeType: 'destroy',
    params: { asset: 'XCP', quantity: asBaseUnits(1000), tag: 'burn' },
    query: { asset: 'XCP', quantity: '1000', tag: 'burn' },
  },
  {
    label: 'cancel an order',
    composeType: 'cancel',
    params: { offer_hash: 'a'.repeat(64) },
    query: { offer_hash: 'a'.repeat(64) },
  },
  {
    label: 'text broadcast',
    composeType: 'broadcast',
    params: { text: 'BLOCKCHAIN IS THE FUTURE', value: '0', fee_fraction: '0', timestamp: 1722700000 },
    query: { text: 'BLOCKCHAIN IS THE FUTURE', value: '0', fee_fraction: '0', timestamp: '1722700000' },
  },
  {
    label: 'valued broadcast with a fee fraction',
    composeType: 'broadcast',
    params: { text: 'price feed', value: '1.5', fee_fraction: '0.05', timestamp: 1722700000 },
    query: { text: 'price feed', value: '1.5', fee_fraction: '0.05', timestamp: '1722700000' },
  },
  {
    label: 'initial subasset issuance',
    composeType: 'issuance',
    params: { asset: 'PEPECASH.oracle-check', quantity: asBaseUnits(1000), divisible: false, description: 'a subasset' },
    query: { asset: 'PEPECASH.oracle-check', quantity: '1000', divisible: 'false', description: 'a subasset' },
    // Core names the subasset by drawing a random numeric asset per compose, so the id differs on
    // every call and can only come from the response.
    observedFromResponse: true,
  },
  {
    label: 'MPMA send of two assets to two addresses',
    composeType: 'mpma',
    params: {
      assets: 'XCP,PEPECASH',
      destinations: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa,1CounterpartyXXXXXXXXXXXXXXXUWLpVr',
      quantities: '100,500',
    },
    query: {
      assets: 'XCP,PEPECASH',
      destinations: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa,1CounterpartyXXXXXXXXXXXXXXXUWLpVr',
      quantities: '100,500',
    },
  },
  {
    // One distinct destination: nbits is zero and the count/index fields occupy no bits. This is
    // the dominant shape of real MPMA traffic (airdropping several assets to one address).
    label: 'MPMA send of two assets to one address',
    composeType: 'mpma',
    params: {
      assets: 'XCP,PEPECASH',
      destinations: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa,1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      quantities: '3,5',
    },
    query: {
      assets: 'XCP,PEPECASH',
      destinations: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa,1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      quantities: '3,5',
    },
  },
  {
    // The memos travel as repeated `memos=` keys — the transport `composeMPMA` uses — so this
    // case also proves the API actually receives them (a `memos[]=` suffix would be ignored).
    label: 'MPMA send with per-send memos',
    composeType: 'mpma',
    params: {
      assets: 'XCP,XCP',
      destinations: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa,'
        + 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
      quantities: '7,9',
      memos: 'first,second',
      memos_are_hex: 'false,false',
    },
    query: {
      assets: 'XCP,XCP',
      destinations: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa,'
        + 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
      quantities: '7,9',
      memos: ['first', 'second'],
      memos_are_hex: 'false',
    },
  },
  {
    label: 'MPMA send with a whole-send memo',
    composeType: 'mpma',
    params: {
      assets: 'XCP,XCP',
      destinations: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa,'
        + 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
      quantities: '1,2',
      memo: 'thanks',
      memo_is_hex: false,
    },
    query: {
      assets: 'XCP,XCP',
      destinations: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa,'
        + 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
      quantities: '1,2',
      memo: 'thanks',
      memo_is_hex: 'false',
    },
  },
  {
    label: 'DEX order',
    composeType: 'order',
    params: {
      give_asset: 'XCP', give_quantity: 100_000_000,
      get_asset: 'BTC', get_quantity: 50_000,
      expiration: 5000, fee_required: 0,
    },
    query: {
      give_asset: 'XCP', give_quantity: '100000000',
      get_asset: 'BTC', get_quantity: '50000',
      expiration: '5000', fee_required: '0',
    },
  },
];

async function composeDataFromCore(testCase: OracleCase): Promise<string> {
  const query = new URLSearchParams({ return_only_data: 'true', validate: 'false' });
  for (const [key, value] of Object.entries(testCase.query)) {
    for (const entry of Array.isArray(value) ? value : [value]) {
      query.append(key, entry);
    }
  }
  const url = `${API_URL}/v2/addresses/${SOURCE}/compose/${testCase.composeType}?${query}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`core returned ${response.status} for ${testCase.label}: ${await response.text()}`);
  }
  const body = await response.json() as { result?: { data?: string } };
  const data = body.result?.data;
  if (!data) throw new Error(`core returned no data for ${testCase.label}`);
  return data.toLowerCase().replace(/^0x/, '');
}

describe.skipIf(!API_URL)('local packing matches counterparty-core', () => {
  it.each(CASES)('$label', async (testCase) => {
    const fromCore = await composeDataFromCore(testCase);

    let observed: Record<string, unknown> | undefined;
    if (testCase.observedFromResponse) {
      const unpacked = unpackCounterpartyMessage(fromCore);
      expect(unpacked.success, 'the response should decode before anything can be borrowed').toBe(true);
      observed = unpacked.data as Record<string, unknown>;
    }

    const packed = packComposeMessage(testCase.composeType, testCase.params, observed);
    expect(packed, 'this case should be packable locally').not.toBeNull();
    expect(bytesToHex(packed!.bytes).toLowerCase()).toBe(fromCore);
  }, 30_000);
});
