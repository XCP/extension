import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type DispenserDetails, fetchAddressDispensers } from '@/core/counterparty/api';
import { useAddressDispensers } from '@/hooks/useAddressDispensers';

vi.mock('@/core/counterparty/api');
const fetchPage = vi.mocked(fetchAddressDispensers);
const rows = Array.from({ length: 237 }, (_, i) => ({
  tx_hash: `tx-${i}`, asset: `ASSET${i}`, oracle_address: null,
}) as DispenserDetails);
beforeEach(() => {
  vi.resetAllMocks();
  fetchPage.mockImplementation(async (_address, { offset = 0, limit = 10 } = {}) => ({
    result: rows.slice(offset, offset + limit), result_count: rows.length,
  }));
});

describe('lazy address dispenser browsing', () => {
  it('fetches only 20 initially and appends all later pages on demand', async () => {
    const { result } = renderHook(() => useAddressDispensers('address'));
    await waitFor(() => expect(result.current.data).toHaveLength(20));
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenLastCalledWith('address', { offset: 0, limit: 20, status: 'open', verbose: true });
    for (let count = 40; count < 257; count += 20) {
      act(() => result.current.loadMore());
      await waitFor(() => expect(result.current.data).toHaveLength(Math.min(count, 237)));
    }
    expect(result.current.data).toEqual(rows);
    expect(result.current.hasMore).toBe(false);
  });

  it('finds a linked asset beyond the first page without loading the whole address', async () => {
    const { result } = renderHook(() => useAddressDispensers('address', 'ASSET43'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toHaveLength(60);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('continues through an oracle-only first page', async () => {
    fetchPage.mockResolvedValueOnce({ result: rows.slice(0, 20).map(d => ({ ...d, oracle_address: 'oracle' })), result_count: 237 });
    const { result } = renderHook(() => useAddressDispensers('address'));
    await waitFor(() => expect(result.current.data).toEqual(rows.slice(20, 40)));
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('loads just enough pages to restore a selection when returning from review', async () => {
    const { result } = renderHook(() => useAddressDispensers('address', undefined, 43));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toHaveLength(60);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('preserves loaded rows on a later error and supports explicit retry', async () => {
    const { result } = renderHook(() => useAddressDispensers('address'));
    await waitFor(() => expect(result.current.data).toHaveLength(20));
    fetchPage.mockRejectedValueOnce(new Error('Second page unavailable'));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.error?.message).toBe('Second page unavailable'));
    expect(result.current.data).toHaveLength(20);
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.error).toBeNull());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.data).toHaveLength(40));
  });

  it('ignores an old address page after switching addresses', async () => {
    let resolveOld!: (value: { result: DispenserDetails[]; result_count: number }) => void;
    fetchPage.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    const { result, rerender } = renderHook(address => useAddressDispensers(address), { initialProps: 'old' });
    rerender('new');
    await waitFor(() => expect(result.current.data).toHaveLength(20));
    await act(async () => { resolveOld({ result: [{ ...rows[0]!, tx_hash: 'stale' }], result_count: 1 }); });
    expect(result.current.data).toEqual(rows.slice(0, 20));
  });
});
