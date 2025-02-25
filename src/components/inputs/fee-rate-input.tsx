import React, { useState, useEffect, useRef } from "react";
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
import { Button } from "@/components/button";
import { useFeeRates, FeeRateOption } from "@/hooks/useFeeRates";

interface FeeRateInputProps {
  showHelpText?: boolean;
  disabled?: boolean;
  onFeeRateChange?: (satPerVbyte: number) => void; // New prop
}

type LocalFeeRateOption = FeeRateOption | "custom";

export function FeeRateInput({
  showHelpText = false,
  disabled = false,
  onFeeRateChange,
}: FeeRateInputProps) {
  const { feeRates, loading, error: fetchError, uniquePresetOptions } = useFeeRates(true);
  const [selectedOption, setSelectedOption] = useState<LocalFeeRateOption>("fast");
  const [customInput, setCustomInput] = useState<string>("1");
  const [internalError, setInternalError] = useState<string | null>(null);
  const isInitial = useRef(true);

  useEffect(() => {
    if (feeRates && isInitial.current) {
      const initialValue = Math.max(feeRates.fastestFee, 1);
      setCustomInput(initialValue.toString());
      setSelectedOption("fast");
      isInitial.current = false;
      onFeeRateChange?.(initialValue); // Notify parent of initial value
    }
  }, [feeRates, onFeeRateChange]);

  useEffect(() => {
    if (feeRates && selectedOption !== "custom") {
      const preset = uniquePresetOptions.find((opt) => opt.id === selectedOption);
      if (preset) {
        setCustomInput(preset.value.toString());
        onFeeRateChange?.(preset.value); // Notify parent of preset change
      }
    }
  }, [selectedOption, feeRates, uniquePresetOptions, onFeeRateChange]);

  const feeOptions = feeRates
    ? [...uniquePresetOptions, { id: "custom", name: "Custom", value: parseFloat(customInput) || 1 }]
    : [{ id: "custom", name: "Custom", value: parseFloat(customInput) || 1 }];

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomInput(e.target.value);
    setInternalError(null);
  };

  const handleCustomBlur = () => {
    const trimmed = customInput.trim();
    const num = parseFloat(trimmed);
    if (isNaN(num) || num < 1) {
      setCustomInput("1");
      setInternalError("Fee rate must be at least 1 sat/vB.");
      onFeeRateChange?.(1); // Notify parent of corrected value
    } else {
      const parts = trimmed.split(".");
      if (parts.length === 2 && parts[1].length > 1) {
        setCustomInput(num.toFixed(1));
      }
      onFeeRateChange?.(num); // Notify parent of custom value
    }
  };

  const handleOptionSelect = (option: { id: LocalFeeRateOption; name: string; value: number }) => {
    setSelectedOption(option.id);
    if (option.id !== "custom") {
      setCustomInput(option.value.toString());
      setInternalError(null);
      onFeeRateChange?.(option.value); // Notify parent of selected preset
    }
  };

  const handleEscClick = () => {
    if (uniquePresetOptions.length > 0) {
      const firstPreset = uniquePresetOptions[0];
      setSelectedOption(firstPreset.id);
      setCustomInput(firstPreset.value.toString());
      setInternalError(null);
      onFeeRateChange?.(firstPreset.value); // Notify parent of reset
    }
  };

  if (loading) {
    return (
      <Field>
        <Label className="block text-sm font-medium text-gray-700">
          Fee Rate <span className="text-red-500">*</span>
        </Label>
        <div className="mt-1">
          <p>Loading fee rates…</p>
        </div>
      </Field>
    );
  }

  if (fetchError) {
    return (
      <Field>
        <Label className="block text-sm font-medium text-gray-700">
          Fee Rate (Custom) <span className="text-red-500">*</span>
        </Label>
        <div className="mt-1">
          <Input
            name="sat_per_vbyte"
            type="number"
            value={customInput}
            onChange={handleCustomChange}
            onBlur={handleCustomBlur}
            min="1"
            step="0.1"
            required
            disabled={disabled}
            invalid={!!internalError}
            aria-label="Custom Fee Rate"
            aria-invalid={!!internalError}
            aria-describedby={internalError ? "sat_per_vbyte-error" : undefined}
            className="block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
        {showHelpText && (
          <Description className="mt-2 text-sm text-gray-500">
            Unable to fetch fee rates. Please enter a custom fee rate (minimum 1 sat/vB).
          </Description>
        )}
        {internalError && (
          <p className="text-red-500 text-sm mt-2" role="alert" id="sat_per_vbyte-error">
            {internalError}
          </p>
        )}
      </Field>
    );
  }

  return (
    <Field>
      <Label className="block text-sm font-medium text-gray-700">
        Fee Rate <span className="text-red-500">*</span>
      </Label>
      <div className="mt-1">
        {selectedOption === "custom" ? (
          <div className="relative">
            <Input
              name="sat_per_vbyte"
              type="number"
              value={customInput}
              onChange={handleCustomChange}
              onBlur={handleCustomBlur}
              min="1"
              step="0.1"
              required
              disabled={disabled}
              invalid={!!internalError}
              aria-label="Custom Fee Rate"
              aria-invalid={!!internalError}
              aria-describedby={internalError ? "sat_per_vbyte-error" : undefined}
              className="block w-full p-2 rounded-md border bg-gray-50 pr-16 focus:border-blue-500 focus:ring-blue-500"
            />
            {feeRates && (
              <Button variant="input" onClick={handleEscClick} aria-label="Reset to first preset" disabled={disabled}>
                Esc
              </Button>
            )}
          </div>
        ) : (
          feeRates && (
            <Listbox value={feeOptions.find((opt) => opt.id === selectedOption)} onChange={handleOptionSelect}>
              <ListboxButton
                className="w-full p-2 text-left rounded-md border border-gray-200 bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
                disabled={disabled}
              >
                {({ value }) => (
                  <div className="flex justify-between">
                    <span>{value?.name}</span>
                    {value?.id !== "custom" && (
                      <span className="text-gray-500">{value.value} sat/vB</span>
                    )}
                  </div>
                )}
              </ListboxButton>
              <ListboxOptions className="w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-auto">
                {feeOptions.map((option) => (
                  <ListboxOption key={option.id} value={option} className="p-2 cursor-pointer hover:bg-gray-100">
                    {({ selected }) => (
                      <div className="flex justify-between">
                        <span className={selected ? "font-medium" : ""}>{option.name}</span>
                        {option.id !== "custom" && (
                          <span className="text-gray-500">{option.value} sat/vB</span>
                        )}
                      </div>
                    )}
                  </ListboxOption>
                ))}
              </ListboxOptions>
            </Listbox>
          )
        )}
      </div>
      {showHelpText && (
        <Description className="mt-2 text-sm text-gray-500">
          Pre-populated with current rates (min 1 sat/vB).
        </Description>
      )}
      {internalError && (
        <p className="text-red-500 text-sm mt-2" role="alert" id="sat_per_vbyte-error">
          {internalError}
        </p>
      )}
    </Field>
  );
}
