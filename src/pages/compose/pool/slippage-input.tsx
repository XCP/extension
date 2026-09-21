import { Description, Field, Input, Label } from "@headlessui/react";
import type { ReactElement } from "react";
import { isFiniteNumber, isGreaterThan, isLessThan } from "@/core/numeric";

import { POOL_SLIPPAGE_AUTO } from "@/core/settings";

export { DEFAULT_POOL_SLIPPAGE } from "@/core/settings";

// Presets skew slightly above fast-chain DEXs: Counterparty's ~10-min blocks leave
// more time for someone else to move the pool before a deposit/withdraw confirms.
// 0% / very-high values are intentionally Custom-only.
const PRESETS = ["0.5", "1", "3"] as const;
const LOW_SLIPPAGE_THRESHOLD = "0.5";
const HIGH_SLIPPAGE_THRESHOLD = "5";

interface SlippageInputProps {
  /** The stored setting: a percent, or POOL_SLIPPAGE_AUTO. */
  value: string;
  onChange: (value: string) => void;
  showHelpText?: boolean;
  /**
   * Offer Auto as a fourth preset, where a quote reports the price impact to size it against.
   * Deposit and withdraw leave this off and render as before — they still need a tolerance, since
   * the pool can move under them before they confirm, but they have no impact figure to derive one
   * from and so use a flat percent.
   */
  offerAuto?: boolean;
  /** The percent Auto resolved to for the current quote; shown so the number is never hidden. */
  resolvedValue?: string;
}

export function SlippageInput({
  value,
  onChange,
  showHelpText = false,
  offerAuto = false,
  resolvedValue,
}: SlippageInputProps): ReactElement {
  const autoOn = value === POOL_SLIPPAGE_AUTO;
  const isPreset = (PRESETS as readonly string[]).includes(value);
  const displayValue = autoOn ? (resolvedValue ?? "") : value;

  const showWarning = !autoOn && value.trim() !== "" && isFiniteNumber(value);
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
        <span className="text-sm text-gray-500 tabular-nums">
          {displayValue || "0"}%{autoOn && <span className="text-gray-400"> · auto</span>}
        </span>
      </div>

      {/* Presets. Auto is one of them, so picking a number is how you leave it. */}
      <div className={`grid gap-2 mb-3 ${offerAuto ? "grid-cols-4" : "grid-cols-3"}`}>
        {offerAuto && (
          <button
            type="button"
            onClick={() => onChange(POOL_SLIPPAGE_AUTO)}
            className={`px-3 py-2 text-sm rounded-md transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              autoOn ? "bg-blue-500 text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-700"
            }`}
          >
            Auto
          </button>
        )}
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
          value={autoOn || isPreset ? "" : value}
          onChange={handleCustomChange}
          placeholder="Custom %"
          aria-label="Custom slippage percent"
          className={`w-full px-3 py-2.5 pr-8 text-sm border rounded-md outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 ${
            autoOn || isPreset ? "border-gray-300" : "border-blue-500"
          }`}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">%</span>
      </div>

      {autoOn && (
        <Description className="mt-2 text-sm text-gray-500">
          {resolvedValue
            ? `Using ${resolvedValue}%, matched to this trade's price impact.`
            : "Set from the quote's price impact once you enter an amount."}
        </Description>
      )}

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
