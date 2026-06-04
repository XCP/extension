import { useState, useEffect } from 'react';
import { useSettings } from '@/contexts/settings-context';
import {
  DEFAULT_ORDER_EXPIRATION,
  LEGACY_MAX_ORDER_EXPIRATION,
  MAX_ORDER_EXPIRATION,
} from '@/utils/settings';
import { getCounterpartyFeatureStatus } from '@/utils/blockchain/counterparty/capabilities';
import type { ReactElement } from 'react';

interface OrderSettingsProps {
  customExpiration?: number;
  onExpirationChange: (blocks: number | undefined) => void;
  customFeeRequired?: number;
  onFeeRequiredChange?: (satoshis: number) => void;
  isBuyingBTC?: boolean;
  showHelpText?: boolean;
}

const LEGACY_EXPIRATION_PRESETS = [
  { label: '1 Hour', blocks: 6 },
  { label: '1 Day', blocks: 144 },
  { label: '1 Week', blocks: 1008 },
  { label: '2 Weeks', blocks: 2016 },
  { label: '1 Month', blocks: 4320 },
  { label: 'Max', blocks: LEGACY_MAX_ORDER_EXPIRATION },
];

const EXPIRATION_PRESETS = [
  { label: 'Never', blocks: 0 },
  { label: '1 Day', blocks: 144 },
  { label: '1 Week', blocks: 1008 },
  { label: '1 Month', blocks: 4320 },
  { label: '1 Year', blocks: 52560 },
  { label: 'Max', blocks: MAX_ORDER_EXPIRATION },
];

export function OrderSettings({
  customExpiration,
  onExpirationChange,
  customFeeRequired = 0,
  onFeeRequiredChange,
  isBuyingBTC = false,
  showHelpText = false
}: OrderSettingsProps): ReactElement {
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
  const expirationPresets = usesLegacyExpirations ? LEGACY_EXPIRATION_PRESETS : EXPIRATION_PRESETS;

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
    if (blocks === 0) return 'never';
    const days = blocks / 144;
    if (days < 1) return `${(days * 24).toFixed(0)}h`;
    if (days < 7) return `${days.toFixed(1)}d`;
    if (days >= 30) return `${(days / 30).toFixed(1)}mo`;
    return `${(days / 7).toFixed(1)}w`;
  };

  const expirationLabel = (expiration === 0 && !usesLegacyExpirations)
    ? 'Never expires'
    : `${expiration.toLocaleString()} blocks (~${calculateDays(expiration)})`;

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
              Order Expiration
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
              placeholder={`Custom blocks, ${minCustomExpiration}-${maxCustomExpiration}`}
              inputMode="numeric"
              aria-label="Custom expiration in blocks"
              className="flex-1 px-3 py-2.5 text-sm border border-gray-300 rounded-md outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
            />
            {showHelpText && (
              <p className="text-xs text-gray-500">
                {usesLegacyExpirations
                  ? `Orders cancel after the selected number of blocks. The current maximum is ${LEGACY_MAX_ORDER_EXPIRATION}.`
                  : 'Use 0 for orders that never expire. Finite orders cancel after the selected number of blocks.'}
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
                Fee Required
              </label>
              <span className="text-sm text-gray-500 tabular-nums">
                {feeRequired === 0 ? "No minimum fee" : `${feeRequired} sats (~${(feeRequired / 250).toFixed(1)} sat/vB)`}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <input
                type="text"
                id="fee-required"
                value={feeRequired}
                onChange={(e) => handleFeeRequiredChange(e.target.value)}
                placeholder="Enter fee in satoshis (default: 0)"
                inputMode="numeric"
                aria-label="Fee required in satoshis"
                className="flex-1 px-3 py-2.5 text-sm border border-gray-300 rounded-md outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
              />
              <p className="text-xs text-gray-500">
                The minimum tx fee required for a BTCPay to match this order (in satoshis).
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
