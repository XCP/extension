import { useState, useEffect } from "react";
import { Field, Label, Input, RadioGroup, Radio, Description } from "@headlessui/react";
import { NumberInput } from "./number-input";

interface ExpirationInputProps {
  value: number;
  onChange: (value: number) => void;
  onValidationChange?: (isValid: boolean) => void;
  type?: "blocks" | "time" | "both";
  min?: number;
  max?: number;
  label?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  showHelpText?: boolean;
  description?: string;
  showSuggestions?: boolean;
  allowNever?: boolean;
  className?: string;
}

const BLOCK_SUGGESTIONS = [
  { label: "1 hour (~6 blocks)", value: 6 },
  { label: "1 day (~144 blocks)", value: 144 },
  { label: "1 week (~1008 blocks)", value: 1008 },
  { label: "1 month (~4320 blocks)", value: 4320 },
];

const TIME_SUGGESTIONS = [
  { label: "1 hour", value: 3600 },
  { label: "1 day", value: 86400 },
  { label: "1 week", value: 604800 },
  { label: "1 month", value: 2592000 },
];

export function ExpirationInput({
  value,
  onChange,
  onValidationChange,
  type = "blocks",
  min = 1,
  max = 8064, // Protocol maximum for orders
  label = "Expiration",
  name = "expiration",
  disabled = false,
  required = true,
  showHelpText = false,
  description,
  showSuggestions = true,
  allowNever = false,
  className = "",
}: ExpirationInputProps) {
  const [localValue, setLocalValue] = useState(value);
  const [isNever, setIsNever] = useState(value === 0 && allowNever);
  const [expiryType, setExpiryType] = useState<"blocks" | "time">(
    type === "both" ? "blocks" : type
  );

  // Sync with external value
  useEffect(() => {
    setLocalValue(value);
    setIsNever(value === 0 && allowNever);
  }, [value, allowNever]);

  const handleValueChange = (newValue: number | string) => {
    const numValue = typeof newValue === "string" ? parseFloat(newValue) || 0 : newValue;
    setLocalValue(numValue);
    onChange(numValue);
    setIsNever(false);
  };

  const handleNeverToggle = (checked: boolean) => {
    setIsNever(checked);
    if (checked) {
      setLocalValue(0);
      onChange(0);
    } else {
      const defaultValue = expiryType === "blocks" ? 144 : 86400;
      setLocalValue(defaultValue);
      onChange(defaultValue);
    }
  };

  const handleSuggestionClick = (suggestionValue: number) => {
    setLocalValue(suggestionValue);
    onChange(suggestionValue);
    setIsNever(false);
  };

  const getSuggestions = () => {
    return expiryType === "blocks" ? BLOCK_SUGGESTIONS : TIME_SUGGESTIONS;
  };

  const getDescription = () => {
    if (description) return description;
    if (expiryType === "blocks") {
      return `Enter expiration in blocks (${min}-${max}). Average block time is ~10 minutes.`;
    } else {
      return `Enter expiration time in seconds (${min}-${max}).`;
    }
  };

  const formatTimeDisplay = (seconds: number): string => {
    if (seconds < 3600) {
      return `${Math.floor(seconds / 60)} minutes`;
    } else if (seconds < 86400) {
      return `${Math.floor(seconds / 3600)} hours`;
    } else if (seconds < 604800) {
      return `${Math.floor(seconds / 86400)} days`;
    } else {
      return `${Math.floor(seconds / 604800)} weeks`;
    }
  };

  return (
    <Field className={className}>
      <Label className="text-sm font-medium text-gray-700">
        {label} {required && !allowNever && <span className="text-red-500">*</span>}
      </Label>

      {/* Type selector if both types are allowed */}
      {type === "both" && (
        <RadioGroup 
          value={expiryType} 
          onChange={setExpiryType}
          className="mt-2 flex gap-4"
          disabled={disabled || isNever}
        >
          <div className="flex items-center">
            <Radio value="blocks" className="mr-2">
              {({ checked }) => (
                <span className={`
                  inline-flex items-center justify-center w-4 h-4 rounded-full border
                  ${checked ? "border-blue-600 bg-blue-600" : "border-gray-300 bg-white"}
                `}>
                  {checked && <span className="w-2 h-2 rounded-full bg-white" />}
                </span>
              )}
            </Radio>
            <Label className="text-sm">Blocks</Label>
          </div>
          <div className="flex items-center">
            <Radio value="time" className="mr-2">
              {({ checked }) => (
                <span className={`
                  inline-flex items-center justify-center w-4 h-4 rounded-full border
                  ${checked ? "border-blue-600 bg-blue-600" : "border-gray-300 bg-white"}
                `}>
                  {checked && <span className="w-2 h-2 rounded-full bg-white" />}
                </span>
              )}
            </Radio>
            <Label className="text-sm">Time</Label>
          </div>
        </RadioGroup>
      )}

      {/* Never expires option */}
      {allowNever && (
        <div className="mt-2 flex items-center">
          <input
            type="checkbox"
            id={`${name}-never`}
            checked={isNever}
            onChange={(e) => handleNeverToggle(e.target.checked)}
            disabled={disabled}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label htmlFor={`${name}-never`} className="ml-2 text-sm text-gray-700">
            Never expires
          </label>
        </div>
      )}

      {/* Value input */}
      {!isNever && (
        <>
          <div className="mt-2">
            <NumberInput
              value={localValue}
              onChange={handleValueChange}
              onValidationChange={onValidationChange}
              min={min}
              max={max}
              step={expiryType === "blocks" ? 1 : 3600}
              format="integer"
              placeholder={expiryType === "blocks" ? "Enter blocks..." : "Enter seconds..."}
              disabled={disabled}
              required={required && !allowNever}
              showStepButtons={true}
            />
          </div>

          {/* Display formatted time if in time mode */}
          {expiryType === "time" && localValue > 0 && (
            <p className="mt-1 text-sm text-gray-600">
              ≈ {formatTimeDisplay(localValue)}
            </p>
          )}

          {/* Suggestions */}
          {showSuggestions && (
            <div className="mt-3">
              <p className="text-xs text-gray-500 mb-2">Quick select:</p>
              <div className="flex flex-wrap gap-2">
                {getSuggestions().map((suggestion) => (
                  <button
                    key={suggestion.value}
                    type="button"
                    onClick={() => handleSuggestionClick(suggestion.value)}
                    disabled={disabled}
                    className={`
                      px-3 py-1 text-xs rounded-full border
                      ${localValue === suggestion.value
                        ? "bg-blue-100 border-blue-500 text-blue-700"
                        : "bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100"
                      }
                      ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                    `}
                  >
                    {suggestion.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Help text */}
      {showHelpText && (
        <Description className="mt-2 text-sm text-gray-500">
          {isNever ? "This will never expire" : getDescription()}
        </Description>
      )}

      {/* Hidden input for form submission */}
      <input type="hidden" name={name} value={isNever ? 0 : localValue} />
    </Field>
  );
}