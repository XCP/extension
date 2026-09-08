import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/core/api/client';
import { clearSpentUtxoCache, isUtxoRecentlySpent } from '@/core/bitcoin/spentUtxoCache';
import { broadcastTransaction, computeTxid, extractInputsFromRawTx } from '@/core/bitcoin/transactionBroadcaster';
import * as bitcoinUtxo from '@/core/bitcoin/utxo';
import * as counterpartyApi from '@/core/counterparty/api';
import { selectUtxosForTransaction } from '@/core/counterparty/utxoSelection';
import { DEFAULT_SETTINGS, getActiveSettings } from '@/core/settings';

vi.mock('@/core/settings', async importOriginal => ({
  ...(await importOriginal<typeof import('@/core/settings')>()),
  getActiveSettings: vi.fn(),
}));
vi.mock('@/core/api/client', () => ({
  apiClient: { post: vi.fn() },
  API_TIMEOUTS: { BROADCAST: 45_000 },
  isApiError: (error: unknown) => error instanceof Error && 'response' in error,
}));

const inputTxid = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
const wireInputTxid = '1f1e1d1c1b1a191817161514131211100f0e0d0c0b0a09080706050403020100';
// A wire fixture with one non-symmetric input outpoint, vout 3, and a zero-value OP_RETURN.
// It is only parsed locally; mocked endpoints accept it and nothing is sent to a real node.
const rawTx = `0200000001${wireInputTxid}0300000000ffffffff010000000000000000036a010000000000`;
const echoedTxid = 'ff'.repeat(32);
const accepted = (node: boolean) => ({
  status: 200, statusText: 'OK', headers: {}, data: node ? { result: echoedTxid } : echoedTxid,
});
const alreadyKnown = () => Object.assign(new Error('HTTP 503'), {
  response: { status: 503, data: { error: 'txn-already-in-mempool' } },
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe('broadcast acceptance settles actual spent outpoints before propagation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
    clearSpentUtxoCache();
    vi.mocked(getActiveSettings).mockReturnValue({ ...DEFAULT_SETTINGS, transactionDryRun: false });
  });

  it('extracts the display-order outpoint from a non-symmetric wire input', () => {
    expect(extractInputsFromRawTx(rawTx)).toEqual([{ txid: inputTxid, vout: 3 }]);
  });

  it.each([
    { viaRelay: false, known: false },
    { viaRelay: false, known: true },
    { viaRelay: true, known: false },
    { viaRelay: true, known: true },
  ])('reserves on acceptance (public relay=$viaRelay, already known=$known) while fan-out is pending', async ({ viaRelay, known }) => {
    const fanoutStarted = deferred<void>();
    const blockstream = deferred<never>();
    const mempool = deferred<never>();
    const post = vi.mocked(apiClient.post);
    if (viaRelay) post.mockRejectedValueOnce(new Error('Counterparty unavailable'));
    if (known) post.mockRejectedValueOnce(alreadyKnown());
    else post.mockResolvedValueOnce(accepted(!viaRelay));
    if (!viaRelay) post.mockImplementationOnce(() => blockstream.promise);
    post.mockImplementationOnce(() => {
      fanoutStarted.resolve();
      return mempool.promise;
    });
    // A stale upstream index still lists the spent input as its largest funding candidate.
    vi.spyOn(bitcoinUtxo, 'fetchUTXOs').mockResolvedValue([3, 2].map(vout => ({
      txid: inputTxid, vout, value: vout === 3 ? 50_000 : 20_000,
      status: { confirmed: true, block_height: 1, block_hash: 'fixture', block_time: 0 },
    })));
    vi.spyOn(counterpartyApi, 'fetchTokenBalances').mockResolvedValue([]);

    let completed = false;
    const response = broadcastTransaction(rawTx).then(result => { completed = true; return result; });
    await fanoutStarted.promise;
    try {
      expect(completed).toBe(false);
      // The actual spent cache used by UTXO filtering must match the real outpoint, not its reverse.
      expect(isUtxoRecentlySpent(inputTxid, 3)).toBe(true);
      expect(isUtxoRecentlySpent(wireInputTxid, 3)).toBe(false);
      expect(isUtxoRecentlySpent(inputTxid, 2)).toBe(false);
      const funding = await selectUtxosForTransaction('bc1qfixture');
      expect(funding.inputsSet).toBe(`${inputTxid}:2`);
      expect(funding.totalValue).toBe(20_000);
      expect(completed).toBe(false);
      expect(post).toHaveBeenLastCalledWith(
        'https://mempool.space/api/tx', rawTx,
        { headers: { 'Content-Type': 'text/plain' }, timeout: 10_000, retries: 0 },
      );
    } finally {
      if (!viaRelay) blockstream.reject(new Error('Public relay unavailable'));
      mempool.reject(new Error('Public relay timeout'));
    }
    await expect(response).resolves.toEqual({ txid: computeTxid(rawTx) });
    expect(isUtxoRecentlySpent(inputTxid, 3)).toBe(true);
    expect(post).toHaveBeenCalledTimes(3);
  });

  it('does not reserve a rejected transaction', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('min relay fee not met'));
    await expect(broadcastTransaction(rawTx)).rejects.toThrow('min relay fee not met');
    expect(isUtxoRecentlySpent(inputTxid, 3)).toBe(false);
  });

  it('propagates a local settlement exception before starting relay fan-out', async () => {
    const localFailure = new Error('Local cache unavailable');
    vi.spyOn(counterpartyApi, 'clearApiCache').mockImplementation(() => { throw localFailure; });
    vi.mocked(apiClient.post).mockResolvedValueOnce(accepted(true));
    await expect(broadcastTransaction(rawTx)).rejects.toBe(localFailure);
    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });
});
