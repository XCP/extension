"use client";

import { useState, useEffect } from "react";
import { Field, Label, Input, Description } from "@headlessui/react";
import type { ReactElement } from "react";

interface MemoInputProps {
  value?: string;
  onChange?: (value: string) => void;
  onValidationChange?: (isValid: boolean) => void;
  disabled?: boolean;
  showHelpText?: boolean;
  required?: boolean;
  className?: string;
}

const MAX_MEMO_LENGTH = 34; // Maximum bytes allowed for memo

/**
 * MemoInput component for entering transaction memos with validation.
 * Validates memo length in bytes (max 34 bytes as per Counterparty protocol).
 */
export function MemoInput({
  value = "",
  onChange,
  onValidationChange,
  disabled = false,
  showHelpText = false,
  required = false,
  className = "",
}: MemoInputProps): ReactElement {
  const [memo, setMemo] = useState(value);
  const [error, setError] = useState<string | null>(null);

  // Calculate byte length of the memo
  const getByteLength = (str: string): number => {
    return new TextEncoder().encode(str).length;
  };

  // Validate memo
  const validateMemo = (memoValue: string): string | null => {
    if (required && !memoValue.trim()) {
      return "Memo is required";
    }

    const byteLength = getByteLength(memoValue);
    if (byteLength > MAX_MEMO_LENGTH) {
      return `Memo too long (${byteLength}/${MAX_MEMO_LENGTH} bytes)`;
    }

    return null;
  };

  // Handle memo change
  const handleMemoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMemo = e.target.value;
    setMemo(newMemo);
    
    const validationError = validateMemo(newMemo);
    setError(validationError);
    
    onChange?.(newMemo);
    onValidationChange?.(validationError === null);
  };

  // Sync with external value changes
  useEffect(() => {
    if (value !== memo) {
      setMemo(value);
      const validationError = validateMemo(value);
      setError(validationError);
      onValidationChange?.(validationError === null);
    }
  }, [value]);

  // Initial validation
  useEffect(() => {
    const validationError = validateMemo(memo);
    setError(validationError);
    onValidationChange?.(validationError === null);
  }, []);

  const byteLength = getByteLength(memo);
  const isNearLimit = byteLength > MAX_MEMO_LENGTH * 0.8; // Warn when >80% of limit

  return (
    <Field className={className}>
      <Label className="text-sm font-medium text-gray-700">
        Memo {required && <span className="text-red-500">*</span>}
      </Label>
      <Input
        type="text"
        name="memo"
        value={memo}
        onChange={handleMemoChange}
        placeholder="Optional memo"
        className={`mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 transition-colors ${
          error 
            ? "border-red-500 focus:ring-red-500 focus:border-red-500" 
            : isNearLimit
            ? "border-yellow-500 focus:ring-yellow-500 focus:border-yellow-500"
            : "border-gray-300 focus:ring-blue-500 focus:border-blue-500"
        }`}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={error ? "memo-error" : showHelpText ? "memo-description" : undefined}
      />
      
      {/* Byte counter */}
      <div className="mt-1 flex justify-between items-center">
        <div className="text-xs">
          {error ? (
            <span id="memo-error" className="text-red-600">{error}</span>
          ) : (
            <span className={`${isNearLimit ? "text-yellow-600" : "text-gray-500"}`}>
              {byteLength}/{MAX_MEMO_LENGTH} bytes
            </span>
          )}
        </div>
      </div>
      
      {showHelpText && !error && (
        <Description id="memo-description" className="mt-2 text-sm text-gray-500">
          Optional memo to include with the transaction. Maximum {MAX_MEMO_LENGTH} bytes.
        </Description>
      )}
    </Field>
  );
}