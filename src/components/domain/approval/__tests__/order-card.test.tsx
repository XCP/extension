import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderAction } from '../order-card';
import { OrderCard } from '../order-card';

/**
 * The card shows a guaranteed minimum beside the wallet's own market estimate. The estimate is
 * decoration and must never gate signing; the warnings drawn from it are the part that can misfire,
 * so the thresholds are pinned here rather than left to be noticed on a real approval.
 */

const mockFetchPoolQuote = vi.fn();
vi.mock('@/core/counterparty/api', () => ({
  fetchPoolQuote: (...args: unknown[]) => mockFetchPoolQuote(...args),
}));

/** An order giving 1 XCP for at least 100 units of a divisible asset. */
const order = (overrides: Partial<OrderAction> = {}): OrderAction => ({
  giveAmount: '1.00000000',
  giveAsset: 'XCP',
  getAmount: '100.00000000',
  getAsset: 'MYASSET',
  normalizedGive: 1,
  normalizedGet: 100,
  expiration: 1,
  giveAssetRaw: 'XCP',
  getAssetRaw: 'MYASSET',
  giveQuantityRaw: '100000000',
  getQuantityRaw: '10000000000',
  getDivisor: 1e8,
  ...overrides,
});

/** A quote whose estimate is `estimatedRaw` base units, routed through the pool. */
const quote = (estimatedRaw: number) => ({
  estimated_output: estimatedRaw,
  pool_output: estimatedRaw,
  book_output: 0,
});

describe('OrderCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchPoolQuote.mockResolvedValue(quote(10_000_000_000));
  });

  afterEach(() => {
    cleanup();
  });

  it('names the receive amount as a minimum', async () => {
    // No quote, and a give amount that keeps the price ratio from also reading 100.00000000.
    mockFetchPoolQuote.mockRejectedValue(new Error('offline'));
    render(<OrderCard order={order({ giveAmount: '2.00000000', normalizedGive: 2 })} />);

    expect(screen.getByText('You receive at least')).toBeInTheDocument();
    expect(screen.getByText(/100\.00000000/)).toBeInTheDocument();
  });

  it('shows the wallet\'s own estimate beside it', async () => {
    // Estimate 101 units against a 100 minimum: a 1% cushion, no warning.
    mockFetchPoolQuote.mockResolvedValue(quote(10_100_000_000));
    render(<OrderCard order={order()} />);

    expect(await screen.findByText(/~101\.00000000 estimated/)).toBeInTheDocument();
    expect(screen.queryByText(/Make sure that is the slippage/)).not.toBeInTheDocument();
  });

  it('shows the estimate whichever venue it came from', async () => {
    // Book-only and split routes are the same figure to the reader: an estimate, not a promise.
    mockFetchPoolQuote.mockResolvedValue({
      estimated_output: 10_100_000_000,
      pool_output: 0,
      book_output: 10_100_000_000,
    });
    render(<OrderCard order={order()} />);

    expect(await screen.findByText(/~101\.00000000 estimated/)).toBeInTheDocument();
  });

  it('withholds an estimate with neither a pool nor a book behind it', async () => {
    // A total with no venue reporting it describes no market the order could fill against.
    mockFetchPoolQuote.mockResolvedValue({
      estimated_output: 10_100_000_000,
      pool_output: 0,
      book_output: 0,
    });
    render(<OrderCard order={order()} />);

    await waitFor(() => expect(mockFetchPoolQuote).toHaveBeenCalled());
    expect(screen.queryByText(/estimated/)).not.toBeInTheDocument();
  });

  it('warns once the minimum sits 5% or more below the estimate', async () => {
    // Minimum 100, estimate 105.264 -> 5.0% implied slippage.
    mockFetchPoolQuote.mockResolvedValue(quote(10_526_400_000));
    render(<OrderCard order={order()} />);

    expect(await screen.findByText(/accepts up to 5\.0% less/)).toBeInTheDocument();
  });

  it('stays quiet just under the threshold', async () => {
    // Minimum 100, estimate 104 -> 3.8%, below the 5% line.
    mockFetchPoolQuote.mockResolvedValue(quote(10_400_000_000));
    render(<OrderCard order={order()} />);

    await screen.findByText(/~104\.00000000/);
    expect(screen.queryByText(/Make sure that is the slippage/)).not.toBeInTheDocument();
  });

  it('says the order will likely rest when the market is below the minimum', async () => {
    // Estimate 95 against a 100 minimum: nothing can fill this right now.
    mockFetchPoolQuote.mockResolvedValue(quote(9_500_000_000));
    render(<OrderCard order={order()} />);

    expect(await screen.findByText(/likely to rest unfilled/)).toBeInTheDocument();
    // The estimate line is for a cushion, not a shortfall — it would read as reassurance.
    expect(screen.queryByText(/estimated/)).not.toBeInTheDocument();
  });

  it('shows the minimum alone when the node cannot be reached', async () => {
    mockFetchPoolQuote.mockRejectedValue(new Error('offline'));
    render(<OrderCard order={order()} />);

    await waitFor(() => expect(mockFetchPoolQuote).toHaveBeenCalled());
    expect(screen.getByText('You receive at least')).toBeInTheDocument();
    expect(screen.queryByText(/estimated/)).not.toBeInTheDocument();
    expect(screen.queryByText(/likely to rest unfilled/)).not.toBeInTheDocument();
  });

  it('does not quote a BTC pair, which has no market here', async () => {
    render(<OrderCard order={order({ getAssetRaw: 'BTC', getAsset: 'BTC' })} />);

    expect(screen.getByText('You receive at least')).toBeInTheDocument();
    expect(mockFetchPoolQuote).not.toHaveBeenCalled();
  });

  it('withholds the estimate when divisibility is unknown', async () => {
    // The local-unpack path cannot establish divisibility; scaling by a guess is wrong by 1e8.
    render(<OrderCard order={order({ getDivisor: null })} />);

    await waitFor(() => expect(mockFetchPoolQuote).toHaveBeenCalled());
    expect(screen.queryByText(/estimated/)).not.toBeInTheDocument();
  });

  it('asks the node for the give quantity in base units', async () => {
    render(<OrderCard order={order()} />);

    await waitFor(() => {
      expect(mockFetchPoolQuote).toHaveBeenCalledWith('XCP', 'MYASSET', '100000000');
    });
  });
});
