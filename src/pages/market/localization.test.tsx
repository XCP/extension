import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getBtc24hStats, getBtcPriceHistory } from '@/core/bitcoin/price';
import { getXcpPriceHistory, getXcpStats } from '@/core/counterparty/price';
import { configureLocale, t } from '@/i18n';
import BtcPricePage from './btc';
import XcpPricePage from './xcp';

const stable = vi.hoisted(() => ({ header: { setHeaderProps: vi.fn() } }));
vi.mock('@/contexts/header-context', () => ({ useHeader: () => stable.header }));
vi.mock('@/contexts/settings-context', () => ({ useSettings: () => ({ settings: { fiat: 'usd' } }) }));
vi.mock('@/hooks/useFeeRates', () => ({ useFeeRates: () => ({ feeRates: { fastestFee: 2.5, halfHourFee: 1.25, hourFee: 0.12345678 } }) }));
vi.mock('@/hooks/useMarketPrices', () => ({ useMarketPrices: () => ({ btc: 100000, xcp: 2 }) }));
vi.mock('@/core/bitcoin/price', async original => ({
  ...await original<typeof import('@/core/bitcoin/price')>(), getBtc24hStats: vi.fn(), getBtcPriceHistory: vi.fn(),
}));
vi.mock('@/core/counterparty/price', () => ({ getXcpStats: vi.fn(), getXcpPriceHistory: vi.fn() }));
vi.mock('@/components/ui/charts/price-chart', () => ({ PriceChart: () => <div data-testid="price-chart" /> }));

beforeEach(() => {
  vi.clearAllMocks();
  configureLocale({ language: 'en' });
  vi.mocked(getBtc24hStats).mockResolvedValue(null);
  vi.mocked(getXcpStats).mockResolvedValue(null);
  vi.mocked(getBtcPriceHistory).mockRejectedValue(new Error('offline'));
  vi.mocked(getXcpPriceHistory).mockRejectedValue(new Error('offline'));
});
afterEach(() => configureLocale({}));

it.each(['BTC', 'XCP'] as const)('%s errors and selected range update in place without reloading prices', async asset => {
  const Page = asset === 'BTC' ? BtcPricePage : XcpPricePage;
  render(<MemoryRouter><Page /></MemoryRouter>);
  await screen.findByText('Unable to load chart data');
  const history = asset === 'BTC' ? getBtcPriceHistory : getXcpPriceHistory;
  const stats = asset === 'BTC' ? getBtc24hStats : getXcpStats;
  if (asset === 'XCP') fireEvent.click(screen.getByRole('button', { name: 'All' }));
  const reads = vi.mocked(history).mock.calls.length;
  for (const language of ['ja', 'zh-CN', 'zh-TW', 'zh-HK'] as const) {
    act(() => configureLocale({ language, numberLocale: 'de-DE' }));
    await screen.findByText(t('common_unable_to_load_price'));
    expect(screen.getByText(t('common_unable_to_load_chart_data'))).toBeVisible();
    expect(screen.queryByText('Unable to load chart data')).not.toBeInTheDocument();
    expect(stable.header.setHeaderProps).toHaveBeenLastCalledWith(expect.objectContaining({
      title: t(asset === 'BTC' ? 'market_btc_bitcoin_price' : 'market_xcp_xcp_price'),
      rightButton: expect.objectContaining({ ariaLabel: t('common_refresh_price') }),
    }));
    const selected = asset === 'BTC' ? t('charts_range_hours', ['24']) : t('market_xcp_all');
    expect(screen.getByRole('button', { name: selected })).toHaveAttribute('aria-pressed', 'true');
    if (asset === 'BTC') expect(screen.getByText('0,12345678')).toBeVisible();
    expect(history).toHaveBeenCalledTimes(reads);
    expect(stats).toHaveBeenCalledTimes(1);
  }
  const chartFailure = screen.getByText(t('common_unable_to_load_chart_data')).parentElement!;
  fireEvent.click(within(chartFailure).getByRole('button', { name: t('common_try_again') }));
  await waitFor(() => expect(history).toHaveBeenCalledTimes(reads + 1));
  if (asset === 'BTC') expect(getBtcPriceHistory).toHaveBeenLastCalledWith('24h', 'usd');
});
