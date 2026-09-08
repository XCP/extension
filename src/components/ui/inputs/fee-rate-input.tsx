import {
  Description,
  Field,
  Input,
  Label,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { feeErrorMessage } from '@/components/composer/transaction-error-message';
import { Button } from "@/components/ui/button";
import { maximum, toNumber } from "@/core/numeric";
import { validateFeeRate } from "@/core/validation/fee";
import { type FeeRateOption, useFeeRates } from "@/hooks/useFeeRates";
import { t } from '@/i18n';

interface FeeRateInputProps {
  showHelpText?: boolean;
  disabled?: boolean;
  onFeeRateChange?: (satPerVbyte: number | null) => void;
  initialValue?: number | null;
}

type LocalFeeRateOption = FeeRateOption | "custom";

function getValidInitialFeeRate(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const validation = validateFeeRate(value, { minRate: 0.1, maxRate: 5000, warnHighFee: false });
  return validation.isValid && validation.satsPerVByte !== undefined
    ? validation.satsPerVByte
    : null;
}

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
  initialValue,
}: FeeRateInputProps): ReactElement {
  const { feeRates, isLoading, error: fetchError, uniquePresetOptions } = useFeeRates(true);
  const validInitialValue = getValidInitialFeeRate(initialValue);
  const [selectedOption, setSelectedOption] = useState<LocalFeeRateOption>("fast");
  const [customInput, setCustomInput] = useState<string>(() =>
    validInitialValue !== null ? validInitialValue.toString() : ""
  );
  const [internalError, setInternalError] = useState<string | null>(null);
  const isInitial = useRef(true);
  const hasRunPresetEffect = useRef(false);

  // Store callback in a ref to prevent infinite loops
  const onFeeRateChangeRef = useRef(onFeeRateChange);
  onFeeRateChangeRef.current = onFeeRateChange;

  // Create disabled props object once to reuse
  const disabledProps = disabled === true ? { disabled: true } : {};

  // Calculate the current fee rate value based on selection
  const customValidation = validateFeeRate(customInput, { minRate: 0.1, maxRate: 5000, warnHighFee: false });
  const currentFeeRate = selectedOption === "custom"
    ? (customValidation.isValid ? customValidation.satsPerVByte ?? null : null)
    : uniquePresetOptions.find((opt) => opt.id === selectedOption)?.value ?? null;

  useEffect(() => {
    if (feeRates && isInitial.current) {
      isInitial.current = false;

      // Check if user explicitly set a fee rate (null = use network default)
      if (validInitialValue !== null) {
        // Check if it matches a preset
        const matchingPreset = uniquePresetOptions.find(opt => opt.value === validInitialValue);
        if (matchingPreset) {
          setSelectedOption(matchingPreset.id);
          setCustomInput(validInitialValue.toString());
        } else {
          // Use custom mode for non-preset values
          setSelectedOption("custom");
          setCustomInput(validInitialValue.toString());
        }
        onFeeRateChangeRef.current?.(validInitialValue);
      } else {
        // Default to fast preset (fresh load or default value)
        const defaultValue = toNumber(maximum(feeRates.fastestFee, 0.1));
        setCustomInput(defaultValue.toString());
        setSelectedOption("fast");
        onFeeRateChangeRef.current?.(defaultValue);
      }
    }
  }, [feeRates, validInitialValue, uniquePresetOptions]);

  useEffect(() => {
    // Skip the first run - initialization is handled by the initialization effect above.
    // This prevents the preset effect from conflicting with initialValue restoration.
    if (!hasRunPresetEffect.current) {
      hasRunPresetEffect.current = true;
      return;
    }

    if (feeRates && selectedOption !== "custom") {
      const preset = uniquePresetOptions.find((opt) => opt.id === selectedOption);
      if (preset) {
        setCustomInput(preset.value.toString());
        onFeeRateChangeRef.current?.(preset.value); // Notify parent of preset change
      }
    }
  }, [selectedOption, feeRates, uniquePresetOptions]);

  const feeOptions: { id: LocalFeeRateOption; name: string; value: number; }[] = feeRates
    ? [...uniquePresetOptions.map(option => ({ ...option, name: option.id === "fast" ? t('inputs_fee_rate_input_fastest') : option.id === "medium" ? t('inputs_fee_rate_input_thirty_minutes') : t('inputs_fee_rate_input_one_hour') })), { id: "custom", name: t('common_custom'), value: currentFeeRate ?? 0 }]
    : [{ id: "custom", name: t('common_custom'), value: currentFeeRate ?? 0 }];

  const setCustomDraft = (draft: string) => {
    // Keep invalid and incomplete drafts visible; there is no previous valid
    // fee to submit while the field contains different text.
    setCustomInput(draft);
    const validation = validateFeeRate(draft, { minRate: 0.1, maxRate: 5000, warnHighFee: false });
    setInternalError(draft && !validation.isValid ? feeErrorMessage(validation) : null);
    onFeeRateChangeRef.current?.(validation.isValid ? validation.satsPerVByte ?? null : null);
  };

  const handleCustomInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setCustomDraft(event.target.value);
  };

  const handleCustomInputBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    // Validation must not round, strip separators, clamp, or replace the draft.
    const validation = validateFeeRate(event.target.value, { minRate: 0.1, maxRate: 5000 });
    setInternalError(validation.isValid ? null : feeErrorMessage(validation));
    onFeeRateChangeRef.current?.(validation.isValid ? validation.satsPerVByte ?? null : null);
  };

  const handleCustomInputPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text/plain');
    if (!/[\r\n]/.test(pasted)) return;
    event.preventDefault();
    const input = event.currentTarget;
    const escaped = pasted.replace(/\r/g, '\\r').replace(/\n/g, '\\n');
    setCustomDraft(customInput.slice(0, input.selectionStart ?? 0) + escaped + customInput.slice(input.selectionEnd ?? customInput.length));
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
      const firstPreset = uniquePresetOptions[0]!;
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
          
          {t('inputs_fee_rate_input_fee_rate')} <span className="text-red-500">*</span>
        </Label>
        <div className="mt-1">
          <p>{t('inputs_fee_rate_input_loading_fee_rates')}</p>
        </div>
        {validInitialValue !== null && (
          <input type="hidden" name="sat_per_vbyte" value={validInitialValue.toString()} />
        )}
      </Field>
    );
  }

  if (fetchError) {
    return (
      <Field>
        <Label className="block text-sm font-medium text-gray-700">
          
          {t('inputs_fee_rate_input_fee_rate_custom')} <span className="text-red-500">*</span>
        </Label>
        <div className="mt-1">
          <Input
            name="sat_per_vbyte"
            type="text"
            inputMode="decimal"
            value={customInput}
            onChange={handleCustomInputChange}
            onBlur={handleCustomInputBlur}
            onPaste={handleCustomInputPaste}
            pattern={'([0-9]+(\\.[0-9]{1,8})?|\\.[0-9]{1,8})'}
            required
            {...disabledProps}
            invalid={!!internalError}
            aria-label={t('inputs_fee_rate_input_custom_fee_rate')}
            aria-invalid={!!internalError}
            aria-describedby={internalError ? "sat_per_vbyte-error" : undefined}
            className="block w-full p-2.5 rounded-md border border-gray-200 bg-gray-50 outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
          />
        </div>
        {showHelpText && (
          <Description className="mt-2 text-sm text-gray-500">
            {t('inputs_fee_rate_input_unable_to_fetch_fee_rates')}
          </Description>
        )}
        {internalError && (
          <Description className="text-red-500 text-sm mt-2" role="alert" id="sat_per_vbyte-error">
            {feeErrorMessage(customValidation)}
          </Description>
        )}
      </Field>
    );
  }

  return (
    <Field>
      <Label className="block text-sm font-medium text-gray-700">
        
        {t('inputs_fee_rate_input_fee_rate')} <span className="text-red-500">*</span>
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
            onPaste={handleCustomInputPaste}
            pattern={'([0-9]+(\\.[0-9]{1,8})?|\\.[0-9]{1,8})'}
              required
              {...disabledProps}
              invalid={!!internalError}
              aria-label={t('inputs_fee_rate_input_custom_fee_rate')}
              aria-invalid={!!internalError}
              aria-describedby={internalError ? "sat_per_vbyte-error" : undefined}
              className="block w-full p-2.5 rounded-md border border-gray-200 bg-gray-50 pr-16 outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
            />
            {feeRates && (
              <Button variant="input" onClick={handleEscClick} aria-label={t('inputs_fee_rate_input_reset_to_first_preset')} {...disabledProps}>
                {t('inputs_fee_rate_input_esc')}
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Hidden input that will be included in form submission when using dropdown */}
            {currentFeeRate !== null && (
              <input type="hidden" name="sat_per_vbyte" value={currentFeeRate.toString()} />
            )}
            
            {feeRates && feeOptions.length > 0 && (
              <div className="relative">
                <Listbox value={feeOptions.find((opt) => opt.id === selectedOption) || feeOptions[0]} onChange={handleOptionSelect}>
                  <ListboxButton
                    className="w-full p-2.5 text-left rounded-md border border-gray-200 bg-gray-50 outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
                    {...disabledProps}
                  >
                    {({ value }) => (
                      <div className="flex justify-between">
                        <span>{value?.name}</span>
                        {value?.id !== "custom" && (
                          <span className="text-gray-500">{t('common_sat_vb', [String(value.value)])}</span>
                        )}
                      </div>
                    )}
                  </ListboxButton>
                  <ListboxOptions className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
                    {feeOptions.map((option) => (
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
                              <span className={focus ? "text-blue-100" : "text-gray-500"}>{t('common_sat_vb', [String(option.value)])}</span>
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
          {t('inputs_fee_rate_input_populated_with_network_rates_min')}
        </Description>
      )}
      {internalError && (
        <Description className="text-red-500 text-sm mt-2" role="alert" id="sat_per_vbyte-error">
          {feeErrorMessage(customValidation)}
        </Description>
      )}
    </Field>
  );
}
