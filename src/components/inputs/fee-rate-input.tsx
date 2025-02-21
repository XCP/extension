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
import { useFeeRates } from '@/hooks/useFeeRates';

interface FeeRateInputProps {
  id?: string;
  value: number;
  onChange: (value: number) => void;
  error?: string;
  showLabel?: boolean;
  label?: string;
  className?: string;
  showHelpText?: boolean;
  autoFetch?: boolean;
}

type FeeRateOption = 'fast' | 'medium' | 'slow' | 'custom';

interface FeeOption {
  id: FeeRateOption;
  name: string;
  value: number;
}

export function FeeRateInput({
  id = 'feeRateSatPerVByte',
  value,
  onChange,
  error,
  showLabel = true,
  label = 'Fee Rate',
  className,
  showHelpText = false,
  autoFetch = true,
}: FeeRateInputProps) {
  const { feeRates, loading, error: fetchError, uniquePresetOptions } = useFeeRates(autoFetch);
  const [selectedOption, setSelectedOption] = useState<FeeRateOption>('fast');
  const [customInput, setCustomInput] = useState<string>(value.toString());
  const isInitial = useRef(true);

  useEffect(() => {
    if (feeRates && isInitial.current) {
      const initialValue = Math.max(feeRates.fastestFee, 1); // Ensure >= 1
      setSelectedOption('fast');
      onChange(initialValue);
      isInitial.current = false;
    }
  }, [feeRates, onChange]);

  useEffect(() => {
    if (feeRates) {
      const preset = uniquePresetOptions.find((opt) => opt.value === value);
      setSelectedOption(preset ? (preset.id as FeeRateOption) : 'custom');
    } else {
      setSelectedOption('custom');
    }
  }, [value, feeRates, uniquePresetOptions]);

  useEffect(() => {
    if (selectedOption === 'custom') {
      setCustomInput(value.toString());
    }
  }, [value, selectedOption]);

  const feeOptions: FeeOption[] = feeRates
    ? [...uniquePresetOptions, { id: 'custom', name: 'Custom', value }]
    : [{ id: 'custom', name: 'Custom', value }];

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomInput(e.target.value);
  };

  const handleCustomBlur = () => {
    const trimmed = customInput.trim();
    const num = parseFloat(trimmed);
    if (isNaN(num) || num < 1) {
      setCustomInput(Math.max(value, 1).toString()); // Reset to valid value
      onChange(Math.max(value, 1));
    } else {
      const parts = trimmed.split('.');
      if (parts.length === 2 && parts[1].length > 1) {
        setCustomInput(value.toString());
      } else {
        onChange(num);
      }
    }
  };

  const handleOptionSelect = (option: FeeOption) => {
    setSelectedOption(option.id);
    if (option.id === 'custom') {
      // Let the user edit custom input
    } else {
      onChange(option.value);
    }
  };

  const handleEscClick = () => {
    if (uniquePresetOptions.length > 0) {
      const firstPreset = uniquePresetOptions[0];
      setSelectedOption(firstPreset.id as FeeRateOption);
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
                  <ListboxOption key={option.id} value={option} className="p-2 cursor-pointer">
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
    </Field>
  );
}
