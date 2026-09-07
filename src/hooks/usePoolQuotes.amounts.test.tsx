import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPoolDepositQuote, fetchPoolQuote, fetchPoolWithdrawQuote } from '@/core/counterparty/api';
import { usePoolDepositQuote, usePoolSwapQuote, usePoolWithdrawQuote } from './usePoolQuotes';

vi.mock('@/core/counterparty/api', () => ({ fetchPoolDepositQuote: vi.fn(), fetchPoolQuote: vi.fn(), fetchPoolWithdrawQuote: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

describe('quotes require a complete exact current draft', () => {
  it.each(['-5', '1e5', '0,5', '1.2.3', '0.000000001', '1.'])('never requests invalid swap %s', async quantity => {
    const { result } = renderHook(() => usePoolSwapQuote({ giveAsset: 'XCP', getAsset: 'TOKEN', quantity, isGiveDivisible: true, enabled: true }));
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(fetchPoolQuote).not.toHaveBeenCalled(); expect(result.current.data).toBeNull();
  });
  it('discarding a valid swap draft immediately invalidates its quote', async () => {
    vi.mocked(fetchPoolQuote).mockResolvedValue({ estimated_output: 100 } as any);
    const { result, rerender } = renderHook(({ quantity }) => usePoolSwapQuote({ giveAsset: 'XCP', getAsset: 'TOKEN', quantity, isGiveDivisible: true, enabled: true }), { initialProps: { quantity: '1.5' } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(fetchPoolQuote).toHaveBeenLastCalledWith('XCP', 'TOKEN', '150000000');
    expect(result.current.data).toMatchObject({ estimated_output: 100 });
    rerender({ quantity: '1.5e' }); expect(result.current.data).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(500)); expect(fetchPoolQuote).toHaveBeenCalledTimes(1);
  });
  it('deposit rejects fractional indivisible quantities without flooring', async () => {
    renderHook(() => usePoolDepositQuote({ assetA: 'TOKEN', assetB: 'XCP', quantityA: '0.5', isAssetADivisible: false, enabled: true }));
    await act(() => vi.advanceTimersByTimeAsync(500)); expect(fetchPoolDepositQuote).not.toHaveBeenCalled();
  });
  it('withdraw sends exact LP units above double precision', async () => {
    vi.mocked(fetchPoolWithdrawQuote).mockResolvedValue({ pool_exists: true } as any);
    renderHook(() => usePoolWithdrawQuote({ assetA: 'TOKEN', assetB: 'XCP', quantity: '100000000.00000001', enabled: true }));
    await act(() => vi.advanceTimersByTimeAsync(300)); expect(fetchPoolWithdrawQuote).toHaveBeenCalledWith('TOKEN', 'XCP', '10000000000000001');
  });
});
