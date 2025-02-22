import React, { useState, useEffect, useRef } from 'react';
import {
  Field,
  Label,
  Description,
  Input,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from '@headlessui/react';
import { Button } from '@/components/button';
import { useFeeRates, FeeRateOption } from '@/hooks/useFeeRates';

interface FeeRateInputProps {
  id?: string;
  value?: number;
  onChange: (value: number) => void;
  error?: string;
  showLabel?: boolean;
  label?: string;
  className?: string;
  showHelpText?: boolean;
  autoFetch?: boolean;
}

type LocalFeeRateOption = FeeRateOption | 'custom';

export function FeeRateInput({
  id = 'sat_per_vbyte',
  value: externalValue,
  onChange,
  error,
  showLabel = true,
  label = 'Fee Rate',
  className,
  showHelpText = false,
  autoFetch = true,
}: FeeRateInputProps) {
  const { feeRates, loading, error: fetchError, uniquePresetOptions } = useFeeRates(autoFetch);
  const [selectedOption, setSelectedOption] = useState<LocalFeeRateOption>('fast');
  const [internalValue, setInternalValue] = useState<number>(1); // Default to 1
  const [customInput, setCustomInput] = useState<string>('1');
  const isInitial = useRef(true);

  useEffect(() => {
    if (externalValue !== undefined) {
      setInternalValue(externalValue);
      setCustomInput(externalValue.toString());
    }
  }, [externalValue]);

  useEffect(() => {
    if (feeRates && isInitial.current) {
      const initialValue = Math.max(feeRates.fastestFee, 1);
      setInternalValue(initialValue);
      setCustomInput(initialValue.toString());
      onChange(initialValue);
      setSelectedOption('fast');
      isInitial.current = false;
    }
  }, [feeRates, onChange]);

  useEffect(() => {
    const currentValue = externalValue !== undefined ? externalValue : internalValue;
    if (feeRates) {
      const preset = uniquePresetOptions.find((opt) => opt.value === currentValue);
      setSelectedOption(preset ? preset.id : 'custom');
    } else {
      setSelectedOption('custom');
    }
  }, [externalValue, internalValue, feeRates, uniquePresetOptions]);

  useEffect(() => {
    if (selectedOption === 'custom') {
      const currentValue = externalValue !== undefined ? externalValue : internalValue;
      setCustomInput(currentValue.toString());
    }
  }, [externalValue, internalValue, selectedOption]);

  const feeOptions: { id: LocalFeeRateOption; name: string; value: number }[] = feeRates
    ? [...uniquePresetOptions, { id: 'custom', name: 'Custom', value: internalValue }]
    : [{ id: 'custom', name: 'Custom', value: internalValue }];

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomInput(e.target.value);
  };

  const handleCustomBlur = () => {
    const trimmed = customInput.trim();
    const num = parseFloat(trimmed);
    if (isNaN(num) || num < 1) {
      const resetValue = Math.max(internalValue, 1);
      setCustomInput(resetValue.toString());
      setInternalValue(resetValue);
      onChange(resetValue);
    } else {
      const parts = trimmed.split('.');
      if (parts.length === 2 && parts[1].length > 1) {
        setCustomInput(internalValue.toString());
      } else {
        setInternalValue(num);
        onChange(num);
      }
    }
  };

  const handleOptionSelect = (option: { id: LocalFeeRateOption; name: string; value: number }) => {
    setSelectedOption(option.id);
    if (option.id !== 'custom') {
      setInternalValue(option.value);
      onChange(option.value);
    }
  };

  const handleEscClick = () => {
    if (uniquePresetOptions.length > 0) {
      const firstPreset = uniquePresetOptions[0];
      setSelectedOption(firstPreset.id);
      setInternalValue(firstPreset.value);
      onChange(firstPreset.value);
    }
  };

  if (loading) {
    return (
      <Field className={className}>
        <Label htmlFor={id} className={showLabel ? 'block text-sm font-medium text-gray-700' : 'sr-only'}>
          {label}
          <span className="text-red-500">*</span>
        </Label>
        <div className="mt-1">
          <p>Loading fee rates…</p>
        </div>
      </Field>
    );
  }

  if (fetchError) {
    return (
      <Field className={className}>
        <Label htmlFor={id} className={showLabel ? 'block text-sm font-medium text-gray-700' : 'sr-only'}>
          {label} (Custom)
          <span className="text-red-500">*</span>
        </Label>
        <div className="mt-1">
          <Input
            id={id}
            type="number"
            value={customInput}
            onChange={handleCustomChange}
            onBlur={handleCustomBlur}
            min="1"
            step="0.1"
            required
            invalid={!!error}
            aria-label={`Custom ${label}`}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : undefined}
            className="block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
        {showHelpText && (
          <Description className="mt-2 text-sm text-gray-500">
            Unable to fetch fee rates. Please enter a custom fee rate (minimum 1 sat/vB).
          </Description>
        )}
        {error && (
          <p className="text-red-500 text-sm mt-2" role="alert" id={`${id}-error`}>
            {error}
          </p>
        )}
      </Field>
    );
  }

  return (
    <Field className={className}>
      <Label htmlFor={id} className={showLabel ? 'block text-sm font-medium text-gray-700' : 'sr-only'}>
        {label}
        <span className="text-red-500">*</span>
      </Label>
      <div className="mt-1">
        {selectedOption === 'custom' ? (
          <div className="relative">
            <Input
              id={id}
              type="number"
              value={customInput}
              onChange={handleCustomChange}
              onBlur={handleCustomBlur}
              min="1"
              step="0.1"
              required
              invalid={!!error}
              aria-label={`Custom ${label}`}
              aria-invalid={!!error}
              aria-describedby={error ? `${id}-error` : undefined}
              className="block w-full p-2 rounded-md border bg-gray-50 pr-16 focus:border-blue-500 focus:ring-blue-500"
            />
            {feeRates && (
              <Button variant="input" onClick={handleEscClick} aria-label="Reset to first preset">
                Esc
              </Button>
            )}
          </div>
        ) : (
          feeRates && (
            <Listbox value={feeOptions.find((opt) => opt.id === selectedOption)} onChange={handleOptionSelect}>
              <ListboxButton className="w-full p-2 text-left rounded-md border border-gray-200 bg-gray-50 focus:border-blue-500 focus:ring-blue-500">
                {({ value }) => (
                  <div className="flex justify-between">
                    <span>{value?.name}</span>
                    {value?.id !== 'custom' && (
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
                        <span className={selected ? 'font-medium' : ''}>{option.name}</span>
                        {option.id !== 'custom' && (
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
          {feeRates ? 'Pre-populated with current network rates (minimum 1 sat/vB).' : 'Enter a custom fee rate (minimum 1 sat/vB).'}
        </Description>
      )}
      {error && (
        <p className="text-red-500 text-sm mt-2" role="alert" id={`${id}-error`}>
          {error}
        </p>
      )}
    </Field>
  );
}
