import { forwardRef, useEffect, ChangeEvent, useCallback } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { isValidBitcoinAddress, shouldTriggerAssetLookup } from "@/utils/validation";
import { useAssetOwnerLookup } from "@/hooks/useAssetOwnerLookup";

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
    const onResolve = useCallback((assetName: string, ownerAddress: string) => {
      onChange(ownerAddress);
    }, [onChange]);

    const { isLookingUp, result: lookupResult, error: lookupError, performLookup } = useAssetOwnerLookup({
      onResolve
    });

    // Asset owner lookup with debouncing
    useEffect(() => {
      performLookup(value);
    }, [value, performLookup]);

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value.trim();
      onChange(newValue);
      
      // Validate and notify parent
      if (onValidationChange) {
        if (!newValue) {
          // Empty value: valid if not required, invalid if required
          onValidationChange(!required);
        } else {
          // Valid if it's a Bitcoin address or if we're in the process of looking up an asset
          const isValidAddress = isValidBitcoinAddress(newValue);
          const couldBeAsset = shouldTriggerAssetLookup(newValue);
          onValidationChange(isValidAddress || couldBeAsset);
        }
      }
    };

    const isValidAddress = value && isValidBitcoinAddress(value);
    const couldBeAsset = value && shouldTriggerAssetLookup(value) && !isValidAddress;
    const isInvalid = value && !isValidAddress && !couldBeAsset && !isLookingUp;

    // Determine help text
    let displayHelpText = helpText;
    let helpTextColor = "text-gray-500";
    
    if (lookupError) {
      displayHelpText = lookupError;
      helpTextColor = "text-red-600";
    } else if (isLookingUp) {
      displayHelpText = "Looking up asset owner...";
      helpTextColor = "text-blue-600";
    } else if (lookupResult && isValidAddress) {
      displayHelpText = `Resolved to owner address`;
      helpTextColor = "text-green-600";
    }

    return (
      <Field>
        <Label className="text-sm font-medium text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
        <div className="relative">
          <Input
            ref={ref}
            type="text"
            name={name}
            value={value}
            onChange={handleChange}
            required={required}
            placeholder={placeholder}
            disabled={disabled}
            className={`mt-1 block w-full p-2.5 rounded-md border border-gray-200 bg-gray-50 focus:ring-2 ${
              isInvalid ? "!border-red-500 focus:!border-red-500 focus:!ring-red-500" :
              lookupResult && isValidAddress ? "!border-green-500 focus:!border-green-500 focus:!ring-green-500" :
              "focus:ring-blue-500 focus:border-blue-500"
            } ${className}`}
          />
          {isLookingUp && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <div className="animate-spin h-4 w-4 border-2 border-gray-500 border-t-transparent rounded-full"></div>
            </div>
          )}
        </div>
        {showHelpText && displayHelpText && (
          <Description className={`mt-1 text-sm ${helpTextColor}`}>
            {displayHelpText}
          </Description>
        )}
      </Field>
    );
  }
);

DestinationInput.displayName = "DestinationInput";