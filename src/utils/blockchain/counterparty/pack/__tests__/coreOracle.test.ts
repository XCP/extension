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

import { describe, it, expect } from 'vitest';
import { packComposeMessage } from '../messages';
import { bytesToHex } from '../../unpack/binary';

const API_URL = process.env.COUNTERPARTY_API_URL;
/** A funded mainnet address is only needed to satisfy the endpoint's shape; nothing is broadcast. */
const SOURCE = process.env.COUNTERPARTY_ORACLE_SOURCE
  ?? '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

interface OracleCase {
  label: string;
  composeType: string;
  /** Params as the wallet's forms normalize them, fed to the local packer. */
  params: Record<string, unknown>;
  /** Query string for core's compose endpoint. */
  query: Record<string, string>;
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
      quantity: 100,
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
    params: { asset: 'LANDMARKS', quantity: 21, divisible: false },
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
    label: 'sweep of balances and ownership',
    composeType: 'sweep',
    params: { destination: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', flags: 3, memo: 'moving' },
    query: { destination: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', flags: '3', memo: 'moving' },
  },
  {
    label: 'destroy with a tag',
    composeType: 'destroy',
    params: { asset: 'XCP', quantity: 1000, tag: 'burn' },
    query: { asset: 'XCP', quantity: '1000', tag: 'burn' },
  },
  {
    label: 'cancel an order',
    composeType: 'cancel',
    params: { offer_hash: 'a'.repeat(64) },
    query: { offer_hash: 'a'.repeat(64) },
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
  const query = new URLSearchParams({
    ...testCase.query,
    return_only_data: 'true',
    validate: 'false',
  });
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
    const packed = packComposeMessage(testCase.composeType, testCase.params);
    expect(packed, 'this case should be packable locally').not.toBeNull();

    const fromCore = await composeDataFromCore(testCase);
    expect(bytesToHex(packed!.bytes).toLowerCase()).toBe(fromCore);
  }, 30_000);
});
