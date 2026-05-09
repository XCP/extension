import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/ui/button";
import type { ReactElement } from "react";

const PRESET_SLIPPAGE = ["0.5", "1", "2", "3"];

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
    </Field>
  );
}
