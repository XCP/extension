import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/ui/button";
import { toBigNumber } from "@/utils/numeric";
import type { ReactElement } from "react";

const PRESET_SLIPPAGE = ["0.5", "1", "2", "3"];
const LOW_SLIPPAGE_THRESHOLD = "0.05";
const HIGH_SLIPPAGE_THRESHOLD = "20";

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
  const isPreset = PRESET_SLIPPAGE.includes(value);
  const slippageValue = toBigNumber(value);
  const isLowSlippage = slippageValue.isGreaterThanOrEqualTo(0)
    && slippageValue.isLessThan(LOW_SLIPPAGE_THRESHOLD);
  const isHighSlippage = slippageValue.isGreaterThanOrEqualTo(HIGH_SLIPPAGE_THRESHOLD);

  return (
    <Field>
      <Label className="block text-sm font-medium text-gray-700">
        Slippage Tolerance <span className="text-red-500">*</span>
      </Label>
      <div className="mt-1 grid grid-cols-4 gap-2">
        {PRESET_SLIPPAGE.map((preset) => (
          <Button
            key={preset}
            type="button"
            color={value === preset ? "blue" : "gray"}
            className="py-2 px-2 text-sm"
            onClick={() => onChange(preset)}
          >
            {preset}%
          </Button>
        ))}
      </div>
      <Input
        type="text"
        inputMode="decimal"
        value={isPreset ? "" : value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Custom %"
        className="mt-2 block w-full p-2.5 rounded-md border border-gray-300 bg-gray-50 outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
      />
      {showHelpText && (
        <Description className="mt-2 text-sm text-gray-500">
          Sets how far the pool quote may move before the transaction fails.
        </Description>
      )}
      {isLowSlippage && (
        <div className="mt-2 rounded border border-yellow-200 bg-yellow-50 p-2 text-sm text-yellow-800">
          Low slippage may fail if the pool changes before confirmation.
        </div>
      )}
      {isHighSlippage && (
        <div className="mt-2 rounded border border-yellow-200 bg-yellow-50 p-2 text-sm text-yellow-800">
          High slippage allows a worse result before failing.
        </div>
      )}
    </Field>
  );
}
