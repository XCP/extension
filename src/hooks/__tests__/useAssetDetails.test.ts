import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAssetDetails } from '../useAssetDetails';
import { fetchAssetDetailsAndBalance, AssetInfo } from '@/utils/blockchain/counterparty/api';

// Mock the API and contexts
vi.mock('@/utils/blockchain/counterparty', () => ({
  fetchAssetDetailsAndBalance: vi.fn(),
  fetchTokenUtxos: vi.fn().mockResolvedValue([])
}));
vi.mock('@/utils/blockchain/bitcoin', () => ({
  fetchBTCBalance: vi.fn()
}));
vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    activeAddress: { address: 'bc1qtest123' }
  })
}));
vi.mock('@/contexts/header-context', () => ({
  useHeader: () => ({
    subheadings: { balances: {} },
    setBalanceHeader: vi.fn(),
    clearBalances: vi.fn()
  })
}));

describe('useAssetDetails', () => {
  const mockAssetInfo: AssetInfo = {
    asset: 'PEPECASH',
    asset_longname: null,
    issuer: 'bc1qissuer123',
    description: 'Rare Pepe Cash',
    divisible: true,
    locked: false,
    supply: '10000000.00000000',
    supply_normalized: '10000000.00000000'
  };
  
  const mockAssetDetails = {
    isDivisible: true,
    assetInfo: mockAssetInfo,
    availableBalance: '10000000.00000000'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch asset details on mount', async () => {
    vi.mocked(fetchAssetDetailsAndBalance).mockResolvedValue(mockAssetDetails);

    const { result } = renderHook(() => useAssetDetails('PEPECASH'));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await waitFor(() => {
      expect(result.current.data).not.toBeNull();
    });

    expect(fetchAssetDetailsAndBalance).toHaveBeenCalledWith('PEPECASH', 'bc1qtest123');
    expect(result.current.data).toEqual(expect.objectContaining({
      isDivisible: true,
      availableBalance: '10000000.00000000'
    }));
    expect(result.current.error).toBeNull();
  });

  it('should handle fetch error', async () => {
    const error = new Error('Asset not found');
    vi.mocked(fetchAssetDetailsAndBalance).mockRejectedValue(error);

    const { result } = renderHook(() => useAssetDetails('INVALID'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toEqual(error);
  });

  it('should not fetch if asset name is empty', () => {
    const { result } = renderHook(() => useAssetDetails(''));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(fetchAssetDetailsAndBalance).not.toHaveBeenCalled();
  });

  it('should not fetch if asset name is null', () => {
    const { result } = renderHook(() => useAssetDetails(null as any));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(fetchAssetDetailsAndBalance).not.toHaveBeenCalled();
  });

  it('should refetch when asset name changes', async () => {
    const asset1 = { 
      isDivisible: true,
      assetInfo: { ...mockAssetInfo, asset: 'ASSET1' },
      availableBalance: '100' 
    };
    const asset2 = { 
      isDivisible: true,
      assetInfo: { ...mockAssetInfo, asset: 'ASSET2' },
      availableBalance: '200' 
    };
    
    // Set up mock to return different values for different calls
    const mockFetch = vi.mocked(fetchAssetDetailsAndBalance);
    mockFetch.mockImplementation(async (asset: string) => {
      if (asset === 'ASSET1') return asset1;
      if (asset === 'ASSET2') return asset2;
      throw new Error(`Unexpected asset: ${asset}`);
    });

    const { result, rerender } = renderHook(
      ({ asset }) => useAssetDetails(asset),
      { initialProps: { asset: 'ASSET1' } }
    );

    // Wait for first asset to load
    await waitFor(() => {
      expect(result.current.data?.availableBalance).toBe('100');
      expect(result.current.isLoading).toBe(false);
    }, { timeout: 5000 });

    // Change asset
    rerender({ asset: 'ASSET2' });

    // Wait for second asset to load
    await waitFor(() => {
      expect(result.current.data?.availableBalance).toBe('200');
      expect(result.current.isLoading).toBe(false);
    }, { timeout: 5000 });

    // Should have called the API for the second asset (don't check exact count due to re-renders)
    expect(mockFetch).toHaveBeenCalledWith('ASSET2', 'bc1qtest123');
  });

  it('should handle BTC as special case', async () => {
    const { fetchBTCBalance } = await import('@/utils/blockchain/bitcoin/balance');
    vi.mocked(fetchBTCBalance).mockResolvedValue(100000000); // 1 BTC in satoshis

    const { result } = renderHook(() => useAssetDetails('BTC'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await waitFor(() => {
      expect(result.current.data).not.toBeNull();
    });

    expect(result.current.data).toEqual(expect.objectContaining({
      isDivisible: true,
      availableBalance: '1',
      assetInfo: expect.objectContaining({
        asset: 'BTC',
        asset_longname: null,
        description: 'Bitcoin',
        divisible: true,
        locked: true,
        supply: '2100000000000000',
        supply_normalized: '21000000',
        issuer: '',
        fair_minting: false
      })
    }));
    expect(fetchAssetDetailsAndBalance).not.toHaveBeenCalled();
  });

  it('should handle asset with longname', async () => {
    const longnameAssetInfo: AssetInfo = {
      ...mockAssetInfo,
      asset: 'A95428956661682177',
      asset_longname: 'VERY.LONG.ASSET.NAME'
    };
    const assetWithLongname = {
      isDivisible: true,
      assetInfo: longnameAssetInfo,
      availableBalance: '10000000.00000000'
    };
    vi.mocked(fetchAssetDetailsAndBalance).mockResolvedValue(assetWithLongname);

    const { result } = renderHook(() => useAssetDetails('A95428956661682177'));

    await waitFor(() => {
      expect(result.current.data?.assetInfo?.asset_longname).toBe('VERY.LONG.ASSET.NAME');
    }, { timeout: 3000 });
  });

  it('should handle indivisible assets', async () => {
    const indivisibleAssetInfo: AssetInfo = {
      asset: 'RAREPEPE',
      asset_longname: null,
      issuer: 'bc1qissuer123',
      description: 'Rare Pepe Cash',
      divisible: false,
      locked: false,
      supply: '1000',
      supply_normalized: '1000'
    };
    const indivisibleAsset = {
      isDivisible: false,
      assetInfo: indivisibleAssetInfo,
      availableBalance: '1000'
    };
    vi.mocked(fetchAssetDetailsAndBalance).mockResolvedValue(indivisibleAsset);

    const { result } = renderHook(() => useAssetDetails('RAREPEPE'));

    await waitFor(() => {
      expect(result.current.data?.isDivisible).toBe(false);
    }, { timeout: 3000 });

    expect(result.current.data?.isDivisible).toBe(false);
  });

  it('should cleanup on unmount', async () => {
    vi.mocked(fetchAssetDetailsAndBalance).mockResolvedValue(mockAssetDetails);

    const { result, unmount } = renderHook(() => useAssetDetails('PEPECASH'));

    await waitFor(() => {
      expect(result.current.data).toBeTruthy();
    }, { timeout: 3000 });

    // Should cleanup without errors
    expect(() => unmount()).not.toThrow();
  });
});