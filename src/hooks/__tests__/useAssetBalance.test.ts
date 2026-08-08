import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchBTCBalance } from '@/core/bitcoin/balance';
import { asBaseUnits, asDisplayUnits } from '@/core/numeric';
import { useAssetBalance } from '../useAssetBalance';
import { fetchAssetDetailsAndBalance } from '../utils/fetchAssetData';

// Mock the blockchain utilities
vi.mock('@/core/bitcoin/balance', () => ({
  fetchBTCBalance: vi.fn()
}));

vi.mock('../utils/fetchAssetData', () => ({
  fetchAssetDetailsAndBalance: vi.fn()
}));

// Mock the contexts with proper default implementations
vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    activeAddress: { address: 'bc1qtest123', label: 'Test Address' },
    activeWallet: { id: 'wallet-1', name: 'Test Wallet' }
  })
}));

// The balance cache is shared app-wide, so the mock has to be mutable: a test needs to be able to
// write into it the way a second mounted component would.
const headerCache = vi.hoisted(() => ({ balances: {} as Record<string, any> }));

vi.mock('@/contexts/header-context', () => ({
  useHeader: () => ({
    subheadings: { balances: headerCache.balances },
    setBalanceHeader: vi.fn(),
    clearBalances: vi.fn()
  })
}));

describe('useAssetBalance', () => {
  const mockXCPAssetInfo = {
    asset: 'XCP',
    asset_longname: null,
    description: 'Counterparty',
    divisible: true,
    locked: false,
    supply: asBaseUnits('2648755.95200000'),
    supply_normalized: asDisplayUnits('2648755.95200000'),
    issuer: '',
    fair_minting: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    headerCache.balances = {};
  });

  // A compose form reads the spendable balance from this hook. When another mounted component
  // refreshes the same asset it writes the new balance into the shared header cache — this hook
  // has to notice, or the form goes on showing the number it read when it mounted.
  it('picks up a balance another component wrote into the shared cache', async () => {
    headerCache.balances = {
      XCP: {
        asset: 'XCP',
        quantity_normalized: asDisplayUnits('10.00000000'),
        asset_info: { divisible: true },
      },
    };

    const { result, rerender } = renderHook(() => useAssetBalance('XCP'));

    await waitFor(() => expect(result.current.balance).toBe('10.00000000'));
    expect(fetchAssetDetailsAndBalance).not.toHaveBeenCalled();

    // Someone else refreshes XCP and writes the fresher figure into the shared cache.
    headerCache.balances = {
      XCP: {
        asset: 'XCP',
        quantity_normalized: asDisplayUnits('42.00000000'),
        asset_info: { divisible: true },
      },
    };
    rerender();

    await waitFor(() => expect(result.current.balance).toBe('42.00000000'));
    // Reading the cache must not trigger a network fetch.
    expect(fetchAssetDetailsAndBalance).not.toHaveBeenCalled();
  });

  it('picks up a divisibility correction from the shared cache', async () => {
    headerCache.balances = {
      RAREPEPE: {
        asset: 'RAREPEPE',
        quantity_normalized: asDisplayUnits('5'),
        asset_info: { divisible: true },
      },
    };

    const { result, rerender } = renderHook(() => useAssetBalance('RAREPEPE'));

    await waitFor(() => expect(result.current.isDivisible).toBe(true));

    headerCache.balances = {
      RAREPEPE: {
        asset: 'RAREPEPE',
        quantity_normalized: asDisplayUnits('5'),
        asset_info: { divisible: false },
      },
    };
    rerender();

    await waitFor(() => expect(result.current.isDivisible).toBe(false));
  });

  it('should fetch BTC balance successfully', async () => {
    vi.mocked(fetchBTCBalance).mockResolvedValue(100000000); // 1 BTC in satoshis

    const { result } = renderHook(() => useAssetBalance('BTC'));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.balance).toBeNull();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(fetchBTCBalance).toHaveBeenCalledWith('bc1qtest123');
    expect(result.current.balance).toBe('1');
    expect(result.current.isDivisible).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('should fetch Counterparty asset balance successfully', async () => {
    vi.mocked(fetchAssetDetailsAndBalance).mockResolvedValue({
      availableBalance: asDisplayUnits('1000.50000000'),
      isDivisible: true,
      assetInfo: mockXCPAssetInfo
    });

    const { result } = renderHook(() => useAssetBalance('XCP'));

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(fetchAssetDetailsAndBalance).toHaveBeenCalledWith('XCP', 'bc1qtest123');
    expect(result.current.balance).toBe('1000.50000000');
    expect(result.current.isDivisible).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('should handle empty asset name', () => {
    const { result } = renderHook(() => useAssetBalance(''));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.balance).toBeNull();
    expect(result.current.isDivisible).toBe(true);
    expect(result.current.error).toBeNull();

    expect(fetchBTCBalance).not.toHaveBeenCalled();
    expect(fetchAssetDetailsAndBalance).not.toHaveBeenCalled();
  });

  it('should handle BTC fetch error', async () => {
    const error = new Error('Network error');
    vi.mocked(fetchBTCBalance).mockRejectedValue(error);

    const { result } = renderHook(() => useAssetBalance('BTC'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.balance).toBeNull();
    expect(result.current.error).toBe(error);
  });

  it('should handle Counterparty asset fetch error', async () => {
    const error = new Error('Asset not found');
    vi.mocked(fetchAssetDetailsAndBalance).mockRejectedValue(error);

    const { result } = renderHook(() => useAssetBalance('INVALID'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.balance).toBeNull();
    expect(result.current.error).toBe(error);
  });
});