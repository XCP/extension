import { forwardRef, useEffect, useState, useRef } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { fetchAssetDetails } from "@/utils/blockchain/counterparty";
import { useWallet } from "@/contexts/wallet-context";
import { validateAssetName, validateParentAsset } from "@/utils/validation";

interface AssetNameInputProps {
  value: string;
  onChange: (value: string) => void;
  onValidationChange?: (isValid: boolean, error?: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  showHelpText?: boolean;
  className?: string;
  name?: string;
  label?: string;
  helpText?: string;
  isSubasset?: boolean;
  parentAsset?: string;
  autoFocus?: boolean;
}

// The component uses the validation from utils internally
// No need to re-export since consumers should use @/utils/validation directly

// Keep the original function for internal use if needed
function validateAssetNameInternal(assetName: string, isSubasset: boolean): { isValid: boolean; error?: string } {
  if (!assetName) {
    return { isValid: false, error: "Asset name is required" };
  }

  if (isSubasset) {
    // Full subasset validation (PARENT.CHILD format)
    if (!assetName.includes('.')) {
      return { isValid: false, error: "Invalid subasset format" };
    }
    
    const parts = assetName.split('.');
    if (parts.length !== 2) {
      return { isValid: false, error: "Invalid subasset format" };
    }
    
    const [parentAsset, subassetChild] = parts;
    
    // Validate parent asset
    const parentValidation = validateParentAsset(parentAsset);
    if (!parentValidation.isValid) {
      return parentValidation;
    }
    
    // Validate subasset child (part after the dot)
    if (!subassetChild) {
      return { isValid: false, error: "Subasset name cannot be empty" };
    }
    
    // Subasset child can contain: a-zA-Z0-9.-_@!
    const validChars = /^[a-zA-Z0-9.\-_@!]+$/;
    if (!validChars.test(subassetChild)) {
      return { isValid: false, error: "Invalid characters in subasset (allowed: a-zA-Z0-9.-_@!)" };
    }
    
    // Cannot start or end with period, no consecutive periods
    if (subassetChild.startsWith('.')) {
      return { isValid: false, error: "Subasset cannot start with period" };
    }
    if (subassetChild.endsWith('.')) {
      return { isValid: false, error: "Subasset cannot end with period" };
    }
    if (subassetChild.includes('..')) {
      return { isValid: false, error: "Subasset cannot have consecutive periods" };
    }
    
    // Total length check
    if (assetName.length > 250) {
      return { isValid: false, error: "Total name too long (max 250 characters)" };
    }
  } else {
    // Regular asset validation
    return validateParentAsset(assetName);
  }

  return { isValid: true };
}


// Keep internal version if needed
function validateParentAssetInternal(assetName: string): { isValid: boolean; error?: string } {
  // Cannot be reserved names
  if (assetName === 'BTC' || assetName === 'XCP') {
    return { isValid: false, error: "Cannot use reserved asset names" };
  }
  
  // Check if it's a numeric asset (A followed by 17-20 digits)
  const numericPattern = /^A(\d+)$/;
  const numericMatch = assetName.match(numericPattern);
  
  if (numericMatch) {
    // Numeric asset validation
    const digits = numericMatch[1];
    if (digits.length < 17 || digits.length > 20) {
      return { isValid: false, error: "Numeric assets: A + 17-20 digits" };
    }
    
    // Check numeric bounds: 26^12 + 1 <= value <= 256^8
    const numericValue = BigInt(digits);
    const lowerBound = BigInt(26) ** BigInt(12) + BigInt(1);
    const upperBound = BigInt(256) ** BigInt(8);
    
    if (numericValue < lowerBound || numericValue >= upperBound) {
      return { isValid: false, error: "Numeric value out of valid range" };
    }
  } else {
    // Non-numeric asset validation
    // Must be 4-12 characters
    if (assetName.length < 4) {
      return { isValid: false, error: "Asset name too short (min 4 characters)" };
    }
    if (assetName.length > 12) {
      return { isValid: false, error: "Asset name too long (max 12 characters)" };
    }
    
    // Must only contain A-Z
    if (!/^[A-Z]+$/.test(assetName)) {
      return { isValid: false, error: "Asset names must contain only A-Z" };
    }
    
    // Cannot start with 'A' (unless numeric, which we already handled)
    if (assetName.startsWith('A')) {
      return { isValid: false, error: "Non-numeric assets cannot start with 'A'" };
    }
  }
  
  return { isValid: true };
}

export const AssetNameInput = forwardRef<HTMLInputElement, AssetNameInputProps>(
  (
    {
      value,
      onChange,
      onValidationChange,
      placeholder,
      required = true,
      disabled = false,
      showHelpText = false,
      className = "",
      name = "asset",
      label = "Asset Name",
      helpText,
      isSubasset = false,
      parentAsset = "",
      autoFocus = false,
    },
    ref
  ) => {
    const { activeAddress } = useWallet();
    const [isChecking, setIsChecking] = useState(false);
    const [availabilityError, setAvailabilityError] = useState<string | undefined>();
    const [isValid, setIsValid] = useState(false);
    const debounceTimeout = useRef<NodeJS.Timeout | undefined>(undefined);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-focus on mount if requested
    useEffect(() => {
      if (autoFocus && inputRef.current) {
        inputRef.current.focus();
      }
    }, [autoFocus]);

    // Check asset availability when value changes (debounced)
    useEffect(() => {
      // Clear any existing timeout
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }

      if (!value) {
        setAvailabilityError(undefined);
        setIsChecking(false);
        setIsValid(false);
        return;
      }

      // Set up new debounced check
      debounceTimeout.current = setTimeout(async () => {
        // Only check availability if the format is valid
        const validation = validateAssetName(value, isSubasset);
        if (!validation.isValid) {
          setAvailabilityError(undefined);
          setIsValid(false);
          return;
        }

        setIsChecking(true);
        try {
          // For subassets, check parent asset ownership and status
          if (isSubasset && value.includes('.')) {
            const [parentName] = value.split('.');
            
            // Check if parent asset exists and get its details
            const parentAssetInfo = await fetchAssetDetails(parentName);
            if (!parentAssetInfo || !parentAssetInfo.asset) {
              setAvailabilityError("Parent asset does not exist");
              setIsValid(false);
              if (onValidationChange) {
                onValidationChange(false, "Parent asset does not exist");
              }
              return;
            }
            
            // Check if user owns the parent asset
            if (activeAddress && parentAssetInfo.issuer !== activeAddress.address) {
              setAvailabilityError("You don't own the parent asset");
              setIsValid(false);
              if (onValidationChange) {
                onValidationChange(false, "You don't own the parent asset");
              }
              return;
            }
            
            // Note: Locked parent assets CAN issue subassets, so we don't check for locked status
          }
          
          // Check if asset already exists
          const assetInfo = await fetchAssetDetails(value);
          // If we get asset info back, it exists
          if (assetInfo && assetInfo.asset) {
            setAvailabilityError("Asset name already taken");
            setIsValid(false);
            if (onValidationChange) {
              onValidationChange(false, "Asset name already taken");
            }
          } else {
            setAvailabilityError(undefined);
            setIsValid(true);
            if (onValidationChange) {
              onValidationChange(true);
            }
          }
        } catch (error) {
          // Expected behavior: fetchAssetDetails returns null and logs a 404 error
          // when the asset doesn't exist, which means the name is available.
          // The console error is expected and indicates the asset name can be used.
          setAvailabilityError(undefined);
          setIsValid(true);
          if (onValidationChange) {
            onValidationChange(true);
          }
        } finally {
          setIsChecking(false);
        }
      }, 500); // 500ms debounce

      // Cleanup function
      return () => {
        if (debounceTimeout.current) {
          clearTimeout(debounceTimeout.current);
        }
      };
    }, [value, isSubasset, onValidationChange, activeAddress]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let newValue = e.target.value;
      
      // If we have a frozen parent asset prefix, ensure it's preserved
      if (parentAsset && isSubasset) {
        const prefix = `${parentAsset}.`;
        if (!newValue.startsWith(prefix)) {
          // If they've deleted part of the prefix, restore it
          if (newValue.length < prefix.length) {
            newValue = prefix;
          } else {
            // They might be trying to type the parent name, skip it
            const withoutPrefix = newValue.replace(new RegExp(`^${parentAsset}\\.?`), '');
            newValue = prefix + withoutPrefix;
          }
        }
      }
      
      // Smart casing: uppercase parent asset, preserve case for subasset
      if (newValue.includes('.')) {
        const dotIndex = newValue.indexOf('.');
        const parentPart = newValue.substring(0, dotIndex).toUpperCase();
        const childPart = newValue.substring(dotIndex);
        newValue = parentPart + childPart;
      } else if (!isSubasset) {
        // No dot and not a subasset, uppercase everything (regular asset)
        newValue = newValue.toUpperCase();
      }
      
      onChange(newValue);
      
      // Immediate format validation
      if (onValidationChange) {
        const validation = validateAssetName(newValue, isSubasset);
        if (!validation.isValid) {
          onValidationChange(false, validation.error);
        }
      }
    };
    
    // Handle keyboard navigation when frozen parent is present
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (parentAsset && isSubasset) {
        const prefix = `${parentAsset}.`;
        const target = e.currentTarget;
        const selectionStart = target.selectionStart || 0;
        
        // Prevent backspace/delete from removing the prefix
        if ((e.key === 'Backspace' || e.key === 'Delete') && selectionStart <= prefix.length) {
          if (value === prefix) {
            e.preventDefault();
          } else if (selectionStart < prefix.length) {
            e.preventDefault();
            // Move cursor to after the dot
            target.setSelectionRange(prefix.length, prefix.length);
          }
        }
        
        // Prevent left arrow from going into the prefix
        if (e.key === 'ArrowLeft' && selectionStart <= prefix.length) {
          e.preventDefault();
          target.setSelectionRange(prefix.length, prefix.length);
        }
        
        // On Home key, go to start of editable part
        if (e.key === 'Home') {
          e.preventDefault();
          target.setSelectionRange(prefix.length, prefix.length);
        }
      }
    };

    // Validate the current value
    const validation = validateAssetName(value, isSubasset);
    const hasError = value && (!validation.isValid || !!availabilityError);
    const errorMessage = availabilityError || validation.error;
    const showGreenBorder = value && isValid && !hasError && !isChecking;

    // Determine placeholder based on context
    const defaultPlaceholder = isSubasset 
      ? (parentAsset ? `${parentAsset}.subasset` : "PARENT.subasset")
      : "Enter an asset name";

    // Determine help text - user-friendly messages
    let displayText = "";
    if (errorMessage) {
      displayText = errorMessage;
    } else if (!value) {
      displayText = isSubasset ? "Enter a subasset name" : "Enter an asset name";
    } else if (isChecking) {
      displayText = "Checking availability...";
    } else if (showGreenBorder) {
      displayText = "Asset name is available";
    } else if (helpText) {
      displayText = helpText;
    }

    return (
      <Field>
        <Label className="text-sm font-medium text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
        <div className="relative">
          <Input
            ref={(el: HTMLInputElement | null) => {
              inputRef.current = el;
              if (ref) {
                if (typeof ref === 'function') {
                  ref(el);
                } else {
                  ref.current = el;
                }
              }
            }}
            id={name}
            type="text"
            name={name}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            required={required}
            placeholder={placeholder || defaultPlaceholder}
            disabled={disabled}
            className={`mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 ${
              hasError 
                ? "border-red-500 focus:border-red-500 focus:ring-red-500" 
                : showGreenBorder 
                  ? "border-green-500 focus:border-green-500 focus:ring-green-500"
                  : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
            } ${className}`}
          />
          {isChecking && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <div className="animate-spin h-4 w-4 border-2 border-gray-500 border-t-transparent rounded-full"></div>
            </div>
          )}
        </div>
        {showHelpText && displayText && (
          <Description className={`mt-1 text-sm ${
            hasError ? 'text-red-600' : showGreenBorder ? 'text-green-600' : 'text-gray-500'
          }`}>
            {displayText}
          </Description>
        )}
      </Field>
    );
  }
);

AssetNameInput.displayName = "AssetNameInput";