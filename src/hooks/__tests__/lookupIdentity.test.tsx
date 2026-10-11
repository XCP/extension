import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { fetchAddressPoolByLpAsset, fetchMempoolLedgerEvents, fetchMempoolStatusEvents, fetchPool, fetchUtxoBalances } from '@/core/counterparty/api';
import { useLpAssetPool } from '../useLpAssetPool';
import { usePendingCancellations, usePendingDeltas } from '../usePendingStatus';
import { usePool } from '../usePool';
import { useReviewLookup } from '../useReviewLookup';
import { useUtxoSource } from '../useUtxoSource';

const wallet = vi.hoisted(() => ({ activeAddress: { address: 'A' } }));
vi.mock('@/contexts/wallet-context', () => ({ useWallet: () => wallet }));
vi.mock('@/core/counterparty/api', () => ({
  fetchMempoolLedgerEvents: vi.fn(), fetchMempoolStatusEvents: vi.fn(),
  fetchPool: vi.fn(), fetchAddressPoolByLpAsset: vi.fn(), fetchUtxoBalances: vi.fn(),
}));
vi.mock('@/core/counterparty/pool', () => ({ normalizePoolPosition: (value: unknown) => value }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const ledger = (address: string) => ({ result_count: 1, result: [{ tx_hash: address, event: 'DEBIT',
  params: { address, asset: 'XCP', quantity: 100000000, quantity_normalized: '1' } }] });
const cancellations = (source: string) => ({ result_count: 1, result: [{ tx_hash: source, event: 'CANCEL_ORDER',
  params: { source, offer_hash: source, status: 'valid' } }] });

beforeEach(() => { vi.resetAllMocks(); wallet.activeAddress = { address: 'A' }; });

it('never returns another address pending deltas or cancellations, even before effects run', async () => {
  const nextLedger = deferred<Awaited<ReturnType<typeof fetchMempoolLedgerEvents>>>();
  const nextCancellations = deferred<Awaited<ReturnType<typeof fetchMempoolStatusEvents>>>();
  vi.mocked(fetchMempoolLedgerEvents).mockResolvedValueOnce(ledger('A')).mockReturnValueOnce(nextLedger.promise);
  vi.mocked(fetchMempoolStatusEvents).mockResolvedValueOnce(cancellations('A')).mockReturnValueOnce(nextCancellations.promise);
  const seen: Array<{ address: string | undefined; debits: number; cancellations: number }> = [];
  const { result, rerender } = renderHook(({ address }: { address: string | undefined }) => {
    const deltas = usePendingDeltas(address);
    const cancelled = usePendingCancellations(address);
    seen.push({ address, debits: deltas.byAsset.size, cancellations: cancelled.orderHashes.size });
    return { deltas, cancelled };
  }, { initialProps: { address: 'A' as string | undefined } });
  await waitFor(() => expect(result.current.deltas.byAsset.size).toBe(1));
  await waitFor(() => expect(result.current.cancelled.orderHashes.has('A')).toBe(true));
  rerender({ address: 'B' });
  expect(seen.filter(read => read.address === 'B').every(read => read.debits === 0 && read.cancellations === 0)).toBe(true);
  await act(async () => { nextLedger.resolve(ledger('B')); nextCancellations.resolve(cancellations('B')); });
  expect(result.current.deltas.byAsset.get('XCP')?.txHashes).toEqual(['B']);
  expect([...result.current.cancelled.orderHashes]).toEqual(['B']);
  rerender({ address: undefined });
  expect(seen.filter(read => read.address === undefined).every(read => read.debits === 0 && read.cancellations === 0)).toBe(true);
});

it('ignores late responses after an address switch', async () => {
  const oldLedger = deferred<Awaited<ReturnType<typeof fetchMempoolLedgerEvents>>>();
  const oldCancellations = deferred<Awaited<ReturnType<typeof fetchMempoolStatusEvents>>>();
  vi.mocked(fetchMempoolLedgerEvents).mockReturnValueOnce(oldLedger.promise).mockResolvedValueOnce(ledger('B'));
  vi.mocked(fetchMempoolStatusEvents).mockReturnValueOnce(oldCancellations.promise).mockResolvedValueOnce(cancellations('B'));
  const { result, rerender } = renderHook(({ address }) => ({ deltas: usePendingDeltas(address), cancellations: usePendingCancellations(address) }),
    { initialProps: { address: 'A' } });
  rerender({ address: 'B' });
  await waitFor(() => expect(result.current.deltas.byAsset.size).toBe(1));
  await act(async () => { oldLedger.resolve(ledger('A')); oldCancellations.resolve(cancellations('A')); });
  expect(result.current.deltas.byAsset.get('XCP')?.txHashes).toEqual(['B']);
  expect([...result.current.cancellations.orderHashes]).toEqual(['B']);
});

it('never returns the previous review fact during a key change', async () => {
  const seen: Array<[string, ReturnType<typeof useReviewLookup<string>>]> = [];
  const { result, rerender } = renderHook(({ key }) => {
    const value = useReviewLookup(key, () => Promise.resolve(key));
    seen.push([key, value]);
    return value;
  }, { initialProps: { key: 'A' } });
  await waitFor(() => expect(result.current).toEqual({ status: 'ready', value: 'A' }));
  rerender({ key: 'B' });
  expect(seen.filter(([key]) => key === 'B').every(([, value]) => value.status !== 'ready' || value.value === 'B')).toBe(true);
});

it.each(['pool', 'position', 'utxo'] as const)('hides old %s data in every render when the lookup changes', async kind => {
  // Only identity matters here; these hooks pass through their fetched payloads.
  vi.mocked(fetchPool).mockResolvedValue({ asset_a: 'A' } as Awaited<ReturnType<typeof fetchPool>>);
  vi.mocked(fetchAddressPoolByLpAsset).mockResolvedValue({ asset_a: 'A' } as Awaited<ReturnType<typeof fetchAddressPoolByLpAsset>>);
  vi.mocked(fetchUtxoBalances).mockResolvedValue({ result: [{ asset: 'A' }] } as Awaited<ReturnType<typeof fetchUtxoBalances>>);
  const seen: Array<{ key: string; populated: boolean }> = [];
  const hooks = {
    pool: (key: string) => usePool(key, 'XCP').data !== null,
    position: (_key: string) => useLpAssetPool('LP').data !== null,
    utxo: (key: string) => useUtxoSource(key, undefined).balances.length > 0,
  };
  const useLookup = hooks[kind];
  const { result, rerender } = renderHook(({ key }) => {
    const populated = useLookup(key);
    seen.push({ key, populated });
    return populated;
  }, { initialProps: { key: 'A' } });
  await waitFor(() => expect(result.current).toBe(true));
  vi.mocked(fetchPool).mockReturnValue(new Promise(() => {}));
  vi.mocked(fetchAddressPoolByLpAsset).mockReturnValue(new Promise(() => {}));
  vi.mocked(fetchUtxoBalances).mockReturnValue(new Promise(() => {}));
  wallet.activeAddress = { address: 'B' };
  rerender({ key: 'B' });
  expect(seen.filter(read => read.key === 'B').every(read => !read.populated)).toBe(true);
});
