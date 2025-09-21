import { useState, useEffect } from "react";
import { Field, Label, Input, Description } from "@headlessui/react";
import { FiPlus, FiMinus } from "react-icons/fi";
import { Button } from "@/components/button";

interface NumberInputProps {
  value: number | string;
  onChange: (value: number | string) => void;
  onValidationChange?: (isValid: boolean) => void;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  placeholder?: string;
  label?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  showHelpText?: boolean;
  description?: string;
  helpText?: string;
  showStepButtons?: boolean;
  format?: "integer" | "decimal";
  className?: string;
}

export function NumberInput({
  value,
  onChange,
  onValidationChange,
  min,
  max,
  step = 1,
  decimals = 0,
  placeholder = "0",
  label,
  name = "number",
  disabled = false,
  required = false,
  showHelpText = false,
  description,
  helpText,
  showStepButtons = false,
  format = "decimal",
  className = "",
}: NumberInputProps) {
  const [localValue, setLocalValue] = useState(value.toString());
  const [isValid, setIsValid] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Validate number
  const validateNumber = (val: string): boolean => {
    // Allow empty if not required
    if (!val && !required) {
      setError(null);
      return true;
    }

    // Check if empty but required
    if (!val && required) {
      setError("This field is required");
      return false;
    }

    // Check if it's a valid number
    const num = parseFloat(val);
    if (isNaN(num)) {
      setError("Please enter a valid number");
      return false;
    }

    // Check min/max bounds
    if (min !== undefined && num < min) {
      setError(`Minimum value is ${min}`);
      return false;
    }

    if (max !== undefined && num > max) {
      setError(`Maximum value is ${max}`);
      return false;
    }

    // Check integer format
    if (format === "integer" && !Number.isInteger(num)) {
      setError("Please enter a whole number");
      return false;
    }

    setError(null);
    return true;
  };

  // Sync with external value
  useEffect(() => {
    setLocalValue(value.toString());
  }, [value]);

  // Validate on change
  useEffect(() => {
    const valid = validateNumber(localValue);
    setIsValid(valid);
    onValidationChange?.(valid);
  }, [localValue]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    
    // Allow typing decimal point and negative sign
    if (newValue === "" || newValue === "-" || newValue === ".") {
      setLocalValue(newValue);
      return;
    }

    // For integer format, don't allow decimal points
    if (format === "integer" && newValue.includes(".")) {
      return;
    }

    setLocalValue(newValue);
    
    // Only update parent if it's a valid number
    const num = parseFloat(newValue);
    if (!isNaN(num)) {
      onChange(num);
    }
  };

  const handleBlur = () => {
    // Format the number on blur
    const num = parseFloat(localValue);
    if (!isNaN(num)) {
      let formatted: string;
      if (format === "integer") {
        formatted = Math.round(num).toString();
      } else if (decimals > 0) {
        formatted = num.toFixed(decimals);
      } else {
        formatted = num.toString();
      }
      setLocalValue(formatted);
      onChange(parseFloat(formatted));
    } else if (!localValue && !required) {
      // Allow empty if not required
      onChange("");
    }
  };

  const handleStep = (direction: "up" | "down") => {
    const current = parseFloat(localValue) || 0;
    const newValue = direction === "up" ? current + step : current - step;
    
    // Apply bounds
    let bounded = newValue;
    if (min !== undefined) bounded = Math.max(min, bounded);
    if (max !== undefined) bounded = Math.min(max, bounded);
    
    const formatted = decimals > 0 ? bounded.toFixed(decimals) : bounded.toString();
    setLocalValue(formatted);
    onChange(parseFloat(formatted));
  };

  return (
    <Field className={className}>
      {label && (
        <Label className="text-sm font-medium text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
      )}
      <div className="relative">
        <Input
          type="text"
          inputMode={format === "integer" ? "numeric" : "decimal"}
          name={name}
          value={localValue}
          onChange={handleInputChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          min={min}
          max={max}
          step={step}
          className={`block w-full p-2.5 rounded-md border bg-gray-50 focus:ring-2 ${
            !isValid 
              ? "border-red-500 focus:ring-red-500 focus:border-red-500" 
              : "border-gray-300 focus:ring-blue-500 focus:border-blue-500"
          } ${label ? "mt-1" : ""} ${
            showStepButtons ? "pr-20" : ""
          } ${disabled ? "bg-gray-100 cursor-not-allowed" : ""}`}
          aria-invalid={!isValid}
          aria-describedby={error ? `${name}-error` : undefined}
        />
        {showStepButtons && (
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
            <Button
              variant="input"
              onClick={() => handleStep("down")}
              disabled={disabled || (min !== undefined && parseFloat(localValue) <= min)}
              aria-label="Decrease value"
              className="px-2 py-1"
            >
              <FiMinus className="h-3 w-3" />
            </Button>
            <Button
              variant="input"
              onClick={() => handleStep("up")}
              disabled={disabled || (max !== undefined && parseFloat(localValue) >= max)}
              aria-label="Increase value"
              className="px-2 py-1"
            >
              <FiPlus className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
      {error && (
        <p className="mt-1 text-sm text-red-600" role="alert" id={`${name}-error`}>
          {error}
        </p>
      )}
      {showHelpText && (description || helpText) && !error && (
        <Description className="mt-2 text-sm text-gray-500">
          {description || helpText}
        </Description>
      )}
    </Field>
  );
}