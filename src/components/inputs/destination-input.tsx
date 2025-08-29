import React, { forwardRef } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { isValidBitcoinAddress } from "@/utils/blockchain/bitcoin";

interface DestinationInputProps {
  value: string;
  onChange: (value: string) => void;
  onValidationChange?: (isValid: boolean) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  showHelpText?: boolean;
  className?: string;
  name?: string;
  label?: string;
  helpText?: string;
}

export const DestinationInput = forwardRef<HTMLInputElement, DestinationInputProps>(
  (
    {
      value,
      onChange,
      onValidationChange,
      placeholder = "Enter destination address",
      required = true,
      disabled = false,
      showHelpText = false,
      className = "",
      name = "destination",
      label = "Destination",
      helpText = "Enter recipient's address.",
    },
    ref
  ) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value.trim();
      onChange(newValue);
      
      // Validate and notify parent
      if (onValidationChange) {
        if (!newValue) {
          // Empty value: valid if not required, invalid if required
          onValidationChange(!required);
        } else {
          // Non-empty value: must be valid address
          onValidationChange(isValidBitcoinAddress(newValue));
        }
      }
    };

    const isInvalid = value && !isValidBitcoinAddress(value);

    return (
      <Field>
        <Label className="text-sm font-medium text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
        <Input
          ref={ref}
          type="text"
          name={name}
          value={value}
          onChange={handleChange}
          required={required}
          placeholder={placeholder}
          disabled={disabled}
          className={`mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 ${
            isInvalid ? "border-red-500 focus:border-red-500 focus:ring-red-500" : "border-gray-300 focus:ring-blue-500 focus:border-blue-500"
          } ${className}`}
        />
        {showHelpText && helpText && (
          <Description className="mt-2 text-sm text-gray-500">
            {helpText}
          </Description>
        )}
      </Field>
    );
  }
);

DestinationInput.displayName = "DestinationInput";