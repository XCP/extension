"use client";

import { useState, useEffect } from 'react';
import { useSettings } from '@/contexts/settings-context';
import type { ReactElement } from 'react';

interface OrderSettingsProps {
  customExpiration?: number;
  onExpirationChange: (blocks: number | undefined) => void;
  customFeeRequired?: number;
  onFeeRequiredChange?: (satoshis: number) => void;
  isBuyingBTC?: boolean;
}

// Common expiration presets (in blocks)
const EXPIRATION_PRESETS = [
  { label: '1 Hour', blocks: 6 },
  { label: '1 Day', blocks: 144 },
  { label: '1 Week', blocks: 1008 },
  { label: '2 Weeks', blocks: 2016 },
  { label: '1 Month', blocks: 4320 },
  { label: 'Max', blocks: 8064 },
];

export function OrderSettings({ 
  customExpiration,
  onExpirationChange,
  customFeeRequired = 0,
  onFeeRequiredChange,
  isBuyingBTC = false
}: OrderSettingsProps): ReactElement {
  const { settings, updateSettings } = useSettings();
  const [expiration, setExpiration] = useState<number>(customExpiration || settings?.defaultOrderExpiration || 8064);
  const [customValue, setCustomValue] = useState<string>('');
  const [feeRequired, setFeeRequired] = useState<number>(customFeeRequired);

  // Update local state when settings change
  useEffect(() => {
    if (!customExpiration && settings?.defaultOrderExpiration) {
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

  const handleCustomKeyPress = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && customValue) {
      const numValue = parseInt(customValue, 10);
      if (numValue > 0 && numValue <= 1000000) {
        setExpiration(numValue);
        onExpirationChange(numValue);
        await updateSettings({ defaultOrderExpiration: numValue });
      }
    }
  };

  const calculateDays = (blocks: number) => {
    const days = blocks / 144;
    if (days < 1) return `${(days * 24).toFixed(0)}h`;
    if (days < 7) return `${days.toFixed(1)}d`;
    return `${(days / 7).toFixed(1)}w`;
  };

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
            <h3 className="font-semibold">Order Expiration</h3>
            <span className="text-sm text-gray-500">
              {expiration} blocks (~{calculateDays(expiration)})
            </span>
          </div>
          
          {/* Preset buttons */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {EXPIRATION_PRESETS.map((preset) => (
              <button
                key={preset.blocks}
                type="button"
                onClick={() => handlePresetClick(preset.blocks)}
                className={`px-3 py-2 text-sm rounded-md transition-colors ${
                  expiration === preset.blocks && !customValue
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          
          {/* Custom input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={customValue}
              onChange={(e) => handleCustomChange(e.target.value)}
              onKeyPress={handleCustomKeyPress}
              placeholder="Custom blocks (press Enter)"
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Fee Required Section - Only show when buying BTC */}
        {isBuyingBTC && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold">Fee Required</h3>
              <span className="text-sm text-gray-500">
                {feeRequired === 0 ? "No minimum fee" : `${feeRequired} sats (~${(feeRequired / 250).toFixed(1)} sat/vB)`}
              </span>
            </div>
            
            <div className="mb-3">
              <p className="text-sm text-gray-600">
                The minimum tx fee required for a BTCPay to match this order (in satoshis).
              </p>
            </div>
            
            <div className="flex gap-2">
              <input
                type="text"
                value={feeRequired}
                onChange={(e) => handleFeeRequiredChange(e.target.value)}
                placeholder="Enter fee in satoshis (default: 0)"
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}