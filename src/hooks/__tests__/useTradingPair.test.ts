import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTradingPair } from '../useTradingPair';

/** One pending answer per pair, resolved by the test in whatever order it likes. */
const answers = new Map<string, (price: number | null) => void>();

function marketResponse(base: string, quote: string, price: number | null) {
  return new Response(JSON.stringify({ result: { baseAsset: base, quoteAsset: quote, lastPrice: price } }), { status: 200 });
}

beforeEach(() => {
  answers.clear();
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    const [base, quote] = new URL(url).pathname.split('/').slice(-2).map(decodeURIComponent);
    return new Promise<Response>(resolve => {
      answers.set(`${base}/${quote}`, price => resolve(marketResponse(base!, quote!, price)));
    });
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const answer = async (pair: string, price: number | null) => {
  await waitFor(() => expect(answers.has(pair)).toBe(true));
  await act(async () => { answers.get(pair)!(price); });
};

describe('useTradingPair', () => {
  it('reports the last trade price of the pair it was asked for', async () => {
    const { result } = renderHook(() => useTradingPair('PEPECASH', 'BTC'));
    await answer('PEPECASH/BTC', 0.0001);
    expect(result.current.data).toEqual({ last_trade_price: '0.0001', name: 'PEPECASH/BTC' });
  });

  it('ignores a late answer for the pair it has moved away from', async () => {
    const { result, rerender } = renderHook(({ give }) => useTradingPair(give, 'BTC'), {
      initialProps: { give: 'OLDASSET' },
    });
    await waitFor(() => expect(answers.has('OLDASSET/BTC')).toBe(true));

    rerender({ give: 'NEWASSET' });
    await answer('NEWASSET/BTC', 2);
    await answer('OLDASSET/BTC', 1);

    expect(result.current.data).toEqual({ last_trade_price: '2', name: 'NEWASSET/BTC' });
  });

  it("never offers the previous pair's price while the new one loads", async () => {
    const { result, rerender } = renderHook(({ give }) => useTradingPair(give, 'BTC'), {
      initialProps: { give: 'OLDASSET' },
    });
    await answer('OLDASSET/BTC', 1);
    expect(result.current.data?.last_trade_price).toBe('1');

    rerender({ give: 'NEWASSET' });

    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(true);
    await answer('NEWASSET/BTC', 2);
    expect(result.current.data?.last_trade_price).toBe('2');
    expect(result.current.isLoading).toBe(false);
  });

  it('does not let a late failure for the old pair erase the new pair', async () => {
    vi.mocked(fetch).mockImplementationOnce(() => Promise.reject(new Error('offline')));
    const { result, rerender } = renderHook(({ give }) => useTradingPair(give, 'BTC'), {
      initialProps: { give: 'OLDASSET' },
    });
    rerender({ give: 'NEWASSET' });
    await answer('NEWASSET/BTC', 2);

    expect(result.current.data?.last_trade_price).toBe('2');
    expect(result.current.error).toBeNull();
  });

  it('clears when either side is missing', async () => {
    const { result } = renderHook(() => useTradingPair(undefined, 'BTC'));
    expect(result.current.data).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
