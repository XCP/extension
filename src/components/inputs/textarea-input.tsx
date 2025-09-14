import { useState, useEffect, useRef } from "react";
import { Field, Label, Textarea, Description } from "@headlessui/react";

interface TextAreaInputProps {
  value: string;
  onChange: (value: string) => void;
  onValidationChange?: (isValid: boolean) => void;
  placeholder?: string;
  label?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  showHelpText?: boolean;
  description?: string;
  helpText?: string; // Alternative to description
  maxLength?: number;
  minLength?: number;
  rows?: number;
  autoResize?: boolean;
  showCharCount?: boolean;
  className?: string;
  readOnly?: boolean;
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
}

export function TextAreaInput({
  value,
  onChange,
  onValidationChange,
  placeholder = "",
  label,
  name = "textarea",
  disabled = false,
  required = false,
  showHelpText = false,
  description,
  helpText,
  maxLength,
  minLength,
  rows = 3,
  autoResize = false,
  showCharCount = false,
  className = "",
  readOnly = false,
  onPaste,
}: TextAreaInputProps) {
  const [localValue, setLocalValue] = useState(value);
  const [isValid, setIsValid] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize functionality
  useEffect(() => {
    if (autoResize && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [localValue, autoResize]);

  // Sync with external value
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Validation
  const validate = (val: string): boolean => {
    const trimmed = val.trim();
    
    if (required && !trimmed) {
      setError("This field is required");
      return false;
    }

    if (minLength && trimmed.length < minLength) {
      setError(`Minimum ${minLength} characters required`);
      return false;
    }

    if (maxLength && val.length > maxLength) {
      setError(`Maximum ${maxLength} characters allowed`);
      return false;
    }

    setError(null);
    return true;
  };

  // Validate on change
  useEffect(() => {
    const valid = validate(localValue);
    setIsValid(valid);
    onValidationChange?.(valid);
  }, [localValue, required, minLength, maxLength]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    
    // Prevent typing beyond maxLength if set
    if (maxLength && newValue.length > maxLength) {
      return;
    }

    setLocalValue(newValue);
    onChange(newValue);
  };

  const getCharCountColor = () => {
    if (!maxLength) return "text-gray-500";
    const percentage = (localValue.length / maxLength) * 100;
    if (percentage >= 95) return "text-red-600";
    if (percentage >= 80) return "text-yellow-600";
    return "text-gray-500";
  };

  return (
    <Field>
      {label && (
        <Label className="text-sm font-medium text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
      )}
      <Textarea
        ref={textareaRef}
        name={name}
        value={localValue}
        onChange={handleChange}
        onPaste={onPaste}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        rows={autoResize ? undefined : rows}
        className={`block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 resize-none ${
          !isValid
            ? "border-red-500 focus:ring-red-500 focus:border-red-500"
            : "border-gray-300 focus:ring-blue-500 focus:border-blue-500"
        } ${label ? "mt-1" : ""} ${
          disabled ? "bg-gray-100 cursor-not-allowed" : ""
        } ${readOnly ? "bg-gray-100" : ""} ${autoResize ? "overflow-hidden" : ""} ${className}`}
        aria-invalid={!isValid}
        aria-describedby={error ? `${name}-error` : undefined}
        style={autoResize ? { minHeight: `${rows * 1.5}rem` } : undefined}
      />
      
      <div className="mt-1 flex justify-between items-center">
        <div>
          {error && (
            <p className="text-sm text-red-600" role="alert" id={`${name}-error`}>
              {error}
            </p>
          )}
          {!error && showHelpText && (description || helpText) && (
            <Description className="text-sm text-gray-500">
              {description || helpText}
            </Description>
          )}
        </div>
        
        {showCharCount && (
          <span className={`text-xs ${getCharCountColor()}`}>
            {localValue.length}{maxLength ? ` / ${maxLength}` : ""} characters{(description || helpText) && ` - ${description || helpText}`}
          </span>
        )}
      </div>
    </Field>
  );
}