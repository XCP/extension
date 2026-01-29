import { forwardRef, useEffect, useState, useRef } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { FiRefreshCw } from "@/components/icons";
import { fetchAssetDetails } from "@/utils/blockchain/counterparty/api";
import { useWallet } from "@/contexts/wallet-context";
import { validateAssetName } from "@/utils/validation/asset";

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
  /** Show button to generate random numeric asset name (only for non-subassets) */
  showRandomNumeric?: boolean;
}

/**
 * Generate a random numeric asset name in the valid range.
 * Numeric assets are in format A{number} where number is between 26^12+1 and 256^8.
 * Based on Counterparty validation: lower_bound = 26**12 + 1, upper_bound = 256**8
 */
function generateRandomNumericAsset(): string {
  // Valid range: 26^12 + 1 to 256^8 (inclusive)
  const min = BigInt(26) ** BigInt(12) + BigInt(1); // 95,428,956,661,682,177
  const max = BigInt(256) ** BigInt(8); // 18,446,744,073,709,551,616

  // Generate random BigInt in range
  const range = max - min + BigInt(1); // +1 because upper bound is inclusive

  // Generate random bytes and convert to BigInt
  const randomBytes = new Uint8Array(8);
  crypto.getRandomValues(randomBytes);
  let randomValue = BigInt(0);
  for (let i = 0; i < 8; i++) {
    randomValue = (randomValue << BigInt(8)) | BigInt(randomBytes[i]);
  }

  // Scale to our range and add min
  const value = min + (randomValue % range);

  return `A${value.toString()}`;
}

// The component uses the validation from utils internally
// No need to re-export since consumers should use @/utils/validation directly

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
      showRandomNumeric = false,
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
      displayText = "Checking availability…";
    } else if (showGreenBorder) {
      displayText = "Asset name is available";
    } else if (helpText) {
      displayText = helpText;
    }

    const handleRandomNumeric = () => {
      const randomAsset = generateRandomNumericAsset();
      onChange(randomAsset);
    };

    return (
      <Field>
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium text-gray-700">
            {label} {required && <span className="text-red-500">*</span>}
          </Label>
          {showRandomNumeric && !isSubasset && (
            <button
              type="button"
              onClick={handleRandomNumeric}
              disabled={disabled}
              className="text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-400 cursor-pointer font-mono flex items-center gap-1"
            >
              <FiRefreshCw className="size-3" />
              A123
            </button>
          )}
        </div>
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
            className={`mt-1 block w-full p-2.5 rounded-md border bg-gray-50 focus:ring-2 ${
              hasError
                ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                : showGreenBorder
                  ? "border-green-500 focus:border-green-500 focus:ring-green-500"
                  : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
            } ${className}`}
          />
          {isChecking && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <div className="animate-spin size-4 border-2 border-gray-500 border-t-transparent rounded-full"></div>
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