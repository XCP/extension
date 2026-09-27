import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConsolidationData } from '@/core/bitcoin/consolidationApi';
import { mockBrowserLocale } from '@/i18n/__tests__/helpers/locale';
import ja from '../../../public/_locales/ja/messages.json';
import { useMultiBatchConsolidation } from '../useMultiBatchConsolidation';

const ADDRESS = '1BareMultisigOwnerAddress';

const fixture = vi.hoisted(() => ({
  navigate: vi.fn(),
  broadcast: vi.fn(),
  consolidate: vi.fn(),
  report: vi.fn(),
  fetchAllBatches: vi.fn(),
  track: vi.fn(),
  wallet: { id: 'wallet-1' } as { id: string } | null,
}));

vi.mock('react-router', () => ({ useNavigate: () => fixture.navigate }));
vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    activeWallet: fixture.wallet,
    activeAddress: fixture.wallet ? { address: ADDRESS } : null,
    broadcastTransaction: fixture.broadcast,
  }),
}));
vi.mock('@/services/walletServiceClient', () => ({
  getWalletServiceClient: () => ({ consolidateBareMultisig: fixture.consolidate }),
}));
vi.mock('@/core/bitcoin/consolidationApi', () => ({
  consolidationApi: { reportConsolidation: fixture.report, fetchAllBatches: fixture.fetchAllBatches },
}));
vi.mock('@/platform/fathom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/platform/fathom')>()),
  analytics: { track: fixture.track },
}));

function batch(page: number, utxos = 10): ConsolidationData {
  return {
    address: ADDRESS,
    summary: { total_utxos: 20, total_btc: 0.1, batches_required: 2, current_batch: page, batch_utxos: utxos },
  } as ConsolidationData;
}

/** A signed batch whose hex, and so whose txid, names its page. */
function signed(_address: string, data: ConsolidationData) {
  const page = data.summary.current_batch;
  return Promise.resolve({ signedTxHex: `hex-${page}`, networkFee: 100, serviceFee: 50, outputAmount: 10_000 * page });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  fixture.wallet = { id: 'wallet-1' };
  fixture.consolidate.mockImplementation(signed);
  fixture.broadcast.mockImplementation(async (hex: string) => ({ txid: `txid-${hex}` }));
  fixture.report.mockResolvedValue({ status: 'pending', txid: 'x', inputs: 1 });
  fixture.fetchAllBatches.mockResolvedValue([]);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  // Spies first: restoring a spy on a faked timer after useRealTimers would reinstall the fake.
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useMultiBatchConsolidation', () => {
  it('signs, broadcasts and reports every batch, then replaces the form with the results', async () => {
    const { result } = renderHook(() => useMultiBatchConsolidation());

    let returned: unknown;
    await act(async () => {
      returned = await result.current.consolidateAllBatches([batch(1), batch(2)], 5, 'bc1qdestination', true);
    });

    expect(fixture.consolidate.mock.calls).toEqual([
      [ADDRESS, batch(1), 5, 'bc1qdestination'],
      [ADDRESS, batch(2), 5, 'bc1qdestination'],
    ]);
    expect(fixture.broadcast.mock.calls).toEqual([['hex-1'], ['hex-2']]);
    expect(fixture.report).toHaveBeenCalledTimes(2);
    expect(fixture.report).toHaveBeenLastCalledWith(ADDRESS, {
      raw_transaction_hex: 'hex-2', network_fee: 100, service_fee: 50, output_amount: 20_000, include_protected_stamps: true,
    });
    const expected = [
      { batchNumber: 1, txid: 'txid-hex-1', utxosConsolidated: 10, status: 'success', reported: true },
      { batchNumber: 2, txid: 'txid-hex-2', utxosConsolidated: 10, status: 'success', reported: true },
    ];
    expect(returned).toEqual(expected);
    expect(result.current.results).toEqual(expected);
    expect(fixture.fetchAllBatches).not.toHaveBeenCalled();
    expect(fixture.navigate).toHaveBeenCalledTimes(1);
    expect(fixture.navigate).toHaveBeenCalledWith('/actions/consolidate/success', {
      replace: true,
      state: { results: expected, totalBatches: 2, address: ADDRESS },
    });
    expect(result.current.isProcessing).toBe(false);
    expect(result.current.currentBatch).toBe(0);
  });

  it('keeps going past a failed batch without refetching when the failure is not stale inputs', async () => {
    fixture.broadcast.mockRejectedValueOnce(new Error('min relay fee not met'));
    const { result } = renderHook(() => useMultiBatchConsolidation());

    await act(async () => { await result.current.consolidateAllBatches([batch(1), batch(2)], 5); });

    expect(result.current.results.map((r) => [r.batchNumber, r.status, r.error])).toEqual([
      [1, 'error', 'min relay fee not met'],
      [2, 'success', undefined],
    ]);
    expect(fixture.report).toHaveBeenCalledTimes(1);
    expect(fixture.fetchAllBatches).not.toHaveBeenCalled();
    expect(fixture.navigate).toHaveBeenCalledTimes(1);
  });

  it('refetches once after a stale-input failure and runs the fresh non-empty batches', async () => {
    fixture.broadcast.mockRejectedValueOnce(new Error('bad-txns-inputs-missingorspent'));
    // The retried batch fails as stale again: there is still exactly one refetch.
    fixture.broadcast.mockImplementationOnce(async (hex: string) => ({ txid: `txid-${hex}` }));
    fixture.broadcast.mockRejectedValueOnce(new Error('bad-txns-inputs-missingorspent'));
    fixture.fetchAllBatches.mockResolvedValueOnce([batch(3, 0), batch(4), batch(5)]);
    const { result } = renderHook(() => useMultiBatchConsolidation());

    await act(async () => { await result.current.consolidateAllBatches([batch(1), batch(2)], 5, undefined, true); });

    expect(fixture.fetchAllBatches).toHaveBeenCalledTimes(1);
    expect(fixture.fetchAllBatches).toHaveBeenCalledWith(ADDRESS, true);
    expect(fixture.broadcast.mock.calls).toEqual([['hex-1'], ['hex-2'], ['hex-4'], ['hex-5']]);
    expect(result.current.results.map((r) => [r.batchNumber, r.status])).toEqual([
      [1, 'error'], [2, 'success'], [3, 'error'], [4, 'success'],
    ]);
    expect(fixture.track).toHaveBeenCalledWith('consolidate_stale_retry');
    expect(fixture.navigate.mock.calls[0]?.[1]?.state.totalBatches).toBe(4);
  });

  it('retries a failed report and records the batch as reported once it lands', async () => {
    vi.useFakeTimers();
    fixture.report.mockRejectedValueOnce(new Error('503')).mockRejectedValueOnce(new Error('503'));
    const { result } = renderHook(() => useMultiBatchConsolidation());

    let run!: Promise<unknown>;
    act(() => { run = result.current.consolidateAllBatches([batch(1)], 5); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); await run; });

    expect(fixture.report).toHaveBeenCalledTimes(3);
    expect(result.current.results).toEqual([
      { batchNumber: 1, txid: 'txid-hex-1', utxosConsolidated: 10, status: 'success', reported: true },
    ]);
    expect(fixture.track).not.toHaveBeenCalledWith('consolidate_report_failed');
  });

  it('keeps a broadcast batch a success when its report never lands', async () => {
    vi.useFakeTimers();
    fixture.report.mockRejectedValue(new Error('503'));
    const { result } = renderHook(() => useMultiBatchConsolidation());

    let run!: Promise<unknown>;
    act(() => { run = result.current.consolidateAllBatches([batch(1)], 5); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); await run; });

    expect(fixture.report).toHaveBeenCalledTimes(3);
    expect(result.current.results[0]).toMatchObject({ status: 'success', reported: false, txid: 'txid-hex-1' });
    expect(fixture.track).toHaveBeenCalledWith('consolidate_report_failed');
    expect(fixture.navigate).toHaveBeenCalledTimes(1);
  });

  it('ignores a second run started while one is in flight', async () => {
    const firstBroadcast = deferred<{ txid: string }>();
    fixture.broadcast.mockReturnValueOnce(firstBroadcast.promise);
    const { result } = renderHook(() => useMultiBatchConsolidation());

    let first!: Promise<unknown>;
    let second: unknown = 'not settled';
    await act(async () => {
      first = result.current.consolidateAllBatches([batch(1)], 5);
      second = await result.current.consolidateAllBatches([batch(1)], 5);
    });

    expect(second).toBeUndefined();
    expect(fixture.consolidate).toHaveBeenCalledTimes(1);
    expect(result.current.isProcessing).toBe(true);

    await act(async () => { firstBroadcast.resolve({ txid: 'txid-first' }); await first; });

    expect(fixture.broadcast).toHaveBeenCalledTimes(1);
    expect(fixture.navigate).toHaveBeenCalledTimes(1);
    expect(result.current.results).toHaveLength(1);
    expect(result.current.isProcessing).toBe(false);

    // Settled runs release the guard.
    await act(async () => { await result.current.consolidateAllBatches([batch(2)], 5); });
    expect(fixture.consolidate).toHaveBeenCalledTimes(2);
  });

  it('refuses to start without a wallet and does not hold the guard', async () => {
    fixture.wallet = null;
    const { result, rerender } = renderHook(() => useMultiBatchConsolidation());

    await expect(result.current.consolidateAllBatches([batch(1)], 5)).rejects.toThrow('Wallet not properly initialized');
    expect(fixture.consolidate).not.toHaveBeenCalled();

    fixture.wallet = { id: 'wallet-1' };
    rerender();
    await act(async () => { await result.current.consolidateAllBatches([batch(1)], 5); });
    expect(fixture.consolidate).toHaveBeenCalledTimes(1);
  });

  // React 19 drops a state update on an unmounted component silently, so the observable contract is
  // that the run still finishes the broadcasts already under way and logs nothing.
  it('finishes quietly when the page unmounts mid-run', async () => {
    const firstBroadcast = deferred<{ txid: string }>();
    fixture.broadcast.mockReturnValueOnce(firstBroadcast.promise);
    const { result, unmount } = renderHook(() => useMultiBatchConsolidation());

    let run!: Promise<unknown>;
    act(() => { run = result.current.consolidateAllBatches([batch(1), batch(2)], 5); });
    unmount();
    await act(async () => { firstBroadcast.resolve({ txid: 'txid-first' }); await run; });

    // Coins that already moved are still reported and shown.
    expect(fixture.broadcast).toHaveBeenCalledTimes(2);
    expect(fixture.report).toHaveBeenCalledTimes(2);
    expect(fixture.navigate).toHaveBeenCalledTimes(1);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("says why it refused in the reader's language", async () => {
    mockBrowserLocale({ language: 'ja' });
    fixture.wallet = null;
    const { result } = renderHook(() => useMultiBatchConsolidation());

    await expect(result.current.consolidateAllBatches([batch(1)], 5)).rejects.toThrow(ja.consolidate_wallet_not_ready.message);
    mockBrowserLocale({ language: 'en' });
  });
});
