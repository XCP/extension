import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLpAssetPool } from '../useLpAssetPool';
import { fetchAddressPoolByLpAsset } from '@/utils/blockchain/counterparty/api';

const mocks = vi.hoisted(() => ({
  activeAddress: { address: 'bc1qtest123' },
}));

vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    activeAddress: mocks.activeAddress,
  }),
}));

vi.mock('@/utils/blockchain/counterparty/api', () => ({
  fetchAddressPoolByLpAsset: vi.fn(),
}));

const mockedFetchAddressPoolByLpAsset = vi.mocked(fetchAddressPoolByLpAsset);

const poolA = {
  asset_a: 'XCP',
  asset_b: 'POOLTEST',
  reserve_a: 100000000,
  reserve_b: 200000000,
  lp_asset: 'A11111111111111111',
  quantity: 100000000,
  quantity_normalized: '1',
};

const poolB = {
  asset_a: 'XCP',
  asset_b: 'OTHER',
  reserve_a: 300000000,
  reserve_b: 400000000,
  lp_asset: 'A22222222222222222',
  quantity: 200000000,
  quantity_normalized: '2',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useLpAssetPool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activeAddress = { address: 'bc1qtest123' };
  });

  it('fetches a pool position for the active address and LP asset', async () => {
    mockedFetchAddressPoolByLpAsset.mockResolvedValue(poolA);

    const { result } = renderHook(() => useLpAssetPool('A11111111111111111'));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual(poolA);
    expect(mockedFetchAddressPoolByLpAsset).toHaveBeenCalledWith(
      'bc1qtest123',
      'A11111111111111111',
      { limit: 100 },
    );
  });

  it('clears stale pool data while a different LP asset is loading', async () => {
    mockedFetchAddressPoolByLpAsset.mockResolvedValueOnce(poolA);

    const { result, rerender } = renderHook(
      ({ asset }) => useLpAssetPool(asset),
      { initialProps: { asset: 'A11111111111111111' } },
    );

    await waitFor(() => expect(result.current.data).toEqual(poolA));

    const nextLookup = deferred<typeof poolB>();
    mockedFetchAddressPoolByLpAsset.mockReturnValueOnce(nextLookup.promise);

    rerender({ asset: 'A22222222222222222' });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeNull();
    });

    nextLookup.resolve(poolB);

    await waitFor(() => expect(result.current.data).toEqual(poolB));
  });

  it('does not fetch for BTC or a missing asset', () => {
    const { result, rerender } = renderHook(
      ({ asset }) => useLpAssetPool(asset),
      { initialProps: { asset: 'BTC' as string | undefined } },
    );

    expect(result.current).toEqual({ data: null, isLoading: false, error: null });
    expect(mockedFetchAddressPoolByLpAsset).not.toHaveBeenCalled();

    rerender({ asset: undefined });

    expect(result.current).toEqual({ data: null, isLoading: false, error: null });
    expect(mockedFetchAddressPoolByLpAsset).not.toHaveBeenCalled();
  });
});
