import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/core/counterparty/api';
import { useMarketData } from '@/hooks/useMarketData';

vi.mock('@/core/counterparty/api');

function dispenser(tx_hash: string, oracle_address?: string | null) {
  return { tx_hash, oracle_address, asset: 'XCP' } as api.DispenserDetails;
}
const fixed = dispenser('fixed', null);
const oracle = dispenser('oracle', '1F6zwfr9VePPFJYFfQt9FWmMmJ1iVn1ziJ');
const options = {
  activeAddress: 'wallet', activeTab: 0, viewMode: 'explore' as const,
  searchQuery: '', inView: false,
};
const response = (result: api.DispenserDetails[]) => ({ result, result_count: result.length });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.fetchAllDispensers).mockResolvedValue(response([oracle, fixed]));
  vi.mocked(api.fetchAddressDispensers).mockResolvedValue(response([oracle, fixed]));
  vi.mocked(api.fetchAssetDispensers).mockResolvedValue(response([oracle, fixed]));
  vi.mocked(api.fetchAllOrders).mockResolvedValue({ result: [], result_count: 0 });
  vi.mocked(api.fetchOrders).mockResolvedValue({ result: [], result_count: 0 });
});

describe('dispenser visibility', () => {
  it('excludes oracle listings from explore, manage, and asset search', async () => {
    const { result } = renderHook(() => useMarketData(options));
    await waitFor(() => expect(result.current.dispensers.data).toEqual([fixed]));
    expect(result.current.userDispensers.data).toEqual([fixed]);
    expect(result.current.filteredUserDispensers).toEqual([fixed]);
    await act(async () => { await result.current.handleDispenserSearch('XCP'); });
    expect(result.current.dispenserResults).toEqual([fixed]);
  });

  it.each(['explore', 'manage'] as const)('gets past an oracle-only first page in %s', async (viewMode) => {
    const fetcher = viewMode === 'explore' ? api.fetchAllDispensers : api.fetchAddressDispensers;
    vi.mocked(fetcher)
      .mockResolvedValueOnce(response(Array.from({ length: 20 }, (_, i) => dispenser(`oracle-${i}`, 'feed'))))
      .mockResolvedValueOnce(response([fixed]));
    const { result } = renderHook(() => useMarketData({ ...options, viewMode }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      const page = viewMode === 'explore' ? result.current.dispensers : result.current.userDispensers;
      expect(page.data).toEqual([fixed]);
      expect(page.hasMore).toBe(false);
    });
    expect(vi.mocked(fetcher).mock.calls[1]?.at(-1)).toMatchObject({ offset: 20 });
  });

  it('uses raw row counts when loading another mixed page', async () => {
    vi.mocked(api.fetchAllDispensers)
      .mockResolvedValueOnce(response([fixed, ...Array.from({ length: 19 }, (_, i) => dispenser(`oracle-${i}`, 'feed'))]))
      .mockResolvedValueOnce(response([oracle, dispenser('second', '')]));
    const { result } = renderHook(() => useMarketData(options));
    await waitFor(() => expect(result.current.dispensers.data).toEqual([fixed]));
    expect(result.current.dispensers.hasMore).toBe(true);
    act(() => result.current.dispensers.loadMore());
    await waitFor(() => expect(result.current.dispensers.data.map(d => d.tx_hash)).toEqual(['fixed', 'second']));
    expect(api.fetchAllDispensers).toHaveBeenLastCalledWith({ offset: 20, limit: 20, status: 'open' });
  });
});
