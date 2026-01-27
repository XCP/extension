import { useState, useEffect, useRef, type ReactElement } from "react";
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
import { useFeeRates, FeeRateOption } from "@/hooks/useFeeRates";
import { formatAmount } from "@/utils/format";
import { validateFeeRate } from "@/utils/validation/fee";

interface FeeRateInputProps {
  showHelpText?: boolean;
  disabled?: boolean;
  onFeeRateChange?: (satPerVbyte: number) => void; // Kept for components that need to share the value
}

type LocalFeeRateOption = FeeRateOption | "custom";

/**
 * FeeRateInput provides fee rate selection with presets and custom input option.
 *
 * @param props - The component props
 * @returns A ReactElement representing the fee rate selector
 */
export function FeeRateInput({
  showHelpText = false,
  disabled = false,
  onFeeRateChange,
}: FeeRateInputProps): ReactElement {
  const { feeRates, isLoading, error: fetchError, uniquePresetOptions } = useFeeRates(true);
  const [selectedOption, setSelectedOption] = useState<LocalFeeRateOption>("fast");
  const [customInput, setCustomInput] = useState<string>("0.1");
  const [internalError, setInternalError] = useState<string | null>(null);
  const isInitial = useRef(true);

  // Store callback in a ref to prevent infinite loops
  const onFeeRateChangeRef = useRef(onFeeRateChange);
  onFeeRateChangeRef.current = onFeeRateChange;

  // Create disabled props object once to reuse
  const disabledProps = disabled === true ? { disabled: true } : {};

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
      onFeeRateChangeRef.current?.(initialValue); // Notify parent of initial value
    }
  }, [feeRates]);

  useEffect(() => {
    if (feeRates && selectedOption !== "custom") {
      const preset = uniquePresetOptions.find((opt) => opt.id === selectedOption);
      if (preset) {
        setCustomInput(preset.value.toString());
        onFeeRateChangeRef.current?.(preset.value); // Notify parent of preset change
      }
    }
  }, [selectedOption, feeRates, uniquePresetOptions]);

  const feeOptions: { id: LocalFeeRateOption; name: string; value: number; }[] = feeRates
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
    
    // Enforce maximum two decimal places during typing
    if (parts.length === 2 && parts[1].length > 2) {
      const formattedValue = formatAmount({
        value: num,
        maximumFractionDigits: 2,
        minimumFractionDigits: 0
      });
      setCustomInput(formattedValue);
      onFeeRateChangeRef.current?.(parseFloat(formattedValue));
      return;
    }
    
    // Update the input value without minimum validation (allow temporary invalid values during editing)
    setCustomInput(trimmed);
    
    // Use validation utility to check if value is valid before notifying parent
    const validation = validateFeeRate(num, { minRate: 0.1, warnHighFee: false });
    if (validation.isValid && validation.satsPerVByte) {
      onFeeRateChangeRef.current?.(validation.satsPerVByte);
    }
  };

  const handleCustomInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const trimmed = e.target.value.trim();
    
    // Handle empty input
    if (trimmed === "") {
      setCustomInput("0.1");
      setInternalError("Fee rate is required");
      onFeeRateChangeRef.current?.(0.1);
      return;
    }
    
    // Validate using the fee validation utility
    const validation = validateFeeRate(trimmed, { minRate: 0.1, maxRate: 5000 });
    
    if (!validation.isValid) {
      // Use the error message from validation or default
      setInternalError(validation.error || "Invalid fee rate");
      setCustomInput("0.1");
      onFeeRateChangeRef.current?.(0.1);
      return;
    }
    
    const num = validation.satsPerVByte || 0.1;
    
    // Format the final value and notify parent
    const formattedValue = formatAmount({
      value: num,
      maximumFractionDigits: 2,
      minimumFractionDigits: 0
    });
    setCustomInput(formattedValue);
    onFeeRateChange?.(parseFloat(formattedValue));
  };

  const handleOptionSelect = (option: { id: LocalFeeRateOption; name: string; value: number } | null) => {
    if (!option) return;
    
    setSelectedOption(option.id);
    if (option.id !== "custom") {
      setCustomInput(option.value.toString());
      setInternalError(null);
      onFeeRateChangeRef.current?.(option.value); // Notify parent of selected preset
    }
  };

  const handleEscClick = () => {
    if (uniquePresetOptions.length > 0) {
      const firstPreset = uniquePresetOptions[0];
      setSelectedOption(firstPreset.id);
      setCustomInput(firstPreset.value.toString());
      setInternalError(null);
      onFeeRateChangeRef.current?.(firstPreset.value); // Notify parent of reset
    }
  };

  if (isLoading) {
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
            type="text"
            inputMode="decimal"
            value={customInput}
            onChange={handleCustomInputChange}
            onBlur={handleCustomInputBlur}
            required
            {...disabledProps}
            invalid={!!internalError}
            aria-label="Custom Fee Rate"
            aria-invalid={!!internalError}
            aria-describedby={internalError ? "sat_per_vbyte-error" : undefined}
            className="block w-full p-2.5 rounded-md border border-gray-200 bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
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
              type="text"
              inputMode="decimal"
              value={customInput}
              onChange={handleCustomInputChange}
              onBlur={handleCustomInputBlur}
              required
              {...disabledProps}
              invalid={!!internalError}
              aria-label="Custom Fee Rate"
              aria-invalid={!!internalError}
              aria-describedby={internalError ? "sat_per_vbyte-error" : undefined}
              className="block w-full p-2.5 rounded-md border border-gray-200 bg-gray-50 pr-16 focus:border-blue-500 focus:ring-blue-500"
            />
            {feeRates && (
              <Button variant="input" onClick={handleEscClick} aria-label="Reset to first preset" {...disabledProps}>
                Esc
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Hidden input that will be included in form submission when using dropdown */}
            <input type="hidden" name="sat_per_vbyte" value={currentFeeRate.toString()} />
            
            {feeRates && feeOptions.length > 0 && (
              <div className="relative">
                <Listbox value={feeOptions.find((opt) => opt.id === selectedOption) || feeOptions[0]} onChange={handleOptionSelect}>
                  <ListboxButton
                    className="w-full p-2.5 text-left rounded-md border border-gray-200 bg-gray-50 focus:border-blue-500 focus:ring-blue-500 cursor-pointer"
                    {...disabledProps}
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
                  <ListboxOptions className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
                    {feeOptions.map((option) => (
                      <ListboxOption
                        key={option.id}
                        value={option}
                        className="p-2.5 cursor-pointer hover:bg-gray-100"
                      >
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
              </div>
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
