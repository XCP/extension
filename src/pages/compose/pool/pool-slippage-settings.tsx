import type { ReactElement } from "react";
import { useSettings } from "@/contexts/settings-context";
import { t } from '@/i18n';
import { SlippageInput } from "@/pages/compose/pool/slippage-input";

interface PoolSlippageSettingsProps {
  value: string;
  onChange: (value: string) => void;
  onBack: () => void;
  showHelpText?: boolean;
}

/**
 * Gear-panel for pool slippage, shown in place of the deposit/withdraw form.
 * Edits the per-transaction value and persists it as the user's default so it
 * sticks across transactions.
 */
export function PoolSlippageSettings({
  value,
  onChange,
  onBack,
  showHelpText = false,
}: PoolSlippageSettingsProps): ReactElement {
  const { updateSettings } = useSettings();

  const handleChange = (next: string) => {
    onChange(next);
    void updateSettings({ defaultPoolSlippage: next });
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-900">{t('common_pool_settings')}</span>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-blue-600 hover:text-blue-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        >
          {t('pool_pool_slippage_settings_done')}
        </button>
      </div>
      <SlippageInput value={value} onChange={handleChange} showHelpText={showHelpText} />
    </div>
  );
}
