import { useSettings } from "@/contexts/settings-context";
import { SlippageInput } from "./slippage-input";
import type { ReactElement } from "react";

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
        <span className="text-sm font-semibold text-gray-900">Pool Settings</span>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-blue-600 hover:text-blue-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        >
          Done
        </button>
      </div>
      <SlippageInput value={value} onChange={handleChange} showHelpText={showHelpText} />
    </div>
  );
}
