import { useEffect, useState } from "react";
import {
  Field,
  Label,
  Description,
  Input,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { Button } from "@/components/ui/button";
import {
  isFiniteNumber,
  isGreaterThanOrEqualTo,
  isLessThan,
} from "@/utils/numeric";
import type { ReactElement } from "react";

export const DEFAULT_POOL_SLIPPAGE = "2.5";

const PRESET_OPTIONS = [
  { id: "tight", name: "Tight", value: "0.5" },
  { id: "standard", name: "Standard", value: DEFAULT_POOL_SLIPPAGE },
  { id: "loose", name: "Loose", value: "5" },
] as const;

type PresetId = typeof PRESET_OPTIONS[number]["id"];
type OptionId = PresetId | "custom";

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
  const [selectedOption, setSelectedOption] = useState<OptionId>("standard");
  const [customInput, setCustomInput] = useState(value);

  useEffect(() => {
    const matchingPreset = PRESET_OPTIONS.find((option) => option.value === value);
    if (matchingPreset) {
      setSelectedOption(matchingPreset.id);
      setCustomInput(value);
    } else {
      setSelectedOption("custom");
      setCustomInput(value);
    }
  }, [value]);

  const options = [
    ...PRESET_OPTIONS,
    { id: "custom" as const, name: "Custom", value: customInput || DEFAULT_POOL_SLIPPAGE },
  ];

  const showSlippageWarning = value.trim() !== "" && isFiniteNumber(value);
  const isLowSlippage = showSlippageWarning
    && isGreaterThanOrEqualTo(value, 0)
    && isLessThan(value, LOW_SLIPPAGE_THRESHOLD);
  const isHighSlippage = showSlippageWarning
    && isGreaterThanOrEqualTo(value, HIGH_SLIPPAGE_THRESHOLD);

  const handleOptionSelect = (option: typeof options[number] | null) => {
    if (!option) return;

    setSelectedOption(option.id);
    if (option.id !== "custom") {
      setCustomInput(option.value);
      onChange(option.value);
    }
  };

  const handleCustomInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value.trim();
    const parts = nextValue.split(".");
    if (parts.length > 2) return;
    if (nextValue !== "" && !isFiniteNumber(nextValue)) return;

    setCustomInput(nextValue);
    onChange(nextValue);
  };

  const handleCustomInputBlur = () => {
    if (!customInput || isLessThan(customInput, 0)) {
      setCustomInput(DEFAULT_POOL_SLIPPAGE);
      onChange(DEFAULT_POOL_SLIPPAGE);
    }
  };

  const handleEscClick = () => {
    const standard = PRESET_OPTIONS.find((option) => option.id === "standard") ?? PRESET_OPTIONS[0];
    setSelectedOption(standard.id);
    setCustomInput(standard.value);
    onChange(standard.value);
  };

  return (
    <Field>
      <Label className="block text-sm font-medium text-gray-700">
        Slippage Tolerance <span className="text-red-500">*</span>
      </Label>
      <div className="mt-1">
        {selectedOption === "custom" ? (
          <div className="relative">
            <Input
              type="text"
              inputMode="decimal"
              value={customInput}
              onChange={handleCustomInputChange}
              onBlur={handleCustomInputBlur}
              placeholder="Custom %"
              className="block w-full p-2.5 rounded-md border border-gray-200 bg-gray-50 pr-16 outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
            />
            <Button type="button" variant="input" onClick={handleEscClick} aria-label="Reset to standard slippage">
              Esc
            </Button>
          </div>
        ) : (
          <div className="relative">
            <Listbox
              value={options.find((option) => option.id === selectedOption) || options[1]}
              onChange={handleOptionSelect}
            >
              <ListboxButton className="w-full p-2.5 text-left rounded-md border border-gray-200 bg-gray-50 outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer">
                {({ value }) => (
                  <div className="flex justify-between">
                    <span>{value?.name}</span>
                    {value?.id !== "custom" && <span className="text-gray-500">{value?.value}%</span>}
                  </div>
                )}
              </ListboxButton>
              <ListboxOptions className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
                {options.map((option) => (
                  <ListboxOption
                    key={option.id}
                    value={option}
                    className={({ focus }) =>
                      `p-2.5 cursor-pointer select-none ${focus ? "bg-blue-500 text-white" : "text-gray-900"}`
                    }
                  >
                    {({ selected, focus }) => (
                      <div className="flex justify-between">
                        <span className={selected ? "font-medium" : ""}>{option.name}</span>
                        {option.id !== "custom" && (
                          <span className={focus ? "text-blue-100" : "text-gray-500"}>{option.value}%</span>
                        )}
                      </div>
                    )}
                  </ListboxOption>
                ))}
              </ListboxOptions>
            </Listbox>
          </div>
        )}
      </div>
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
