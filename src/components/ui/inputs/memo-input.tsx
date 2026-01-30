import { useState, useEffect } from "react";
import { Field, Label, Input, Description } from "@headlessui/react";
import type { ReactElement } from "react";
import { validateMemo as validateMemoUtil } from "@/utils/validation/memo";

interface MemoInputProps {
  value?: string;
  onChange?: (value: string) => void;
  onValidationChange?: (isValid: boolean) => void;
  disabled?: boolean;
  showHelpText?: boolean;
  required?: boolean;
  className?: string;
  name?: string;
  maxBytes?: number;
}

/**
 * MemoInput component for entering transaction memos with validation.
 * Validates memo length in bytes (default 34 bytes as per Counterparty protocol).
 */
export function MemoInput({
  value = "",
  onChange,
  onValidationChange,
  disabled = false,
  showHelpText = false,
  required = false,
  className = "",
  name = "memo",
  maxBytes = 34,
}: MemoInputProps): ReactElement {
  const [memo, setMemo] = useState(value);
  const [isValid, setIsValid] = useState(true);

  // Validate memo using centralized validation
  const checkMemoValidity = (memoValue: string): boolean => {
    if (required && !memoValue.trim()) {
      return false;
    }
    const result = validateMemoUtil(memoValue, { maxBytes });
    return result.isValid;
  };

  // Handle memo change
  const handleMemoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMemo = e.target.value;
    setMemo(newMemo);

    const valid = checkMemoValidity(newMemo);
    setIsValid(valid);

    onChange?.(newMemo);
    onValidationChange?.(valid);
  };

  // Sync with external value changes
  useEffect(() => {
    if (value !== memo) {
      setMemo(value);
      const valid = checkMemoValidity(value);
      setIsValid(valid);
      onValidationChange?.(valid);
    }
  }, [value]);

  // Initial validation
  useEffect(() => {
    const valid = checkMemoValidity(memo);
    setIsValid(valid);
    onValidationChange?.(valid);
  }, []);

  return (
    <Field className={className}>
      <Label className="text-sm font-medium text-gray-700">
        Memo {required && <span className="text-red-500">*</span>}
      </Label>
      <Input
        type="text"
        name={name}
        value={memo}
        onChange={handleMemoChange}
        placeholder="Optional memo"
        className={`mt-1 block w-full p-2.5 rounded-md border bg-gray-50 outline-none focus-visible:ring-2 transition-colors ${
          !isValid
            ? "border-red-500 focus:border-red-500 focus-visible:ring-red-500"
            : "border-gray-300 focus:border-blue-500 focus-visible:ring-blue-500"
        }`}
        disabled={disabled}
        aria-invalid={!isValid}
        aria-describedby={showHelpText ? "memo-description" : undefined}
      />

      {showHelpText && (
        <Description id="memo-description" className="mt-2 text-sm text-gray-500">
          Optional memo to include.
        </Description>
      )}
    </Field>
  );
}