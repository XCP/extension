import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { useSettings } from '@/contexts/settings-context';
import { getCounterpartyFeatureStatus } from '@/core/counterparty/capabilities';
import { formatAmount } from '@/core/format';
import {
  DEFAULT_ORDER_EXPIRATION,
  LEGACY_MAX_ORDER_EXPIRATION,
  MAX_ORDER_EXPIRATION,
} from '@/core/settings';
import { t } from '@/i18n';
import { useLocaleRevision } from '@/i18n/use-locale';

interface OrderSettingsProps {
  customExpiration?: number;
  onExpirationChange: (blocks: number | undefined) => void;
  customFeeRequired?: number;
  onFeeRequiredChange?: (satoshis: number) => void;
  isBuyingBTC?: boolean;
  showHelpText?: boolean;
}

export function OrderSettings({
  customExpiration,
  onExpirationChange,
  customFeeRequired = 0,
  onFeeRequiredChange,
  isBuyingBTC = false,
  showHelpText = false
}: OrderSettingsProps): ReactElement {
  useLocaleRevision();
  const { settings, updateSettings } = useSettings();

  const getInitialExpiration = () => {
    if (customExpiration !== undefined) return customExpiration;
    if (settings?.defaultOrderExpiration !== undefined) return settings.defaultOrderExpiration;
    return DEFAULT_ORDER_EXPIRATION;
  };

  const [expiration, setExpiration] = useState<number>(getInitialExpiration);
  const [customValue, setCustomValue] = useState<string>('');
  const [feeRequired, setFeeRequired] = useState<number>(customFeeRequired);
  const [usesLegacyExpirations, setUsesLegacyExpirations] = useState(true);
  const minCustomExpiration = usesLegacyExpirations ? 1 : 0;
  const maxCustomExpiration = usesLegacyExpirations ? LEGACY_MAX_ORDER_EXPIRATION : MAX_ORDER_EXPIRATION;
  const expirationPresets = usesLegacyExpirations ? [
    { label: t('settings_order_settings_1_hour'), blocks: 6 },
    { label: t('settings_order_settings_1_day'), blocks: 144 },
    { label: t('settings_order_settings_1_week'), blocks: 1008 },
    { label: t('settings_order_settings_2_weeks'), blocks: 2016 },
    { label: t('settings_order_settings_1_month'), blocks: 4320 },
    { label: t('common_max'), blocks: LEGACY_MAX_ORDER_EXPIRATION },
  ] : [
    { label: t('settings_order_settings_never'), blocks: 0 },
    { label: t('settings_order_settings_1_day'), blocks: 144 },
    { label: t('settings_order_settings_1_week'), blocks: 1008 },
    { label: t('settings_order_settings_1_month'), blocks: 4320 },
    { label: t('settings_order_settings_1_year'), blocks: 52560 },
    { label: t('common_max'), blocks: MAX_ORDER_EXPIRATION },
  ];

  useEffect(() => {
    let cancelled = false;

    // Without node support, clamp an illegal value (0, or > legacy max) to the
    // legacy max and propagate to the form. Not persisted, so the saved
    // preference returns once the feature is supported.
    const enforceLegacy = () => {
      setExpiration((prev) => {
        if (prev === 0 || prev > LEGACY_MAX_ORDER_EXPIRATION) {
          onExpirationChange(LEGACY_MAX_ORDER_EXPIRATION);
          return LEGACY_MAX_ORDER_EXPIRATION;
        }
        return prev;
      });
    };

    getCounterpartyFeatureStatus('indefiniteOrders')
      .then((status) => {
        if (cancelled) return;
        setUsesLegacyExpirations(!status.supported);
        if (!status.supported) enforceLegacy();
      })
      .catch(() => {
        if (cancelled) return;
        setUsesLegacyExpirations(true);
        enforceLegacy();
      });

    return () => {
      cancelled = true;
    };
  }, [onExpirationChange]);

  // Update local state when settings change
  useEffect(() => {
    if (customExpiration === undefined && settings?.defaultOrderExpiration !== undefined) {
      setExpiration(settings.defaultOrderExpiration);
    }
  }, [settings?.defaultOrderExpiration, customExpiration]);

  const handlePresetClick = async (blocks: number) => {
    setExpiration(blocks);
    setCustomValue('');
    onExpirationChange(blocks);
    await updateSettings({ defaultOrderExpiration: blocks });
  };

  const handleCustomChange = (value: string) => {
    // Only allow numbers
    if (/^\d*$/.test(value) && value.length <= 7) {
      setCustomValue(value);
    }
  };

  const handleCustomKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && customValue) {
      const numValue = parseInt(customValue, 10);
      if (numValue >= minCustomExpiration && numValue <= maxCustomExpiration) {
        setExpiration(numValue);
        onExpirationChange(numValue);
        await updateSettings({ defaultOrderExpiration: numValue });
      }
    }
  };

  const calculateDays = (blocks: number) => {
    if (blocks === 0) return t('settings_order_settings_never');
    const days = blocks / 144;
    // Keep the existing approximation/rounding, then localize only its displayed number and unit.
    const display = (value: number, decimals: number) => formatAmount({
      value: value.toFixed(decimals), minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    });
    if (days < 1) return t('settings_order_duration_hours', [display(days * 24, 0)]);
    if (days < 7) return t('settings_order_duration_days', [display(days, 1)]);
    if (days >= 30) return t('settings_order_duration_months', [display(days / 30, 1)]);
    return t('settings_order_duration_weeks', [display(days / 7, 1)]);
  };

  const expirationLabel = (expiration === 0 && !usesLegacyExpirations)
    ? t('common_never_expires')
    : t('settings_order_settings_blocks', [formatAmount({ value: expiration, maximumFractionDigits: 0 }), String(calculateDays(expiration))]);

  const handleFeeRequiredChange = (value: string) => {
    // Only allow numbers
    if (/^\d*$/.test(value) && value.length <= 10) {
      const numValue = parseInt(value || '0', 10);
      setFeeRequired(numValue);
      if (onFeeRequiredChange) {
        onFeeRequiredChange(numValue);
      }
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-4">
      <div className="space-y-4">
        <div>
          <div className="flex justify-between items-center mb-3">
            <label
              htmlFor="custom-expiration"
              className="text-sm font-semibold cursor-pointer"
            >
              {t('settings_order_settings_order_expiration')}
            </label>
            <span className="text-sm text-gray-500 tabular-nums">
              {expirationLabel}
            </span>
          </div>

          {/* Preset buttons */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {expirationPresets.map((preset) => {
              // Button is selected if expiration matches and no custom value is being entered
              const isSelected = expiration === preset.blocks && customValue === '';
              return (
                <button
                  key={preset.blocks}
                  type="button"
                  onClick={() => handlePresetClick(preset.blocks)}
                  className={`px-3 py-2 text-sm rounded-md transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    isSelected
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Custom input */}
          <div className="flex flex-col gap-2">
            <input
              type="text"
              id="custom-expiration"
              value={customValue}
              onChange={(e) => handleCustomChange(e.target.value)}
              onKeyDown={handleCustomKeyDown}
              placeholder={t('settings_order_settings_custom_blocks', [String(minCustomExpiration), String(maxCustomExpiration)])}
              inputMode="numeric"
              aria-label={t('settings_order_settings_custom_expiration_in_blocks')}
              className="flex-1 px-3 py-2.5 text-sm border border-gray-300 rounded-md outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
            />
            {showHelpText && (
              <p className="text-xs text-gray-500">
                {usesLegacyExpirations
                  ? t('settings_order_settings_orders_cancel_after_the_selected', [String(LEGACY_MAX_ORDER_EXPIRATION)])
                  : t('settings_order_settings_use_0_for_orders_that')}
              </p>
            )}
          </div>
        </div>

        {/* Fee Required Section - Only show when buying BTC */}
        {isBuyingBTC && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <label
                htmlFor="fee-required"
                className="text-sm font-semibold cursor-pointer"
              >
                {t('common_fee_required')}
              </label>
              <span className="text-sm text-gray-500 tabular-nums">
                {feeRequired === 0 ? t('settings_order_settings_no_minimum_fee') : t('settings_order_settings_sats_sat_vb', [String(feeRequired), String((feeRequired / 250).toFixed(1))])}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <input
                type="text"
                id="fee-required"
                value={feeRequired}
                onChange={(e) => handleFeeRequiredChange(e.target.value)}
                placeholder={t('settings_order_settings_enter_fee_in_satoshis_default')}
                inputMode="numeric"
                aria-label={t('settings_order_settings_fee_required_in_satoshis')}
                className="flex-1 px-3 py-2.5 text-sm border border-gray-300 rounded-md outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
              />
              <p className="text-xs text-gray-500">
                {t('settings_order_settings_the_minimum_tx_fee_required')}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
