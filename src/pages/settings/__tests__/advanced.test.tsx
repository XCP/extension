import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIAT_CURRENCIES } from '@/core/bitcoin/price';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { t } from '@/i18n';
import { mockBrowserLocale, render } from '@/i18n/__tests__/helpers/locale';
import AdvancedSettingsPage from '../advanced';

const mockUpdateSettings = vi.fn();
const mockSetHeaderProps = vi.fn();
const mockValidateApi = vi.fn();
vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({
    settings: { ...DEFAULT_SETTINGS, autoLockTimer: '15m' },
    updateSettings: mockUpdateSettings,
    isLoading: false,
  }),
}));
vi.mock('@/contexts/header-context', () => ({
  useHeader: () => ({ setHeaderProps: mockSetHeaderProps }),
}));
vi.mock('@/core/validation/api', () => ({
  validateCounterpartyApi: (...args: unknown[]) => mockValidateApi(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockBrowserLocale({ language: 'en' });
});
afterEach(() => {
  cleanup();
  mockBrowserLocale({});
});

it('updates auto-lock labels in place while preserving the selection and unsaved API URL', () => {
  render(<MemoryRouter><AdvancedSettingsPage /></MemoryRouter>);
  const selected = screen.getByRole('radio', { name: t('settings_advanced_15_minutes') });
  expect(selected).toHaveAttribute('aria-checked', 'true');
  const apiUrl = screen.getByRole('textbox', { name: t('settings_advanced_counterparty_api') });
  const draft = 'https://unfinished.example/v2/';
  fireEvent.change(apiUrl, { target: { value: draft } });

  for (const language of ['ja', 'zh-CN', 'zh-TW', 'zh-HK', 'en']) {
    act(() => mockBrowserLocale({ language }));
    expect(screen.getByRole('radio', { name: t('settings_advanced_15_minutes') })).toBe(selected);
    expect(selected).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: t('settings_advanced_1_minute') })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: t('settings_advanced_5_minutes') })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: t('settings_advanced_30_minutes') })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: t('settings_advanced_counterparty_api') })).toBe(apiUrl);
    expect(apiUrl).toHaveValue(draft);
    expect(mockUpdateSettings).not.toHaveBeenCalled();
    expect(mockValidateApi).not.toHaveBeenCalled();
  }

  act(() => mockBrowserLocale({ language: 'ja' }));
  fireEvent.click(screen.getByRole('radio', { name: t('settings_advanced_30_minutes') }));
  expect(mockUpdateSettings).toHaveBeenCalledExactlyOnceWith({ autoLockTimer: '30m' });
});

describe('price currency', () => {
  const currencySelect = () => screen.getByRole('combobox', { name: t('display_preferences_fiat') });

  it('lives in Privacy & Display and shows the stored currency', () => {
    render(<MemoryRouter><AdvancedSettingsPage /></MemoryRouter>);
    const section = screen.getByRole('heading', { name: t('settings_advanced_privacy_display') }).closest('section')!;
    expect(within(section).getByRole('combobox', { name: t('display_preferences_fiat') })).toBe(currencySelect());
    expect(currencySelect()).toHaveValue(DEFAULT_SETTINGS.fiat);
    expect(within(currencySelect()).getAllByRole('option').map(option => (option as HTMLOptionElement).value))
      .toEqual([...FIAT_CURRENCIES]);
  });

  it('follows the help-text toggle like the other Advanced controls', () => {
    render(<MemoryRouter><AdvancedSettingsPage /></MemoryRouter>);
    const help = screen.getByText(t('settings_advanced_price_currency_description'));
    expect(currencySelect()).toHaveAccessibleDescription(t('settings_advanced_price_currency_description'));
    expect(help).toHaveClass('hidden');
    const header = mockSetHeaderProps.mock.lastCall![0] as { rightButton: { onClick: () => void } };
    act(() => header.rightButton.onClick());
    expect(help).not.toHaveClass('hidden');
  });

  it('saves the chosen currency and is disabled while saving', async () => {
    let finish!: () => void;
    mockUpdateSettings.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    render(<MemoryRouter><AdvancedSettingsPage /></MemoryRouter>);
    fireEvent.change(currencySelect(), { target: { value: 'eur' } });
    expect(mockUpdateSettings).toHaveBeenCalledExactlyOnceWith({ fiat: 'eur' });
    expect(currencySelect()).toBeDisabled();
    await act(async () => finish());
    expect(currencySelect()).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says so when the save fails', async () => {
    mockUpdateSettings.mockRejectedValueOnce(new Error('storage unavailable'));
    render(<MemoryRouter><AdvancedSettingsPage /></MemoryRouter>);
    fireEvent.change(currencySelect(), { target: { value: 'jpy' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(t('display_preferences_save_failed'));
    expect(currencySelect()).toBeEnabled();
  });
});
