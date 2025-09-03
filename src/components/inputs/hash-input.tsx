import { useState, useEffect } from "react";
import { Field, Label, Textarea, Description } from "@headlessui/react";
import { FiCopy, FiCheck } from "react-icons/fi";
import { Button } from "@/components/button";

interface HashInputProps {
  value: string;
  onChange: (value: string) => void;
  onValidationChange?: (isValid: boolean) => void;
  hashType?: "transaction" | "offer" | "match" | "generic";
  placeholder?: string;
  label?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  showHelpText?: boolean;
  description?: string;
  showCopyButton?: boolean;
  className?: string;
  rows?: number;
}

const HASH_PATTERNS = {
  transaction: /^[a-fA-F0-9]{64}$/,
  offer: /^[a-fA-F0-9]{64}$/,
  match: /^[a-fA-F0-9]{64}_[a-fA-F0-9]{64}$/,
  generic: /^[a-fA-F0-9]{64}$/,
};

const HASH_DESCRIPTIONS = {
  transaction: "Enter a 64-character transaction hash",
  offer: "Enter a 64-character offer hash",
  match: "Enter an order match ID (hash_hash format)",
  generic: "Enter a 64-character hexadecimal hash",
};

export function HashInput({
  value,
  onChange,
  onValidationChange,
  hashType = "generic",
  placeholder = "Enter hash...",
  label,
  name = "hash",
  disabled = false,
  required = false,
  showHelpText = false,
  description,
  showCopyButton = true,
  className = "",
  rows = 2,
}: HashInputProps) {
  const [localValue, setLocalValue] = useState(value);
  const [isValid, setIsValid] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Get the appropriate pattern and description
  const pattern = HASH_PATTERNS[hashType];
  const defaultDescription = description || HASH_DESCRIPTIONS[hashType];

  // Validate hash
  const validateHash = (val: string): boolean => {
    const trimmed = val.trim();
    
    // Allow empty if not required
    if (!trimmed && !required) {
      setError(null);
      return true;
    }

    // Check if empty but required
    if (!trimmed && required) {
      setError("This field is required");
      return false;
    }

    // Remove any whitespace for validation
    const cleaned = trimmed.replace(/\s/g, "");

    // Check pattern
    if (!pattern.test(cleaned)) {
      if (hashType === "match") {
        setError("Invalid format. Expected: hash_hash (two 64-character hashes separated by underscore)");
      } else {
        setError(`Invalid ${hashType} hash. Must be 64 hexadecimal characters`);
      }
      return false;
    }

    setError(null);
    return true;
  };

  // Sync with external value
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Validate on change
  useEffect(() => {
    const valid = validateHash(localValue);
    setIsValid(valid);
    onValidationChange?.(valid);
  }, [localValue, required, hashType]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    onChange(newValue);
    setCopied(false); // Reset copied state when value changes
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // Allow paste to work normally but clean the value
    setTimeout(() => {
      const pastedValue = e.currentTarget.value;
      const cleaned = pastedValue.trim().replace(/\s/g, "");
      if (cleaned !== pastedValue) {
        setLocalValue(cleaned);
        onChange(cleaned);
      }
    }, 0);
  };

  const handleCopy = async () => {
    if (!localValue) return;
    
    try {
      await navigator.clipboard.writeText(localValue.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <Field className={className}>
      {label && (
        <Label className="text-sm font-medium text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
      )}
      <div className="relative">
        <Textarea
          name={name}
          value={localValue}
          onChange={handleChange}
          onPaste={handlePaste}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          rows={rows}
          className={`block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 resize-none font-mono text-xs ${
            !isValid 
              ? "border-red-500 focus:ring-red-500 focus:border-red-500" 
              : "border-gray-300 focus:ring-blue-500 focus:border-blue-500"
          } ${label ? "mt-1" : ""} ${
            showCopyButton ? "pr-12" : ""
          } ${disabled ? "bg-gray-100 cursor-not-allowed" : ""}`}
          aria-invalid={!isValid}
          aria-describedby={error ? `${name}-error` : undefined}
          spellCheck={false}
        />
        {showCopyButton && localValue && (
          <Button
            variant="input"
            onClick={handleCopy}
            disabled={disabled || !isValid}
            aria-label={copied ? "Copied!" : "Copy hash"}
            className="absolute right-1 top-1 px-2 py-1"
          >
            {copied ? (
              <FiCheck className="h-4 w-4 text-green-600" />
            ) : (
              <FiCopy className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>
      {error && (
        <p className="mt-1 text-sm text-red-600" role="alert" id={`${name}-error`}>
          {error}
        </p>
      )}
      {!error && showHelpText && defaultDescription && (
        <Description className="mt-2 text-sm text-gray-500">
          {defaultDescription}
        </Description>
      )}
    </Field>
  );
}