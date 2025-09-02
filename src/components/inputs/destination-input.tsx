import React, { forwardRef, useState, useEffect, useRef } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { isValidBitcoinAddress } from "@/utils/validation";
import { lookupAssetOwner, shouldTriggerAssetLookup } from "@/utils/validation/assetOwner";

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
    const [isLookingUp, setIsLookingUp] = useState(false);
    const [lookupResult, setLookupResult] = useState<string | null>(null);
    const [lookupError, setLookupError] = useState<string | null>(null);
    const debounceTimeout = useRef<NodeJS.Timeout | undefined>(undefined);

    // Asset owner lookup with debouncing
    useEffect(() => {
      // Clear any existing timeout
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }

      setLookupResult(null);
      setLookupError(null);

      if (!value || isValidBitcoinAddress(value)) {
        setIsLookingUp(false);
        return;
      }

      // Check if this looks like an asset name
      console.log('🤔 Should trigger lookup for:', value, shouldTriggerAssetLookup(value));
      if (!shouldTriggerAssetLookup(value)) {
        setIsLookingUp(false);
        return;
      }

      // Set up debounced asset lookup
      debounceTimeout.current = setTimeout(async () => {
        console.log('🔍 Starting asset lookup for:', value);
        setIsLookingUp(true);
        try {
          const result = await lookupAssetOwner(value);
          console.log('📋 Lookup result:', result);
          if (result.isValid && result.ownerAddress) {
            setLookupResult(result.ownerAddress);
            console.log('✅ Setting owner address:', result.ownerAddress);
            // Automatically set the address as the value
            onChange(result.ownerAddress);
          } else {
            console.log('❌ Lookup failed:', result.error);
            setLookupError(result.error || 'Asset not found');
          }
        } catch (error) {
          console.log('💥 Lookup error:', error);
          setLookupError('Failed to lookup asset owner');
        } finally {
          setIsLookingUp(false);
        }
      }, 800); // 800ms debounce for asset lookups

      return () => {
        if (debounceTimeout.current) {
          clearTimeout(debounceTimeout.current);
        }
      };
    }, [value, onChange]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
            className={`mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 ${
              isInvalid ? "border-red-500 focus:border-red-500 focus:ring-red-500" : 
              lookupResult && isValidAddress ? "border-green-500 focus:border-green-500 focus:ring-green-500" :
              "border-gray-300 focus:ring-blue-500 focus:border-blue-500"
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