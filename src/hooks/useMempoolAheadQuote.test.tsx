import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMempoolOpenOrders, fetchOpenBookOrders } from '@/core/counterparty/api';
import { quoteAfterMempool } from '@/core/counterparty/poolQuote';
import { useMempoolAheadQuote } from './useMempoolAheadQuote';

vi.mock('@/core/counterparty/api', () => ({ fetchMempoolOpenOrders: vi.fn(), fetchOpenBookOrders: vi.fn() }));
vi.mock('@/core/counterparty/poolQuote', () => ({ quoteAfterMempool: vi.fn(() => ({ output: 1n })), XCP_POOL_FEE_BPS: 50, OTHER_POOL_FEE_BPS: 100 }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchMempoolOpenOrders).mockResolvedValue([{ give_asset: 'XCP', get_asset: 'TOKEN', give_quantity: '100' }] as any);
});

const read = () => renderHook(() => useMempoolAheadQuote({ giveAsset: 'XCP', getAsset: 'TOKEN', quantity: '100', pool: null, enabled: true }));

describe('raw order depth enters quote replay unchanged', () => {
  it('keeps get_remaining in its own raw units and preserves integers above double precision', async () => {
    vi.mocked(fetchOpenBookOrders).mockResolvedValue([{ give_asset: 'TOKEN', get_asset: 'XCP', give_quantity: '100', get_quantity: '10000000000000001', give_remaining: '50', get_remaining: '10000000000000001' }] as any);
    const { result } = read();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(quoteAfterMempool).toHaveBeenCalledWith({ pool: null, book: [{ giveQuantity: 100n, getQuantity: 10000000000000001n, giveRemaining: 50n, getRemaining: 10000000000000001n }] }, [100n], 100n);
  });

  it('does not assume get_remaining is XCP when the maker wants an indivisible asset', async () => {
    vi.mocked(fetchMempoolOpenOrders).mockResolvedValue([{ give_asset: 'TOKEN', get_asset: 'XCP', give_quantity: '1' }] as any);
    vi.mocked(fetchOpenBookOrders).mockResolvedValue([{ give_asset: 'XCP', get_asset: 'TOKEN', give_quantity: '100000000', get_quantity: '100', give_remaining: '50000000', get_remaining: '50' }] as any);
    const { result } = renderHook(() => useMempoolAheadQuote({ giveAsset: 'TOKEN', getAsset: 'XCP', quantity: '10', pool: null, enabled: true }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(quoteAfterMempool).toHaveBeenCalledWith({ pool: null, book: [{ giveQuantity: 100000000n, getQuantity: 100n, giveRemaining: 50000000n, getRemaining: 50n }] }, [1n], 10n);
  });

  it.each(['1,000', '1.5', '-5', 9007199254740992])('does not repair raw get_remaining %s into quote depth', async get_remaining => {
    vi.mocked(fetchOpenBookOrders).mockResolvedValue([{ give_asset: 'TOKEN', get_asset: 'XCP', give_quantity: '100', get_quantity: '100', give_remaining: '100', get_remaining }] as any);
    const { result } = read();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(quoteAfterMempool).not.toHaveBeenCalled();
  });
});
