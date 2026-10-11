import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAssetDetails } from '@/core/counterparty/api';
import { asBaseUnits, asDisplayUnits } from '@/core/numeric';
import { useAssetInfo } from '../useAssetInfo';

// Mock the blockchain utilities
vi.mock('@/core/counterparty/api');

// Mock the wallet context
vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    activeAddress: { address: 'bc1qtest123', label: 'Test Address' }
  })
}));

describe('useAssetInfo', () => {

  const mockBTCAssetInfo = {
    asset: 'BTC',
    asset_longname: null,
    description: 'Bitcoin',
    divisible: true,
    locked: true,
    supply: asBaseUnits('2100000000000000'),
    supply_normalized: asDisplayUnits('21000000'),
    issuer: '',
    fair_minting: false,
  };

  const mockXCPAssetInfo = {
    asset: 'XCP',
    asset_longname: null,
    description: 'Counterparty',
    divisible: true,
    locked: false,
    supply: asBaseUnits('2648755.95200000'),
    supply_normalized: asDisplayUnits('2648755.95200000'),
    issuer: 'bc1qissuer123',
    fair_minting: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return BTC asset info immediately without API call', () => {
    const { result } = renderHook(() => useAssetInfo('BTC'));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toEqual(mockBTCAssetInfo);
    expect(result.current.error).toBeNull();

    // Should not make API call for BTC
    expect(fetchAssetDetails).not.toHaveBeenCalled();
  });

  it('should fetch Counterparty asset info successfully', async () => {
    vi.mocked(fetchAssetDetails).mockResolvedValue(mockXCPAssetInfo);

    const { result } = renderHook(() => useAssetInfo('XCP'));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(fetchAssetDetails).toHaveBeenCalledWith('XCP');
    expect(result.current.data).toEqual(mockXCPAssetInfo);
    expect(result.current.error).toBeNull();
  });

  it('should handle fetch error gracefully', async () => {
    const error = new Error('Asset not found');
    vi.mocked(fetchAssetDetails).mockRejectedValue(error);

    const { result } = renderHook(() => useAssetInfo('INVALID'));

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe(error);
  });

  it('should handle empty asset name', () => {
    const { result } = renderHook(() => useAssetInfo(''));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(fetchAssetDetails).not.toHaveBeenCalled();
  });

  it('should handle whitespace-only asset name', () => {
    const { result } = renderHook(() => useAssetInfo('   '));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(fetchAssetDetails).not.toHaveBeenCalled();
  });

  it('reports an asset-not-found error when the API returns no metadata', async () => {
    vi.mocked(fetchAssetDetails).mockResolvedValue(null);
    const { result } = renderHook(() => useAssetInfo('UNKNOWN'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error?.message).toBe('Asset not found: UNKNOWN');
    expect(result.current.data).toBeNull();
  });

  it('should refetch when asset changes', async () => {
    const asset1Info = { ...mockXCPAssetInfo, asset: 'ASSET1' };
    const asset2Info = { ...mockXCPAssetInfo, asset: 'ASSET2' };

    vi.mocked(fetchAssetDetails).mockImplementation(async (asset: string) => {
      if (asset === 'ASSET1') {
        return asset1Info;
      }
      if (asset === 'ASSET2') {
        return asset2Info;
      }
      throw new Error(`Unexpected asset: ${asset}`);
    });

    const { result, rerender } = renderHook(
      ({ asset }) => useAssetInfo(asset),
      { initialProps: { asset: 'ASSET1' } }
    );

    await waitFor(() => {
      expect(result.current.data?.asset).toBe('ASSET1');
      expect(result.current.isLoading).toBe(false);
    });

    // Change asset
    rerender({ asset: 'ASSET2' });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.data?.asset).toBe('ASSET2');
      expect(result.current.isLoading).toBe(false);
    });

    expect(fetchAssetDetails).toHaveBeenCalledWith('ASSET2');
  });



  it('should handle string errors gracefully', async () => {
    vi.mocked(fetchAssetDetails).mockRejectedValue('String error message');

    const { result } = renderHook(() => useAssetInfo('XCP'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toEqual(new Error('String error message'));
    expect(result.current.data).toBeNull();
  });

  it('should handle asset with longname', async () => {
    const longnameAssetInfo = {
      ...mockXCPAssetInfo,
      asset: 'A95428956661682177',
      asset_longname: 'VERY.LONG.ASSET.NAME'
    };

    vi.mocked(fetchAssetDetails).mockResolvedValue(longnameAssetInfo);

    const { result } = renderHook(() => useAssetInfo('A95428956661682177'));

    await waitFor(() => {
      expect(result.current.data?.asset_longname).toBe('VERY.LONG.ASSET.NAME');
    });

    expect(result.current.data).toEqual(longnameAssetInfo);
  });

  it('should handle indivisible assets', async () => {
    const indivisibleAssetInfo = {
      ...mockXCPAssetInfo,
      asset: 'RAREPEPE',
      divisible: false
    };

    vi.mocked(fetchAssetDetails).mockResolvedValue(indivisibleAssetInfo);

    const { result } = renderHook(() => useAssetInfo('RAREPEPE'));

    await waitFor(() => {
      expect(result.current.data?.divisible).toBe(false);
    });

    expect(result.current.data?.asset).toBe('RAREPEPE');
    expect(result.current.data?.divisible).toBe(false);
  });
});