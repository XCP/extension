import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { p2wpkh, Transaction } from '@scure/btc-signer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchInputsAlkanes } from '@/core/alkanes/inputAssets';
import { apiClient } from '@/core/api/client';
import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import { fetchPreviousRawTransaction } from '@/core/bitcoin/utxo';
import { DEFAULT_SETTINGS, getActiveSettings } from '@/core/settings';
import { composeMPMA, composeTransaction, composeUtxoTransaction } from '../compose';
import { selectUtxosForTransaction } from '../utxoSelection';
import { createMockComposeResponse } from './helpers/composeTestHelpers';

vi.mock('@/core/api/client');
vi.mock('@/core/alkanes/inputAssets', () => ({ fetchInputsAlkanes: vi.fn() }));
vi.mock('@/core/bitcoin/utxo', () => ({ fetchPreviousRawTransaction: vi.fn() }));
vi.mock('@/core/counterparty/utxoSelection', () => ({ selectUtxosForTransaction: vi.fn() }));
vi.mock('@/core/settings', async importOriginal => ({
  ...(await importOriginal<typeof import('@/core/settings')>()), getActiveSettings: vi.fn(),
}));

const payment = p2wpkh(getPublicKey(hexToBytes('11'.repeat(32)), true));
const owner = payment.address!;
const clean = `${'ab'.repeat(32)}:0`;
const clean2 = `${'cd'.repeat(32)}:0`;
const token = `${'ef'.repeat(32)}:1`;
const callerExcluded = `${'12'.repeat(32)}:0`;

function rawSpending(outpoints: string[]) {
  const tx = new Transaction({ allowLegacyWitnessUtxo: true });
  for (const outpoint of outpoints) {
    const [txid, vout] = outpoint.split(':');
    tx.addInput({ txid: hexToBytes(txid!), index: Number(vout), witnessUtxo: { script: payment.script, amount: 100_000n } });
  }
  tx.addOutput({ script: payment.script, amount: 80_000n });
  return bytesToHex(tx.unsignedTx);
}
const parent = rawSpending([`${'34'.repeat(32)}:0`]);
const source = `${parseRawTransactionLocally(parent)!.txid}:0`;
const utxo = (outpoint: string) => {
  const [txid, vout] = outpoint.split(':');
  return { txid: txid!, vout: Number(vout), value: 100_000, status: { confirmed: true, block_height: 800000, block_hash: '', block_time: 0 } };
};
const urls = () => vi.mocked(apiClient.get).mock.calls.map(([url]) => new URL(url));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getActiveSettings).mockReturnValue({ ...DEFAULT_SETTINGS, protectAlkanesUtxos: true });
  vi.mocked(fetchInputsAlkanes).mockResolvedValue([]);
  vi.mocked(fetchPreviousRawTransaction).mockResolvedValue(parent);
  vi.mocked(selectUtxosForTransaction).mockResolvedValue({
    utxos: [utxo(clean)], inputsSet: clean, totalValue: 100_000,
    excludedWithAssets: 1, excludedValue: 80_000, excludedUtxos: [token, source],
  });
  vi.mocked(apiClient.get).mockResolvedValue(createMockComposeResponse({ rawtransaction: rawSpending([clean]) }));
});

describe('explicit Alkanes funding exclusions', () => {
  it('retains discovered and caller exclusions on every constrained compose retry', async () => {
    vi.mocked(selectUtxosForTransaction).mockResolvedValue({
      utxos: [utxo(clean), utxo(clean2)], inputsSet: `${clean},${clean2}`, totalValue: 200_000,
      excludedWithAssets: 1, excludedValue: 80_000, excludedUtxos: [token],
    });
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: { error: `invalid UTXOs: ${clean} (transaction not found)` }, status: 200 } as never)
      .mockResolvedValueOnce(createMockComposeResponse({ rawtransaction: rawSpending([clean2]) }));

    await composeTransaction('broadcast', { text: 'test', exclude_utxos: callerExcluded }, owner, 2);

    expect(urls()).toHaveLength(2);
    expect(urls().map(url => url.searchParams.get('inputs_set'))).toEqual([`${clean},${clean2}`, clean2]);
    for (const url of urls()) expect(url.searchParams.get('exclude_utxos')?.split(',')).toEqual([callerExcluded, token]);
  });

  it('threads exclusions through the repeated-array compose path', async () => {
    await composeMPMA({ sourceAddress: owner, assets: ['XCP', 'XCP'], destinations: [owner, owner], quantities: ['1', '2'], memos: ['first', 'second'], sat_per_vbyte: 2 });
    expect(urls()[0]!.searchParams.getAll('memos')).toEqual(['first', 'second']);
    expect(urls()[0]!.searchParams.get('exclude_utxos')?.split(',')).toEqual([token, source]);
  });

  it('keeps control exclusions while allowing an explicitly routed offered outpoint', async () => {
    await composeTransaction('send', {}, owner, 2, 'opreturn', {
      inputsSet: clean, useAllInputsSet: true, excludedUtxos: [clean, token],
    });
    expect(selectUtxosForTransaction).not.toHaveBeenCalled();
    expect(urls()[0]!.searchParams.get('exclude_utxos')).toBe(token);
    expect(urls()[0]!.searchParams.get('use_all_inputs_set')).toBe('true');
  });
});

describe('detach/move source and funding proof', () => {
  it.each(['detach', 'move'])('offers %s only its verified source and classified clean funding', async endpoint => {
    vi.mocked(apiClient.get).mockResolvedValue(createMockComposeResponse({ rawtransaction: rawSpending([source, clean]) }));
    await composeUtxoTransaction(endpoint, { destination: owner }, source, 2);
    expect(fetchPreviousRawTransaction).toHaveBeenCalledWith(source.split(':')[0]);
    expect(selectUtxosForTransaction).toHaveBeenCalledWith(owner, { allowUnconfirmed: true, minUtxos: 0 });
    expect(urls()[0]!.searchParams.get('inputs_set')).toBe(`${source},${clean}`);
    expect(urls()[0]!.searchParams.get('exclude_utxos')).toBe(token);
  });

  it('rejects owner evidence whose raw bytes belong to another transaction', async () => {
    vi.mocked(fetchPreviousRawTransaction).mockResolvedValue(rawSpending([clean2]));
    await expect(composeUtxoTransaction('move', {}, source, 2)).rejects.toThrow('source transaction bytes do not match');
    expect(selectUtxosForTransaction).not.toHaveBeenCalled();
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('refuses unverified source Alkanes status before requesting any funding', async () => {
    vi.mocked(fetchInputsAlkanes).mockResolvedValue([{ inputIndex: 0, utxo: source, balances: [], lookupFailed: true, unknownReason: 'indexer-behind' }]);
    await expect(composeUtxoTransaction('detach', {}, source, 2)).rejects.toThrow('could not be verified');
    expect(fetchPreviousRawTransaction).not.toHaveBeenCalled();
    expect(selectUtxosForTransaction).not.toHaveBeenCalled();
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('rejects a server response that adds an unoffered token-bearing funding input', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(createMockComposeResponse({ rawtransaction: rawSpending([source, clean, token]) }));
    await expect(composeUtxoTransaction('detach', {}, source, 2)).rejects.toThrow('did not offer');
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });

  it('rejects a server response omitting the verified source', async () => {
    await expect(composeUtxoTransaction('move', {}, source, 2)).rejects.toThrow('does not spend the verified source');
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });
});
