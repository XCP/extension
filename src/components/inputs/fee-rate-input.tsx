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
import { formatAmount } from "@/utils/format";
import { validateFeeRate } from "@/utils/validation";

interface FeeRateInputProps {
  showHelpText?: boolean;
  disabled?: boolean;
  onFeeRateChange?: (satPerVbyte: number) => void; // Kept for components that need to share the value
}

type LocalFeeRateOption = FeeRateOption | "custom";

export function FeeRateInput({
  showHelpText = false,
  disabled = false,
  onFeeRateChange,
}: FeeRateInputProps) {
  const { feeRates, loading, error: fetchError, uniquePresetOptions } = useFeeRates(true);
  const [selectedOption, setSelectedOption] = useState<LocalFeeRateOption>("fast");
  const [customInput, setCustomInput] = useState<string>("0.1");
  const [internalError, setInternalError] = useState<string | null>(null);
  const isInitial = useRef(true);

  // Calculate the current fee rate value based on selection
  const currentFeeRate = selectedOption === "custom" 
    ? parseFloat(customInput) || 0.1 
    : feeRates && uniquePresetOptions.find(opt => opt.id === selectedOption)?.value || 0.1;

  useEffect(() => {
    if (feeRates && isInitial.current) {
      const initialValue = Math.max(feeRates.fastestFee, 0.1);
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
    ? [...uniquePresetOptions, { id: "custom", name: "Custom", value: parseFloat(customInput) || 0.1 }]
    : [{ id: "custom", name: "Custom", value: parseFloat(customInput) || 0.1 }];

  const handleCustomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const trimmed = e.target.value.trim();
    setInternalError(null);
    
    // Allow empty input temporarily while typing
    if (trimmed === "") {
      setCustomInput("");
      return;
    }
    
    // Only allow valid numeric input with at most one decimal point
    const parts = trimmed.split(".");
    if (parts.length > 2) {
      return; // Ignore input with multiple decimal points
    }
    
    // Basic format check - allow typing but don't validate yet
    const num = parseFloat(trimmed);
    if (isNaN(num)) {
      return; // Ignore non-numeric input
    }
    
    // Enforce maximum one decimal place during typing
    if (parts.length === 2 && parts[1].length > 1) {
      const formattedValue = formatAmount({
        value: num,
        maximumFractionDigits: 1,
        minimumFractionDigits: 0
      });
      setCustomInput(formattedValue);
      onFeeRateChange?.(parseFloat(formattedValue));
      return;
    }
    
    // Update the input value without minimum validation (allow temporary invalid values during editing)
    setCustomInput(trimmed);
    
    // Use validation utility to check if value is valid before notifying parent
    const validation = validateFeeRate(num, { minRate: 0.1, warnHighFee: false });
    if (validation.isValid && validation.satsPerVByte) {
      onFeeRateChange?.(validation.satsPerVByte);
    }
  };

  const handleCustomInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const trimmed = e.target.value.trim();
    
    // Handle empty input
    if (trimmed === "") {
      setCustomInput("0.1");
      setInternalError("Fee rate is required");
      onFeeRateChange?.(0.1);
      return;
    }
    
    // Validate using the fee validation utility
    const validation = validateFeeRate(trimmed, { minRate: 0.1, maxRate: 5000 });
    
    if (!validation.isValid) {
      // Use the error message from validation or default
      setInternalError(validation.error || "Invalid fee rate");
      setCustomInput("0.1");
      onFeeRateChange?.(0.1);
      return;
    }
    
    const num = validation.satsPerVByte || 0.1;
    
    // Format the final value and notify parent
    const formattedValue = formatAmount({
      value: num,
      maximumFractionDigits: 1,
      minimumFractionDigits: 0
    });
    setCustomInput(formattedValue);
    onFeeRateChange?.(parseFloat(formattedValue));
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
        {/* Always include the hidden input even when loading */}
        <input type="hidden" name="sat_per_vbyte" value="0.1" />
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
            onChange={handleCustomInputChange}
            onBlur={handleCustomInputBlur}
            min="0.1"
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
            Unable to fetch fee rates. Please enter a custom fee rate (minimum 0.1 sat/vB).
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
              onChange={handleCustomInputChange}
              onBlur={handleCustomInputBlur}
              min="0.1"
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
          <>
            {/* Hidden input that will be included in form submission when using dropdown */}
            <input type="hidden" name="sat_per_vbyte" value={currentFeeRate.toString()} />
            
            {feeRates && (
              <Listbox value={feeOptions.find((opt) => opt.id === selectedOption)} onChange={handleOptionSelect}>
                <ListboxButton
                  className="w-full p-2 text-left rounded-md border border-gray-300 bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
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
            )}
          </>
        )}
      </div>
      {showHelpText && (
        <Description className="mt-2 text-sm text-gray-500">
          Populated with network rates (min 0.1 sat/vB).
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
