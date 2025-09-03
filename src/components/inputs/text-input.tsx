import { Field, Label, Input, Description } from "@headlessui/react";

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  onValidationChange?: (isValid: boolean, error?: string) => void;
  disabled?: boolean;
  required?: boolean;
  showHelpText?: boolean;
  className?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  description?: string;
  helpText?: string;
  readOnly?: boolean;
  ariaLabel?: string;
  id?: string;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  type?: "text" | "email" | "url" | "tel";
}

/**
 * Basic text input component following standard patterns
 */
export function TextInput({
  value,
  onChange,
  onValidationChange,
  disabled = false,
  required = false,
  showHelpText = false,
  className = "",
  name,
  label,
  placeholder,
  description,
  helpText,
  readOnly = false,
  ariaLabel,
  id,
  maxLength,
  minLength,
  pattern,
  autoComplete,
  autoFocus = false,
  type = "text",
}: TextInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    
    // Validate if handler provided
    if (onValidationChange) {
      let isValid = true;
      let error: string | undefined;
      
      if (required && !newValue) {
        isValid = false;
        error = "This field is required";
      } else if (minLength && newValue.length < minLength) {
        isValid = false;
        error = `Must be at least ${minLength} characters`;
      } else if (maxLength && newValue.length > maxLength) {
        isValid = false;
        error = `Must be no more than ${maxLength} characters`;
      } else if (pattern && !new RegExp(pattern).test(newValue)) {
        isValid = false;
        error = "Invalid format";
      }
      
      onValidationChange(isValid, error);
    }
  };
  
  const finalDescription = description || helpText;
  
  return (
    <Field className={className}>
      {label && (
        <Label className="text-sm font-medium text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
      )}
      <Input
        type={type}
        id={id}
        name={name}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        maxLength={maxLength}
        minLength={minLength}
        pattern={pattern}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        aria-label={ariaLabel || label}
        className={`block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
          label ? "mt-1" : ""
        } ${disabled ? "bg-gray-100 cursor-not-allowed" : ""} ${
          readOnly ? "bg-gray-100" : ""
        }`}
      />
      {showHelpText && finalDescription && (
        <Description className="mt-2 text-sm text-gray-500">
          {finalDescription}
        </Description>
      )}
    </Field>
  );
}