import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { type BtcStats, type FiatCurrency, getBtc24hStats, getBtcPriceHistory, type PricePoint } from '@/core/bitcoin/price';
import { useMarketPrices } from '@/hooks/useMarketPrices';
import BtcPricePage from './btc';

const preferences = vi.hoisted(() => ({ fiat: 'usd' as FiatCurrency }));
vi.mock('@/contexts/settings-context', () => ({ useSettings: () => ({ settings: preferences }) }));
vi.mock('@/contexts/header-context', () => ({ useHeader: () => ({ setHeaderProps: vi.fn() }) }));
vi.mock('@/hooks/useFeeRates', () => ({ useFeeRates: () => ({ feeRates: null }) }));
vi.mock('@/hooks/useMarketPrices', () => ({ useMarketPrices: vi.fn(() => ({ btc: 100000, xcp: 2 })) }));
vi.mock('@/core/bitcoin/price', async (original) => ({
  ...await original<typeof import('@/core/bitcoin/price')>(), getBtc24hStats: vi.fn(), getBtcPriceHistory: vi.fn(),
}));
vi.mock('@/components/ui/charts/price-chart', () => ({
  PriceChart: ({ data, currencySymbol, loading }: { data: PricePoint[]; currencySymbol: string; loading?: boolean }) =>
    <div data-testid="history">{loading ? 'loading' : `${currencySymbol}${data[0]?.price}`}</div>,
}));

beforeEach(() => { vi.clearAllMocks(); preferences.fiat = 'usd'; });

it('resets USD history on saved CNY selection while retaining a correctly dimensioned BTC/XCP ratio', async () => {
  vi.mocked(getBtc24hStats).mockResolvedValue({ price: 100000, change24h: 0 });
  vi.mocked(getBtcPriceHistory).mockResolvedValue([{ timestamp: 1, price: 100000 }]);
  const { rerender } = render(<MemoryRouter><BtcPricePage /></MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId('history')).toHaveTextContent('USD 100000'));
  let resolveStats!: (value: BtcStats) => void;
  let resolveHistory!: (value: PricePoint[]) => void;
  vi.mocked(getBtc24hStats).mockReturnValue(new Promise(resolve => { resolveStats = resolve; }));
  vi.mocked(getBtcPriceHistory).mockReturnValue(new Promise(resolve => { resolveHistory = resolve; }));
  preferences.fiat = 'cny';
  rerender(<MemoryRouter><BtcPricePage /></MemoryRouter>);
  expect(screen.queryByTestId('history')).not.toBeInTheDocument();
  await act(async () => {
    resolveStats({ price: 700000, change24h: 0 });
    resolveHistory([{ timestamp: 1, price: 700000 }]);
  });
  expect(screen.getByTestId('history')).toHaveTextContent('CNY 700000');
  expect(screen.getByText('1 BTC = 50,000 XCP')).toBeInTheDocument();
  expect(getBtc24hStats).toHaveBeenLastCalledWith('cny');
  expect(getBtcPriceHistory).toHaveBeenLastCalledWith('24h', 'cny');
  expect(useMarketPrices).toHaveBeenLastCalledWith('usd');
});

it('keeps the selected range when an earlier, slower range request resolves last', async () => {
  vi.mocked(getBtc24hStats).mockResolvedValue({ price: 100000, change24h: 0 });
  vi.mocked(getBtcPriceHistory).mockResolvedValue([{ timestamp: 1, price: 100000 }]);
  render(<MemoryRouter><BtcPricePage /></MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId('history')).toHaveTextContent('USD 100000'));

  let resolveOneHour!: (value: PricePoint[]) => void;
  let resolveDay!: (value: PricePoint[]) => void;
  vi.mocked(getBtcPriceHistory)
    .mockReturnValueOnce(new Promise(resolve => { resolveOneHour = resolve; }))
    .mockReturnValueOnce(new Promise(resolve => { resolveDay = resolve; }));
  fireEvent.click(screen.getByRole('button', { name: /1h/i }));
  fireEvent.click(screen.getByRole('button', { name: /24h/i }));

  await act(async () => { resolveDay([{ timestamp: 1, price: 24 }]); });
  expect(screen.getByTestId('history')).toHaveTextContent('USD 24');
  await act(async () => { resolveOneHour([{ timestamp: 1, price: 1 }]); });
  expect(screen.getByTestId('history')).toHaveTextContent('USD 24');
  expect(screen.getByRole('button', { name: /24h/i })).toHaveAttribute('aria-pressed', 'true');
});

it('keeps the chart loading until the latest range request resolves', async () => {
  vi.mocked(getBtc24hStats).mockResolvedValue({ price: 100000, change24h: 0 });
  vi.mocked(getBtcPriceHistory).mockResolvedValue([{ timestamp: 1, price: 100000 }]);
  render(<MemoryRouter><BtcPricePage /></MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId('history')).toHaveTextContent('USD 100000'));

  let resolveDay!: (value: PricePoint[]) => void;
  let resolveOneHour!: (value: PricePoint[]) => void;
  vi.mocked(getBtcPriceHistory)
    .mockReturnValueOnce(new Promise(resolve => { resolveDay = resolve; }))
    .mockReturnValueOnce(new Promise(resolve => { resolveOneHour = resolve; }));
  fireEvent.click(screen.getByRole('button', { name: /24h/i }));
  fireEvent.click(screen.getByRole('button', { name: /1h/i }));

  await act(async () => { resolveDay([{ timestamp: 1, price: 24 }]); });
  expect(screen.getByTestId('history')).toHaveTextContent('loading');
  await act(async () => { resolveOneHour([{ timestamp: 1, price: 1 }]); });
  expect(screen.getByTestId('history')).toHaveTextContent('USD 1');
});
