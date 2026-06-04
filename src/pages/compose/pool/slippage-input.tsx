import { Field, Label, Description, Input } from "@headlessui/react";
import { isFiniteNumber, isGreaterThan, isLessThan } from "@/utils/numeric";
import type { ReactElement } from "react";

export { DEFAULT_POOL_SLIPPAGE } from "@/utils/settings";

// Presets skew slightly above fast-chain DEXs: Counterparty's ~10-min blocks leave
// more time for someone else to move the pool before a deposit/withdraw confirms.
// 0% / very-high values are intentionally Custom-only.
const PRESETS = ["0.5", "1", "3"] as const;
const LOW_SLIPPAGE_THRESHOLD = "0.5";
const HIGH_SLIPPAGE_THRESHOLD = "5";

interface SlippageInputProps {
  value: string;
  onChange: (value: string) => void;
  showHelpText?: boolean;
}

export function SlippageInput({
  value,
  onChange,
  showHelpText = false,
}: SlippageInputProps): ReactElement {
  const isPreset = (PRESETS as readonly string[]).includes(value);

  const showWarning = value.trim() !== "" && isFiniteNumber(value);
  const isLow = showWarning && isLessThan(value, LOW_SLIPPAGE_THRESHOLD);
  const isHigh = showWarning && isGreaterThan(value, HIGH_SLIPPAGE_THRESHOLD);

  const handleCustomChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value.trim();
    // Accept only a decimal number (or empty); rejects letters and extra dots.
    if (next !== "" && !/^\d*\.?\d*$/.test(next)) return;
    onChange(next);
  };

  return (
    <Field>
      <div className="flex justify-between items-center mb-1">
        <Label className="text-sm font-medium text-gray-700">
          Slippage Tolerance <span className="text-red-500">*</span>
        </Label>
        <span className="text-sm text-gray-500 tabular-nums">{value || "0"}%</span>
      </div>

      {/* Preset buttons */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(preset)}
            className={`px-3 py-2 text-sm rounded-md transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              value === preset
                ? "bg-blue-500 text-white"
                : "bg-gray-100 hover:bg-gray-200 text-gray-700"
            }`}
          >
            {preset}%
          </button>
        ))}
      </div>

      {/* Custom input */}
      <div className="relative">
        <Input
          type="text"
          inputMode="decimal"
          value={isPreset ? "" : value}
          onChange={handleCustomChange}
          placeholder="Custom %"
          aria-label="Custom slippage percent"
          className={`w-full px-3 py-2.5 pr-8 text-sm border rounded-md outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 ${
            isPreset ? "border-gray-300" : "border-blue-500"
          }`}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">%</span>
      </div>

      {showHelpText && (
        <Description className="mt-2 text-sm text-gray-500">
          How far the pool ratio may move before the transaction fails. A higher
          tolerance avoids failures if someone else trades the pool in the same block.
        </Description>
      )}
      {isLow && (
        <div className="mt-2 rounded border border-yellow-200 bg-yellow-50 p-2 text-sm text-yellow-800">
          Very low — likely to fail if the pool changes before your transaction confirms.
        </div>
      )}
      {isHigh && (
        <div className="mt-2 rounded border border-yellow-200 bg-yellow-50 p-2 text-sm text-yellow-800">
          Very high — you may receive noticeably less than quoted.
        </div>
      )}
    </Field>
  );
}
