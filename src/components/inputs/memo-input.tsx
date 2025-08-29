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
  const [isValid, setIsValid] = useState(true);

  // Calculate byte length of the memo
  const getByteLength = (str: string): number => {
    return new TextEncoder().encode(str).length;
  };

  // Validate memo
  const validateMemo = (memoValue: string): boolean => {
    if (required && !memoValue.trim()) {
      return false;
    }

    const byteLength = getByteLength(memoValue);
    return byteLength <= MAX_MEMO_LENGTH;
  };

  // Handle memo change
  const handleMemoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMemo = e.target.value;
    setMemo(newMemo);
    
    const valid = validateMemo(newMemo);
    setIsValid(valid);
    
    onChange?.(newMemo);
    onValidationChange?.(valid);
  };

  // Sync with external value changes
  useEffect(() => {
    if (value !== memo) {
      setMemo(value);
      const valid = validateMemo(value);
      setIsValid(valid);
      onValidationChange?.(valid);
    }
  }, [value]);

  // Initial validation
  useEffect(() => {
    const valid = validateMemo(memo);
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
        name="memo"
        value={memo}
        onChange={handleMemoChange}
        placeholder="Optional memo"
        className={`mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 transition-colors ${
          !isValid 
            ? "border-red-500 focus:ring-red-500 focus:border-red-500" 
            : "border-gray-300 focus:ring-blue-500 focus:border-blue-500"
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