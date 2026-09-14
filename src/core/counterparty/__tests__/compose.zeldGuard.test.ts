import { hexToBytes } from '@noble/hashes/utils.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClientUtils from '@/core/api/client';
import { getActiveSettings } from '@/core/settings';
import { OTHER_ADDRESS, opReturnScript, PREV_TXID, SOURCE_ADDRESS, SOURCE_P2WPKH, unsignedRawTx } from '@/core/zeld/__tests__/fixtures';
import { fetchZeldOutpointBalance, fetchZeldUtxos } from '@/core/zeld/api';
import { composeMove, composeSend } from '../compose';
import { mockSettings } from './helpers/composeTestHelpers';

vi.mock('@/core/api/client');
vi.mock('@/core/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/settings')>();
  return { ...actual, getActiveSettings: vi.fn().mockReturnValue(actual.DEFAULT_SETTINGS) };
});
vi.mock('@/core/zeld/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/zeld/api')>()),
  fetchZeldUtxos: vi.fn(),
  fetchZeldOutpointBalance: vi.fn(),
}));

// The offered coins: one on a six-zero txid (so it reads as ZELD-bearing even without the
// indexer) and one clean. Literal because the factory is hoisted above the imports.
const ZELD_TXID = '000000' + '1'.repeat(58);
const CLEAN_TXID = 'c'.repeat(64);
vi.mock('@/core/counterparty/utxoSelection', () => ({
  selectUtxosForTransaction: vi.fn().mockResolvedValue({
    utxos: [
      { txid: '000000' + '1'.repeat(58), vout: 0, value: 100_000, status: { confirmed: true } },
      { txid: 'c'.repeat(64), vout: 0, value: 100_000, status: { confirmed: true } },
    ],
    inputsSet: `${'000000' + '1'.repeat(58)}:0,${'c'.repeat(64)}:0`,
    totalValue: 200_000,
    excludedWithAssets: 0,
  }),
}));

const api = vi.mocked(apiClientUtils.apiClient, true);
const settings = vi.mocked(getActiveSettings);
const zeldUtxos = vi.mocked(fetchZeldUtxos);
const outpointBalance = vi.mocked(fetchZeldOutpointBalance);
const otherScript = hexToBytes('0014' + '7'.repeat(40));

const btcSendSpending = (txid: string) => unsignedRawTx({
  inputs: [{ txid, index: 0 }],
  outputs: [{ script: otherScript, amount: 5_000n }, { script: SOURCE_P2WPKH.script, amount: 90_000n }],
});
const enhancedSendSpending = (txid: string) => unsignedRawTx({
  inputs: [{ txid, index: 0 }],
  outputs: [{ script: opReturnScript(), amount: 0n }, { script: SOURCE_P2WPKH.script, amount: 90_000n }],
});
const response = (rawtransaction: string) => ({
  data: {
    result: {
      rawtransaction, btc_in: 100_000, btc_out: 5_000, btc_change: 90_000, btc_fee: 5_000, data: '',
      lock_scripts: [], inputs_values: [100_000], signed_tx_estimated_size: { vsize: 1, adjusted_vsize: 1, sigops_count: 0 },
      psbt: '', params: {}, name: 'send',
    },
  },
});
const urlOf = (call: number) => new URL(api.get.mock.calls[call]![0] as string);

describe('ZELD guard on composed transactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settings.mockReturnValue({ ...mockSettings, zeldHuntSeconds: 20 } as never);
    zeldUtxos.mockResolvedValue([]);
  });

  it('recomposes a BTC send that would carry ZELD to the recipient, excluding the ZELD output', async () => {
    api.get
      .mockResolvedValueOnce(response(btcSendSpending(ZELD_TXID)) as never)
      .mockResolvedValueOnce(response(btcSendSpending(CLEAN_TXID)) as never);

    const composed = await composeSend({
      sourceAddress: SOURCE_ADDRESS, destination: OTHER_ADDRESS, asset: 'BTC', quantity: 5_000, sat_per_vbyte: 2,
    });

    expect(api.get).toHaveBeenCalledTimes(2);
    expect(urlOf(0).searchParams.get('exclude_utxos')).toBeNull();
    expect(urlOf(1).searchParams.get('exclude_utxos')).toBe(`${ZELD_TXID}:0`);
    expect(urlOf(1).searchParams.get('inputs_set')).toBe(`${CLEAN_TXID}:0`);
    expect(composed.result.rawtransaction).toBe(btcSendSpending(CLEAN_TXID));
    expect(composed.result.zeld_protection).toEqual({ excluded: [`${ZELD_TXID}:0`], carried_forward: [], api_unavailable: false });
  });

  it('uses the indexer to recognise ZELD on an ordinary-looking outpoint', async () => {
    zeldUtxos.mockResolvedValue([{ txid: CLEAN_TXID, vout: 0, balance: 5n }]);
    api.get
      .mockResolvedValueOnce(response(btcSendSpending(CLEAN_TXID)) as never)
      .mockResolvedValueOnce(response(btcSendSpending(ZELD_TXID)) as never)
      .mockResolvedValueOnce(response(btcSendSpending(ZELD_TXID)) as never);
    // The recompose comes back spending the six-zero output instead, which is also ZELD: refuse.
    await expect(composeSend({
      sourceAddress: SOURCE_ADDRESS, destination: OTHER_ADDRESS, asset: 'BTC', quantity: 5_000, sat_per_vbyte: 2,
    })).rejects.toThrow('would send your ZELD');
    expect(zeldUtxos).toHaveBeenCalledWith(SOURCE_ADDRESS);
  });

  it('leaves an enhanced send alone and records that ZELD rolls forward', async () => {
    api.get.mockResolvedValueOnce(response(enhancedSendSpending(ZELD_TXID)) as never);
    const composed = await composeSend({
      sourceAddress: SOURCE_ADDRESS, destination: OTHER_ADDRESS, asset: 'XCP', quantity: 1, sat_per_vbyte: 2,
    });
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(composed.result.zeld_protection).toEqual({ excluded: [], carried_forward: [`${ZELD_TXID}:0`], api_unavailable: false });
  });

  it('adds nothing to a transaction that touches no ZELD', async () => {
    api.get.mockResolvedValueOnce(response(btcSendSpending(CLEAN_TXID)) as never);
    const composed = await composeSend({
      sourceAddress: SOURCE_ADDRESS, destination: OTHER_ADDRESS, asset: 'BTC', quantity: 5_000, sat_per_vbyte: 2,
    });
    expect(composed.result.zeld_protection).toBeUndefined();
  });

  it('applies the txid heuristic without the indexer when hunting is off', async () => {
    settings.mockReturnValue({ ...mockSettings, zeldHuntSeconds: 0 } as never);
    api.get
      .mockResolvedValueOnce(response(btcSendSpending(ZELD_TXID)) as never)
      .mockResolvedValueOnce(response(btcSendSpending(CLEAN_TXID)) as never);
    const composed = await composeSend({
      sourceAddress: SOURCE_ADDRESS, destination: OTHER_ADDRESS, asset: 'BTC', quantity: 5_000, sat_per_vbyte: 2,
    });
    expect(zeldUtxos).not.toHaveBeenCalled();
    expect(composed.result.zeld_protection?.excluded).toEqual([`${ZELD_TXID}:0`]);
  });

  it('does not decorate a clean transaction just because the indexer was unreachable', async () => {
    zeldUtxos.mockRejectedValue(new Error('down'));
    api.get.mockResolvedValueOnce(response(btcSendSpending(CLEAN_TXID)) as never);
    const composed = await composeSend({
      sourceAddress: SOURCE_ADDRESS, destination: OTHER_ADDRESS, asset: 'BTC', quantity: 5_000, sat_per_vbyte: 2,
    });
    expect(composed.result.zeld_protection).toBeUndefined();
  });

  it('refuses a move whose source output holds ZELD, by indexer or by txid shape', async () => {
    api.get.mockResolvedValue(response(btcSendSpending(CLEAN_TXID)) as never);
    outpointBalance.mockResolvedValue(7n);
    await expect(composeMove({
      sourceUtxo: `${PREV_TXID}:0`, destination: OTHER_ADDRESS, sat_per_vbyte: 2,
    } as never)).rejects.toThrow('also holds ZELD');
    expect(outpointBalance).toHaveBeenCalledWith(PREV_TXID, 0);

    outpointBalance.mockResolvedValue(0n);
    await expect(composeMove({
      sourceUtxo: `${ZELD_TXID}:0`, destination: OTHER_ADDRESS, sat_per_vbyte: 2,
    } as never)).rejects.toThrow('also holds ZELD');

    await expect(composeMove({
      sourceUtxo: `${CLEAN_TXID}:0`, destination: OTHER_ADDRESS, sat_per_vbyte: 2,
    } as never)).resolves.toBeDefined();
  });
});
