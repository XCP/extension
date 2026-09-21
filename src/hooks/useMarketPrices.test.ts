import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type FiatCurrency, getBtc24hStats, getBtcPrice } from '@/core/bitcoin/price';
import { getXCPPrice } from '@/core/counterparty/price';
import { useMarketPrices } from './useMarketPrices';

vi.mock('@/core/bitcoin/price', () => ({ getBtc24hStats: vi.fn(), getBtcPrice: vi.fn() }));
vi.mock('@/core/counterparty/price', () => ({ getXCPPrice: vi.fn() }));

describe('current fiat quotes retain their currency identity', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getBtcPrice).mockResolvedValue(100000);
    vi.mocked(getXCPPrice).mockResolvedValue(2);
    vi.mocked(getBtc24hStats).mockResolvedValue({ price: 700000, change24h: 0 });
  });

  it('converts a current XCP USD quote using the BTC CNY/USD ratio', async () => {
    const { result } = renderHook(() => useMarketPrices('cny'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ btc: 700000, xcp: 14, currency: 'cny' });
    expect(getBtc24hStats).toHaveBeenCalledWith('cny');
    expect(getXCPPrice).toHaveBeenCalledWith(100000);
  });

  it('hides a loaded USD quote immediately when CNY is selected', async () => {
    const { result, rerender } = renderHook(({ currency }) => useMarketPrices(currency), { initialProps: { currency: 'usd' as FiatCurrency } });
    await waitFor(() => expect(result.current.btc).toBe(100000));
    vi.mocked(getBtc24hStats).mockReturnValue(new Promise(() => {}));
    rerender({ currency: 'cny' });
    expect(result.current).toMatchObject({ btc: null, xcp: null, currency: 'cny', loading: true });
  });

  it('a late USD answer cannot replace a newer CNY quote', async () => {
    let resolveUsd!: (value: number) => void;
    vi.mocked(getBtcPrice).mockReturnValueOnce(new Promise(resolve => { resolveUsd = resolve; }));
    const { result, rerender } = renderHook(({ currency }) => useMarketPrices(currency), { initialProps: { currency: 'usd' as FiatCurrency } });
    rerender({ currency: 'cny' });
    await waitFor(() => expect(result.current.xcp).toBe(14));
    await act(async () => { resolveUsd(12345); });
    expect(result.current).toMatchObject({ btc: 700000, xcp: 14, currency: 'cny' });
  });

  it('does not invent CNY when the currency quote is unavailable', async () => {
    vi.mocked(getBtc24hStats).mockResolvedValue(null);
    const { result } = renderHook(() => useMarketPrices('cny'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ btc: null, xcp: null, currency: 'cny' });
  });

  it('clears prior CNY estimates when an expired quote cannot refresh despite a new USD quote', async () => {
    const { result } = renderHook(() => useMarketPrices('cny'));
    await waitFor(() => expect(result.current.xcp).toBe(14));

    vi.mocked(getBtc24hStats).mockResolvedValue(null);
    vi.mocked(getBtcPrice).mockResolvedValue(200000);
    await act(async () => { await result.current.refetch(); });

    expect(result.current).toMatchObject({ btc: null, xcp: null, currency: 'cny', loading: false });
    expect(getXCPPrice).toHaveBeenLastCalledWith(200000);
  });
});
