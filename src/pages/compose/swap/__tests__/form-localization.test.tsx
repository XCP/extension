import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PoolQuote } from '@/core/counterparty/api';
import type { OrderOptions } from '@/core/counterparty/compose';
import { configureLocale, t } from '@/i18n';
import { useLocaleRevision } from '@/i18n/use-locale';
import { SwapForm } from '../form';

const fixture = vi.hoisted(() => ({ quote: {} as PoolQuote, readQuote: vi.fn(), action: vi.fn() }));
vi.mock('@/contexts/settings-context', () => ({ useSettings: () => ({ updateSettings: vi.fn() }) }));
vi.mock('@/contexts/composer-context-object', () => ({
  useComposer: () => ({
    state: { error: null, isComposing: false }, clearError: vi.fn(),
    activeAddress: { address: '1CounterpartyXXXXXXXXXXXXXXXUWLpVr' }, activeWallet: { name: 'Test' },
    showHelpText: true, feeRate: 1, setFeeRate: vi.fn(), settings: { defaultPoolSlippage: '1' },
  }),
}));
vi.mock('@/hooks/useAssetDetails', () => ({
  useAssetDetails: (asset: string) => ({ data: {
    assetInfo: { asset, divisible: asset !== 'TOKEN' }, isDivisible: asset !== 'TOKEN',
    availableBalance: '100', spendableBalance: '100',
  } }),
}));
vi.mock('@/hooks/usePool', () => ({ usePool: () => ({ data: {}, isLoading: false }) }));
vi.mock('@/hooks/useMempoolAheadQuote', () => ({ useMempoolAheadQuote: () => ({ data: null }) }));
vi.mock('@/hooks/usePoolQuotes', () => ({
  usePoolSwapQuote: (options: { enabled: boolean }) => {
    fixture.readQuote(options);
    return { data: options.enabled ? fixture.quote : null, isLoading: false };
  },
}));
vi.mock('@/components/domain/balance/amount-with-max-input', () => ({
  AmountWithMaxInput: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <input aria-label="Amount draft" value={value} onChange={event => onChange(event.target.value)} />
  ),
}));
vi.mock('@/components/domain/asset/asset-select-input', () => ({ AssetSelectInput: () => null }));
vi.mock('@/components/domain/address/address-header', () => ({ AddressHeader: () => null }));
vi.mock('@/components/ui/inputs/fee-rate-input', () => ({ FeeRateInput: () => null }));

// The real popup subscribes above its route, so preference changes re-render without remounting.
function LocalizedSwap() {
  useLocaleRevision();
  return <SwapForm
    formAction={fixture.action}
    initialFormData={{ give_asset: 'XCP', get_asset: 'TOKEN', give_quantity: '2' } as OrderOptions}
  />;
}

const routes = [
  { label: 'pool', pool_exists: true, pool_output: 2469, book_output: 0, book_orders_matched: 0 },
  { label: 'one order', pool_exists: false, pool_output: 0, book_output: 2469, book_orders_matched: 1 },
  { label: 'many orders', pool_exists: false, pool_output: 0, book_output: 2469, book_orders_matched: 3 },
  { label: 'pool + one order', pool_exists: true, pool_output: 1000, book_output: 1469, book_orders_matched: 1 },
  { label: 'pool + many orders', pool_exists: true, pool_output: 1000, book_output: 1469, book_orders_matched: 3 },
];
const locales = [
  { language: 'en', expected: ['Pool', '1 order', '3 orders', 'Pool + 1 order', 'Pool + 3 orders'] },
  { language: 'ja', expected: ['プール', '1 件の注文', '3 件の注文', 'プール + 1 件の注文', 'プール + 3 件の注文'] },
  { language: 'zh-CN', expected: ['流动性池', '1 笔订单', '3 笔订单', '流动性池 + 1 笔订单', '流动性池 + 3 笔订单'] },
  { language: 'zh-TW', expected: ['流動性池', '1 筆委託', '3 筆委託', '流動性池 + 1 筆委託', '流動性池 + 3 筆委託'] },
  { language: 'zh-HK', expected: ['流動性池', '1 筆訂單', '3 筆訂單', '流動性池 + 1 筆訂單', '流動性池 + 3 筆訂單'] },
];

function setQuote(route = routes[4]!) {
  fixture.quote = Object.freeze({
    estimated_output: 2469, give_remaining: 0, price_impact: 0, ...route,
  }) as unknown as PoolQuote;
}

function openDetails() {
  fireEvent.click(screen.getByRole('button', { name: t('swap_form_show_swap_details') }));
}

function routeText() {
  return screen.getByText(t('swap_form_route'), { selector: 'span' }).nextElementSibling?.textContent;
}

function hiddenValues(form: HTMLFormElement) {
  return Object.fromEntries(Array.from(form.querySelectorAll<HTMLInputElement>('input[type="hidden"]'))
    .map(input => [input.name, input.value]));
}

beforeEach(() => {
  vi.clearAllMocks();
  configureLocale({ language: 'en', numberLocale: 'en-US' });
  setQuote();
});
afterEach(() => { cleanup(); configureLocale({}); });

describe.each(locales)('$language quote routing', ({ language, expected }) => {
  it.each(routes.map((route, index) => ({ ...route, index })))('localizes $label', ({ index, ...route }) => {
    setQuote(route);
    configureLocale({ language });
    render(<LocalizedSwap />);
    openDetails();
    expect(routeText()).toBe(expected[index]);
    expect(screen.getByRole('button', { name: t('swap_form_review_swap') })).toBeEnabled();
    expect(fixture.action).not.toHaveBeenCalled();
  });
});

it('updates a memoized quote display in place without changing valid or invalid amount drafts', () => {
  render(<LocalizedSwap />);
  openDetails();
  const quote = fixture.quote;
  const amount = screen.getByRole('textbox', { name: 'Amount draft' });
  const form = amount.closest('form')!;
  const canonical = hiddenValues(form);
  expect(screen.getByText('1 XCP ≈ 1,234.5 TOKEN')).toBeInTheDocument();
  expect(canonical).toMatchObject({ give_asset: 'XCP', get_asset: 'TOKEN', give_quantity: '2' });

  for (const locale of locales) {
    act(() => configureLocale({ language: locale.language, numberLocale: 'en-US' }));
    expect(routeText()).toBe(locale.expected[4]);
    expect(screen.getByRole('textbox', { name: 'Amount draft' })).toBe(amount);
    expect(amount).toHaveValue('2');
    expect(hiddenValues(form)).toEqual(canonical);
    expect(fixture.quote).toBe(quote);
    expect(fixture.readQuote).toHaveBeenLastCalledWith(expect.objectContaining({ quantity: '2', enabled: true }));
  }

  act(() => configureLocale({ language: 'ja', numberLocale: 'de-DE' }));
  expect(screen.getByText('1 XCP ≈ 1.234,5 TOKEN')).toBeInTheDocument();
  expect(routeText()).toBe('プール + 3 件の注文');
  expect(hiddenValues(form)).toEqual(canonical);

  fireEvent.change(amount, { target: { value: '1,25' } });
  act(() => configureLocale({ language: 'zh-CN', numberLocale: 'en-US' }));
  expect(screen.getByRole('textbox', { name: 'Amount draft' })).toBe(amount);
  expect(amount).toHaveValue('1,25');
  expect(hiddenValues(form)).toMatchObject({ give_quantity: '1,25', get_quantity: '' });
  expect(screen.getByRole('button', { name: t('swap_form_review_swap') })).toBeDisabled();
  expect(fixture.readQuote).toHaveBeenLastCalledWith(expect.objectContaining({ quantity: '1,25', enabled: false }));
  expect(fixture.action).not.toHaveBeenCalled();
});

it('formats the route count with the independent number preference', () => {
  setQuote({ ...routes[4]!, book_orders_matched: 1234 });
  render(<LocalizedSwap />);
  openDetails();
  expect(routeText()).toBe('Pool + 1,234 orders');
  act(() => configureLocale({ language: 'en', numberLocale: 'de-DE' }));
  expect(routeText()).toBe('Pool + 1.234 orders');
});
