import { hexToBytes } from '@noble/hashes/utils.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClientUtils from '@/core/api/client';
import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import { getActiveSettings } from '@/core/settings';
import { OTHER_ADDRESS, opReturnScript, PREV_TXID, SOURCE_ADDRESS, SOURCE_P2WPKH, unsignedRawTx } from '@/core/zeld/__tests__/fixtures';
import { fetchZeldOutpointBalance, fetchZeldUtxos } from '@/core/zeld/api';
import { composeAttach, composeBurn, composeDetach, composeDispense, composeMove, composeSend } from '../compose';
import { mockSettings } from './helpers/composeTestHelpers';

vi.mock('@/core/api/client');
vi.mock('@/core/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/settings')>();
  return { ...actual, getActiveSettings: vi.fn().mockReturnValue(actual.DEFAULT_SETTINGS) };
});
// The six-zero heuristic reads the parent to find the reward output; none here means "assume it".
vi.mock('@/core/bitcoin/utxo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/bitcoin/utxo')>()),
  fetchPreviousRawTransaction: vi.fn(async () => null),
}));
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
// A burn is read positionally (the burn address must be the only destination), so the wallet
// never reorders it: the shape that exercises the exclusion path.
const burnSpending = btcSendSpending;
const burn = () => composeBurn({ sourceAddress: SOURCE_ADDRESS, quantity: 5_000, sat_per_vbyte: 2 });
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
    // Reset rather than clear: a failed test must not leave queued one-shot responses behind.
    api.get.mockReset();
    zeldUtxos.mockReset();
    outpointBalance.mockReset();
    settings.mockReturnValue({ ...mockSettings, zeldHuntSeconds: 20 } as never);
    zeldUtxos.mockResolvedValue([]);
  });

  it('recomposes a burn that would carry ZELD to the burn address, excluding the ZELD output', async () => {
    api.get
      .mockResolvedValueOnce(response(burnSpending(ZELD_TXID)) as never)
      .mockResolvedValueOnce(response(burnSpending(CLEAN_TXID)) as never);

    const composed = await burn();

    expect(api.get).toHaveBeenCalledTimes(2);
    expect(urlOf(0).searchParams.get('exclude_utxos')).toBeNull();
    expect(urlOf(1).searchParams.get('exclude_utxos')).toBe(`${ZELD_TXID}:0`);
    expect(urlOf(1).searchParams.get('inputs_set')).toBe(`${CLEAN_TXID}:0`);
    expect(composed.result.rawtransaction).toBe(burnSpending(CLEAN_TXID));
    expect(composed.result.zeld_protection).toEqual({ excluded: [`${ZELD_TXID}:0`], carried_forward: [], api_unavailable: false });
  });

  it('uses the indexer to recognise ZELD on an ordinary-looking outpoint', async () => {
    zeldUtxos.mockResolvedValue([{ txid: CLEAN_TXID, vout: 0, balance: 5n }]);
    api.get
      .mockResolvedValueOnce(response(burnSpending(CLEAN_TXID)) as never)
      .mockResolvedValueOnce(response(burnSpending(ZELD_TXID)) as never)
      .mockResolvedValueOnce(response(burnSpending(ZELD_TXID)) as never);
    // The recompose comes back spending the six-zero output instead, which is also ZELD: refuse.
    await expect(burn()).rejects.toThrow('Move your ZELD to a small output');
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

  it('adds nothing to a positional transaction that touches no ZELD', async () => {
    api.get.mockResolvedValueOnce(response(burnSpending(CLEAN_TXID)) as never);
    const composed = await burn();
    expect(composed.result.zeld_protection).toBeUndefined();
  });

  it('protects ZELD even when hunting is off, so what was earned stays safe', async () => {
    settings.mockReturnValue({ ...mockSettings, zeldHuntSeconds: 0 } as never);
    api.get
      .mockResolvedValueOnce(response(burnSpending(ZELD_TXID)) as never)
      .mockResolvedValueOnce(response(burnSpending(CLEAN_TXID)) as never);
    const composed = await burn();
    expect(zeldUtxos).toHaveBeenCalledWith(SOURCE_ADDRESS);
    expect(composed.result.zeld_protection?.excluded).toEqual([`${ZELD_TXID}:0`]);
  });

  it('says what to do when nothing clean is left to recompose from', async () => {
    api.get
      .mockResolvedValueOnce(response(burnSpending(ZELD_TXID)) as never)
      .mockRejectedValueOnce(new Error('Insufficient BTC at address') as never);
    await expect(burn()).rejects.toThrow('Move your ZELD to a small output');
  });

  it('places change right after the data on an asset send with extra BTC outputs', async () => {
    const withExtra = unsignedRawTx({
      inputs: [{ txid: CLEAN_TXID, index: 0 }],
      outputs: [
        { script: opReturnScript(), amount: 0n },
        { script: otherScript, amount: 1_000n },
        { script: SOURCE_P2WPKH.script, amount: 90_000n },
      ],
    });
    api.get.mockResolvedValueOnce(response(withExtra) as never);
    const composed = await composeSend({
      sourceAddress: SOURCE_ADDRESS, destination: OTHER_ADDRESS, asset: 'XCP', quantity: 1, sat_per_vbyte: 2,
      more_outputs: `1000:${OTHER_ADDRESS}`,
    });
    const parsed = parseRawTransactionLocally(composed.result.rawtransaction)!;
    expect(parsed.outputs.map(o => o.type === 'op_return' ? 'data' : o.value)).toEqual(['data', 90_000, 1_000]);
  });

  it('does not decorate a clean transaction just because the indexer was unreachable', async () => {
    zeldUtxos.mockRejectedValue(new Error('down'));
    api.get.mockResolvedValueOnce(response(burnSpending(CLEAN_TXID)) as never);
    const composed = await burn();
    expect(composed.result.zeld_protection).toBeUndefined();
  });

  it('refuses a move whose source output holds ZELD, by indexer or by txid shape', async () => {
    api.get.mockResolvedValue(response(btcSendSpending(CLEAN_TXID)) as never);
    outpointBalance.mockResolvedValue(7n);
    await expect(composeMove({
      sourceUtxo: `${PREV_TXID}:0`, destination: OTHER_ADDRESS, sat_per_vbyte: 2,
    } as never)).rejects.toThrow('Detach first');
    expect(outpointBalance).toHaveBeenCalledWith(PREV_TXID, 0);

    outpointBalance.mockResolvedValue(0n);
    await expect(composeMove({
      sourceUtxo: `${ZELD_TXID}:0`, destination: OTHER_ADDRESS, sat_per_vbyte: 2,
    } as never)).rejects.toThrow('also holds ZELD');

    await expect(composeMove({
      sourceUtxo: `${CLEAN_TXID}:0`, destination: OTHER_ADDRESS, sat_per_vbyte: 2,
    } as never)).resolves.toBeDefined();
  });

  it('lets a detach through whatever the source output holds, since its change keeps the ZELD', async () => {
    api.get.mockResolvedValue(response(enhancedSendSpending(ZELD_TXID)) as never);
    outpointBalance.mockResolvedValue(7n);
    const detach = () => composeDetach({ sourceUtxo: `${ZELD_TXID}:0`, sourceAddress: SOURCE_ADDRESS, sat_per_vbyte: 2 });
    await expect(detach()).resolves.toBeDefined();
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(outpointBalance).not.toHaveBeenCalled();
  });

  it('gives a detach with no change a small output of its own when the detached output holds ZELD', async () => {
    const detachWithoutChange = unsignedRawTx({ inputs: [{ txid: ZELD_TXID, index: 0 }], outputs: [{ script: opReturnScript(), amount: 0n }] });
    const detachWithSmallOutput = unsignedRawTx({
      inputs: [{ txid: ZELD_TXID, index: 0 }, { txid: CLEAN_TXID, index: 0 }],
      outputs: [{ script: opReturnScript(), amount: 0n }, { script: SOURCE_P2WPKH.script, amount: 330n }, { script: SOURCE_P2WPKH.script, amount: 90_000n }],
    });
    api.get.mockResolvedValueOnce(response(detachWithoutChange) as never).mockResolvedValueOnce(response(detachWithSmallOutput) as never);
    const composed = await composeDetach({ sourceUtxo: `${ZELD_TXID}:0`, sourceAddress: SOURCE_ADDRESS, sat_per_vbyte: 2 });
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(urlOf(1).searchParams.get('more_outputs')).toBe(`330:${SOURCE_ADDRESS}`);
    expect(composed.result.rawtransaction).toBe(detachWithSmallOutput);
    expect(composed.result.zeld_protection?.carried_forward).toEqual([`${ZELD_TXID}:0`]);

    // A clean output detached the same way is left alone.
    api.get.mockResolvedValueOnce(response(unsignedRawTx({ inputs: [{ txid: CLEAN_TXID, index: 0 }], outputs: [{ script: opReturnScript(), amount: 0n }] })) as never);
    outpointBalance.mockResolvedValue(0n);
    await composeDetach({ sourceUtxo: `${CLEAN_TXID}:0`, sourceAddress: SOURCE_ADDRESS, sat_per_vbyte: 2 });
    expect(api.get).toHaveBeenCalledTimes(3);
  });

  // Counterparty's default attach: the new output first, then data, then change.
  const defaultAttach = (txid: string) => unsignedRawTx({
    inputs: [{ txid, index: 0 }],
    outputs: [
      { script: SOURCE_P2WPKH.script, amount: 546n },
      { script: opReturnScript(20), amount: 0n },
      { script: SOURCE_P2WPKH.script, amount: 90_000n },
    ],
  });
  const attach = () => composeAttach({ sourceAddress: SOURCE_ADDRESS, asset: 'XCP', quantity: 1, sat_per_vbyte: 2 });

  it('attaches to an output after the change, so the ZELD stays on the change', async () => {
    // Counterparty's answer to the named layout: data, the requested 546-sat output, change.
    const namedAttach = unsignedRawTx({
      inputs: [{ txid: ZELD_TXID, index: 0 }],
      outputs: [
        { script: opReturnScript(20), amount: 0n },
        { script: SOURCE_P2WPKH.script, amount: 546n },
        { script: SOURCE_P2WPKH.script, amount: 90_000n },
      ],
    });
    api.get.mockResolvedValueOnce(response(defaultAttach(ZELD_TXID)) as never).mockResolvedValueOnce(response(namedAttach) as never);
    const composed = await attach();
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(urlOf(0).searchParams.has('destination_vout')).toBe(false);
    expect(urlOf(0).searchParams.has('validate')).toBe(false);
    const named = urlOf(1);
    expect(named.searchParams.get('destination_vout')).toBe('2');
    expect(named.searchParams.get('more_outputs')).toBe(`546:${SOURCE_ADDRESS}`);
    expect(named.searchParams.get('validate')).toBe('false');
    const parsed = parseRawTransactionLocally(composed.result.rawtransaction)!;
    expect(parsed.outputs.map(o => o.value)).toEqual([0, 90_000, 546]);
    expect(composed.result.zeld_protection?.carried_forward).toEqual([`${ZELD_TXID}:0`]);
  });

  it('keeps the validated default attach when there is no change to put first', async () => {
    const exactAttach = unsignedRawTx({
      inputs: [{ txid: CLEAN_TXID, index: 0 }],
      outputs: [{ script: opReturnScript(20), amount: 0n }, { script: SOURCE_P2WPKH.script, amount: 546n }],
    });
    api.get.mockResolvedValueOnce(response(defaultAttach(CLEAN_TXID)) as never).mockResolvedValueOnce(response(exactAttach) as never);
    const composed = await attach();
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(composed.result.rawtransaction).toBe(defaultAttach(CLEAN_TXID));
  });

  it('keeps the validated default attach when the named layout fails to compose', async () => {
    api.get.mockResolvedValueOnce(response(defaultAttach(CLEAN_TXID)) as never).mockRejectedValueOnce(new Error('boom'));
    const composed = await attach();
    expect(composed.result.rawtransaction).toBe(defaultAttach(CLEAN_TXID));
  });

  it('puts change first on a BTC send, raw and PSBT alike, and records it', async () => {
    api.get.mockResolvedValueOnce(response(btcSendSpending(CLEAN_TXID)) as never);
    const composed = await composeSend({
      sourceAddress: SOURCE_ADDRESS, destination: OTHER_ADDRESS, asset: 'BTC', quantity: 5_000, sat_per_vbyte: 2,
    });
    expect(api.get).toHaveBeenCalledTimes(1);
    const parsed = parseRawTransactionLocally(composed.result.rawtransaction)!;
    expect(parsed.outputs.map(o => o.value)).toEqual([90_000, 5_000]);
    expect(composed.result.zeld_protection).toEqual({ excluded: [], carried_forward: [], api_unavailable: false, change_first: true });
  });

  it('with change first, a BTC send spending a ZELD output rolls it forward instead of excluding it', async () => {
    api.get.mockResolvedValueOnce(response(btcSendSpending(ZELD_TXID)) as never);
    const composed = await composeSend({
      sourceAddress: SOURCE_ADDRESS, destination: OTHER_ADDRESS, asset: 'BTC', quantity: 5_000, sat_per_vbyte: 2,
    });
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(composed.result.zeld_protection).toEqual({
      excluded: [], carried_forward: [`${ZELD_TXID}:0`], api_unavailable: false, change_first: true,
    });
    expect(parseRawTransactionLocally(composed.result.rawtransaction)!.outputs[0]?.value).toBe(90_000);
  });

  it('puts change first on a dispense, ahead of the dispenser output and the data', async () => {
    const dispenseTx = unsignedRawTx({
      inputs: [{ txid: ZELD_TXID, index: 0 }],
      outputs: [
        { script: otherScript, amount: 20_000n },
        { script: opReturnScript(10), amount: 0n },
        { script: SOURCE_P2WPKH.script, amount: 70_000n },
      ],
    });
    api.get.mockResolvedValueOnce(response(dispenseTx) as never);
    const composed = await composeDispense({ sourceAddress: SOURCE_ADDRESS, dispenser: OTHER_ADDRESS, quantity: 20_000, sat_per_vbyte: 2 });
    const parsed = parseRawTransactionLocally(composed.result.rawtransaction)!;
    expect(parsed.outputs.map(o => o.type)).toEqual(['address', 'address', 'op_return']);
    expect(parsed.outputs[0]?.value).toBe(70_000);
    expect(composed.result.zeld_protection?.carried_forward).toEqual([`${ZELD_TXID}:0`]);
  });

  it('does not reorder an asset send', async () => {
    api.get.mockResolvedValueOnce(response(enhancedSendSpending(CLEAN_TXID)) as never);
    const composed = await composeSend({
      sourceAddress: SOURCE_ADDRESS, destination: OTHER_ADDRESS, asset: 'XCP', quantity: 1, sat_per_vbyte: 2,
    });
    expect(composed.result.rawtransaction).toBe(enhancedSendSpending(CLEAN_TXID));
    expect(composed.result.zeld_protection).toBeUndefined();
  });
});
