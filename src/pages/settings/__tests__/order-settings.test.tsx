import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEGACY_MAX_ORDER_EXPIRATION } from '@/core/settings';
import { configureLocale, t } from '@/i18n';
import { OrderSettings } from '../order-settings';

const mockUpdateSettings = vi.fn();
vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({
    settings: { defaultOrderExpiration: 0 },
    updateSettings: mockUpdateSettings,
  }),
}));

const mockGetStatus = vi.fn();
vi.mock('@/core/counterparty/capabilities', () => ({
  getCounterpartyFeatureStatus: (...args: unknown[]) => mockGetStatus(...args),
}));

describe('OrderSettings — activation-window gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureLocale({ language: 'en' });
  });

  afterEach(() => {
    cleanup();
    configureLocale({});
  });

  it('coerces a "never" (0) default to the legacy max when the node lacks indefinite orders', async () => {
    mockGetStatus.mockResolvedValue({ supported: false });
    const onExpirationChange = vi.fn();

    render(<OrderSettings onExpirationChange={onExpirationChange} />);

    // The illegal default (0) must be snapped down and pushed up to the form so
    // an untouched order form can't submit a value the node rejects.
    await waitFor(() => {
      expect(onExpirationChange).toHaveBeenCalledWith(LEGACY_MAX_ORDER_EXPIRATION);
    });

    // Label must not claim "Never expires" in legacy mode.
    expect(screen.queryByText(/Never expires/)).not.toBeInTheDocument();
    expect(screen.getByText(/8,064 blocks/)).toBeInTheDocument();

    // Legacy presets are shown (no "Never"); the legacy-only "1 Hour" is present.
    expect(screen.getByRole('button', { name: '1 Hour' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Never' })).not.toBeInTheDocument();

    // Coercion is form-local only — it must not overwrite the saved preference.
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  it('preserves "never" (0) and offers it as a preset when the node supports indefinite orders', async () => {
    mockGetStatus.mockResolvedValue({ supported: true });
    const onExpirationChange = vi.fn();

    render(<OrderSettings onExpirationChange={onExpirationChange} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Never' })).toBeInTheDocument();
    });

    expect(onExpirationChange).not.toHaveBeenCalledWith(LEGACY_MAX_ORDER_EXPIRATION);
    expect(screen.getByText(/Never expires/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '1 Hour' })).not.toBeInTheDocument();
  });

  it.each([false, true])('updates live preset labels without changing selected values or custom drafts (indefinite=%s)', async supported => {
    mockGetStatus.mockResolvedValue({ supported });
    const onExpirationChange = vi.fn();
    const onFeeRequiredChange = vi.fn();
    render(<OrderSettings customExpiration={144} onExpirationChange={onExpirationChange}
      isBuyingBTC customFeeRequired={125} onFeeRequiredChange={onFeeRequiredChange} />);
    await waitFor(() => expect(screen.getByRole('button', { name: supported ? 'Never' : '1 Hour' })).toBeInTheDocument());

    const selected = screen.getByRole('button', { name: '1 Day' });
    const expiration = screen.getByRole('textbox', { name: t('settings_order_settings_custom_expiration_in_blocks') });
    const fee = screen.getByRole('textbox', { name: t('settings_order_settings_fee_required_in_satoshis') });
    expect(selected).toHaveClass('bg-blue-500');

    act(() => configureLocale({ language: 'ja' }));
    expect(screen.getByRole('button', { name: t('settings_order_settings_1_day') })).toBe(selected);
    expect(selected).toHaveClass('bg-blue-500');
    expect(onExpirationChange).not.toHaveBeenCalled();
    expect(mockUpdateSettings).not.toHaveBeenCalled();

    fireEvent.change(expiration, { target: { value: '00042' } });
    for (const language of ['zh-CN', 'zh-TW', 'zh-HK', 'en']) {
      act(() => configureLocale({ language }));
      expect(screen.getByRole('textbox', { name: t('settings_order_settings_custom_expiration_in_blocks') })).toBe(expiration);
      expect(expiration).toHaveValue('00042');
      expect(screen.getByRole('button', { name: t('settings_order_settings_1_day') })).toBe(selected);
      expect(screen.getByRole('button', { name: t(supported ? 'settings_order_settings_never' : 'settings_order_settings_1_hour') })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: t('settings_order_settings_fee_required_in_satoshis') })).toBe(fee);
      expect(fee).toHaveValue('125');
      expect(onExpirationChange).not.toHaveBeenCalled();
      expect(onFeeRequiredChange).not.toHaveBeenCalled();
      expect(mockUpdateSettings).not.toHaveBeenCalled();
    }
    expect(mockGetStatus).toHaveBeenCalledTimes(1);

    // Only the explicit confirmation commits the same number as before localization.
    fireEvent.keyDown(expiration, { key: 'Enter' });
    await waitFor(() => expect(onExpirationChange).toHaveBeenCalledExactlyOnceWith(42));
    expect(mockUpdateSettings).toHaveBeenCalledExactlyOnceWith({ defaultOrderExpiration: 42 });
  });

  it.each([
    { blocks: 6, key: 'settings_order_duration_hours', rounded: '1', english: '1h' },
    { blocks: 143, key: 'settings_order_duration_hours', rounded: '24', english: '24h' },
    { blocks: 144, key: 'settings_order_duration_days', rounded: '1.0', english: '1.0d' },
    { blocks: 1007, key: 'settings_order_duration_days', rounded: '7.0', english: '7.0d' },
    { blocks: 1008, key: 'settings_order_duration_weeks', rounded: '1.0', english: '1.0w' },
    { blocks: 4319, key: 'settings_order_duration_weeks', rounded: '4.3', english: '4.3w' },
    { blocks: 4320, key: 'settings_order_duration_months', rounded: '1.0', english: '1.0mo' },
    { blocks: 8064, key: 'settings_order_duration_months', rounded: '1.9', english: '1.9mo' },
  ] as const)('localizes the $blocks-block hint without changing its unit threshold or rounding', async ({ blocks, key, rounded, english }) => {
    mockGetStatus.mockResolvedValue({ supported: true });
    const onExpirationChange = vi.fn();
    const onFeeRequiredChange = vi.fn();
    configureLocale({ language: 'en', numberLocale: 'en-US' });
    render(<OrderSettings customExpiration={blocks} onExpirationChange={onExpirationChange}
      isBuyingBTC customFeeRequired={125} onFeeRequiredChange={onFeeRequiredChange} />);
    await screen.findByRole('button', { name: 'Never' });
    expect(screen.getByText(t('settings_order_settings_blocks', [new Intl.NumberFormat('en-US').format(blocks), english]))).toBeVisible();

    const expiration = screen.getByRole('textbox', { name: t('settings_order_settings_custom_expiration_in_blocks') });
    const fee = screen.getByRole('textbox', { name: t('settings_order_settings_fee_required_in_satoshis') });
    fireEvent.change(expiration, { target: { value: '00042' } });
    for (const language of ['ja', 'zh-CN', 'zh-TW', 'zh-HK', 'en']) {
      act(() => configureLocale({ language, numberLocale: 'de-DE' }));
      const count = rounded.replace('.', ',');
      const duration = t(key, [count]);
      expect(screen.getByText(t('settings_order_settings_blocks', [new Intl.NumberFormat('de-DE').format(blocks), duration]))).toBeVisible();
      expect(expiration).toHaveValue('00042');
      expect(fee).toHaveValue('125');
      expect(onExpirationChange).not.toHaveBeenCalled();
      expect(onFeeRequiredChange).not.toHaveBeenCalled();
      expect(mockUpdateSettings).not.toHaveBeenCalled();
      expect(mockGetStatus).toHaveBeenCalledExactlyOnceWith('indefiniteOrders');
    }
    // Number format can change independently while the Japanese unit remains selected.
    act(() => configureLocale({ language: 'ja', numberLocale: 'en-US' }));
    expect(screen.getByText(t('settings_order_settings_blocks', [new Intl.NumberFormat('en-US').format(blocks), t(key, [rounded])]))).toBeVisible();
    expect(expiration).toHaveValue('00042');
    expect(mockGetStatus).toHaveBeenCalledTimes(1);
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });
});
