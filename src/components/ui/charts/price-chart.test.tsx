import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { configureLocale, t } from '@/i18n';
import { PriceChart } from './price-chart';

const canvas = {
  scale: vi.fn(), clearRect: vi.fn(), fillText: vi.fn(), createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
  setLineDash: vi.fn(), arc: vi.fn(),
};
beforeEach(() => {
  vi.clearAllMocks();
  configureLocale({ language: 'en' });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvas as unknown as CanvasRenderingContext2D);
});
afterEach(() => { configureLocale({}); vi.restoreAllMocks(); });

it('redraws a memoized empty chart when the language changes without replacing its data', () => {
  const data: [] = [];
  render(<PriceChart data={data} />);
  expect(canvas.fillText).toHaveBeenLastCalledWith(t('charts_price_chart_no_data_available'), 150, 100);
  act(() => configureLocale({ language: 'ja' }));
  expect(canvas.fillText).toHaveBeenLastCalledWith(t('charts_price_chart_no_data_available'), 150, 100);
  expect(screen.getByRole('img')).toHaveAccessibleName(t('charts_price_chart_price_chart'));
});

it('keeps the hovered point while updating its price and date formatting', () => {
  const timestamp = Date.UTC(2026, 8, 7, 12);
  const data = [{ timestamp, price: 1234.5 }, { timestamp: timestamp + 86400000, price: 1235.6 }];
  render(<PriceChart data={data} currencySymbol="USD " priceDecimals={2} timeFormat="date" />);
  fireEvent.mouseMove(screen.getByRole('img'), { clientX: 10 });
  expect(screen.getByText('USD 1,234.5')).toBeVisible();
  act(() => configureLocale({ language: 'ja', numberLocale: 'de-DE' }));
  expect(screen.getByText('USD 1.234,5')).toBeVisible();
  expect(screen.getByText(new Date(timestamp).toLocaleDateString('de-DE', { year: 'numeric', month: 'short', day: 'numeric' }))).toBeVisible();
  expect(data[0]).toEqual({ timestamp, price: 1234.5 });
});
