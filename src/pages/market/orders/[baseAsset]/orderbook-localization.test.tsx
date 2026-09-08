import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HeaderProvider } from '@/contexts/header-context';
import { fetchAssetDetails, fetchOrderMatchesByPair, fetchOrdersByPair } from '@/core/counterparty/api';
import { configureLocale, t } from '@/i18n';
import AssetOrdersPage from './[quoteAsset]';

vi.mock('@/core/counterparty/api', () => ({ fetchAssetDetails: vi.fn(), fetchOrderMatchesByPair: vi.fn(), fetchOrdersByPair: vi.fn() }));
vi.mock('@/components/domain/asset/asset-header', () => ({ AssetHeader: () => <div /> }));
vi.mock('@/hooks/useInView', () => ({ useInView: () => ({ ref: null, inView: false }) }));
vi.mock('@/hooks/useCopyToClipboard', () => ({ useCopyToClipboard: () => ({ copy: vi.fn(), isCopied: () => false }) }));

function Destination() {
  const location = useLocation();
  return <output data-testid="destination">{location.pathname}{location.search}</output>;
}
beforeEach(() => {
  vi.clearAllMocks();
  configureLocale({ language: 'en', numberLocale: 'en-US' });
  vi.mocked(fetchAssetDetails).mockResolvedValue(null);
  vi.mocked(fetchOrdersByPair).mockResolvedValue({ result: [], result_count: 0 });
  vi.mocked(fetchOrderMatchesByPair).mockResolvedValue({ result: [], result_count: 0 });
});
afterEach(() => { cleanup(); configureLocale({ language: 'en' }); });

it.each(['buy', 'sell'] as const)('localizes the empty %s side in place and preserves API/filter/navigation values', async side => {
  render(<MemoryRouter initialEntries={['/market/orders/PARENT.child/PEPECASH']}><HeaderProvider>
    <Routes>
      <Route path="/market/orders/:baseAsset/:quoteAsset" element={<AssetOrdersPage />} />
      <Route path="/compose/order/:baseAsset" element={<Destination />} />
    </Routes>
  </HeaderProvider></MemoryRouter>);
  await screen.findByText('No sell orders for PARENT.child/PEPECASH');
  fireEvent.click(screen.getByRole('tab', { name: side === 'buy' ? 'Buy' : 'Sell' }));
  expect(screen.getByText(`No ${side} orders for PARENT.child/PEPECASH`)).toBeTruthy();
  const expected = side === 'buy'
    ? { ja: 'PARENT.child/PEPECASHの買い注文はありません', 'zh-CN': 'PARENT.child/PEPECASH 没有买单', 'zh-TW': 'PARENT.child/PEPECASH 沒有買單', 'zh-HK': 'PARENT.child/PEPECASH 沒有買單' }
    : { ja: 'PARENT.child/PEPECASHの売り注文はありません', 'zh-CN': 'PARENT.child/PEPECASH 没有卖单', 'zh-TW': 'PARENT.child/PEPECASH 沒有賣單', 'zh-HK': 'PARENT.child/PEPECASH 沒有賣單' };
  for (const language of ['ja', 'zh-CN', 'zh-TW', 'zh-HK'] as const) {
    act(() => { configureLocale({ language, numberLocale: 'de-DE' }); });
    expect(screen.getByText(expected[language])).toBeTruthy();
    expect(screen.getByRole('tab', { name: side === 'buy' ? t('common_buy') : t('common_sell') })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText(/No (buy|sell) orders|の(buy|sell)注文/)).toBeNull();
  }
  expect(fetchAssetDetails).toHaveBeenCalledTimes(1);
  expect(fetchAssetDetails).toHaveBeenCalledWith('PARENT.child');
  expect(fetchOrdersByPair).toHaveBeenCalledTimes(1);
  expect(fetchOrdersByPair).toHaveBeenCalledWith('PARENT.child', 'PEPECASH', { limit: 20, offset: 0, status: 'open' });
  expect(fetchOrderMatchesByPair).toHaveBeenCalledTimes(1);
  expect(fetchOrderMatchesByPair).toHaveBeenCalledWith('PARENT.child', 'PEPECASH', { limit: 20 });
  fireEvent.click(screen.getByRole('button', { name: t('common_create_new_order') }));
  expect(screen.getByTestId('destination').textContent).toBe(`/compose/order/PARENT.child?type=${side}&quote=PEPECASH`);
});
