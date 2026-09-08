import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { configureLocale, t } from '@/i18n';
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
  configureLocale({ language: 'en' });
});
afterEach(() => {
  cleanup();
  configureLocale({});
});

it('updates auto-lock labels in place while preserving the selection and unsaved API URL', () => {
  render(<MemoryRouter><AdvancedSettingsPage /></MemoryRouter>);
  const selected = screen.getByRole('radio', { name: t('settings_advanced_15_minutes') });
  expect(selected).toHaveAttribute('aria-checked', 'true');
  const apiUrl = screen.getByRole('textbox', { name: t('settings_advanced_counterparty_api') });
  const draft = 'https://unfinished.example/v2/';
  fireEvent.change(apiUrl, { target: { value: draft } });

  for (const language of ['ja', 'zh-CN', 'zh-TW', 'zh-HK', 'en']) {
    act(() => configureLocale({ language }));
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

  act(() => configureLocale({ language: 'ja' }));
  fireEvent.click(screen.getByRole('radio', { name: t('settings_advanced_30_minutes') }));
  expect(mockUpdateSettings).toHaveBeenCalledExactlyOnceWith({ autoLockTimer: '30m' });
});
