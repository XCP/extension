import { Description, Field, Input, Label } from "@headlessui/react";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { hasHexPrefix, isHexMemo, validateMemoLength, validateMemo as validateMemoUtil } from "@/core/validation/memo";

import { t } from '@/i18n';

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
  /**
   * Whether a 0x/0X prefix sends the memo as hex bytes. True for send and sweep memos. A destroy
   * tag is always sent as text, so its value is counted and described as text.
   */
  hexMemos?: boolean;
}

/**
 * MemoInput component for entering transaction memos with validation.
 * Validates memo length in bytes (default 34 bytes as per Counterparty protocol).
 * A memo is hex only when written with a 0x/0X prefix; anything else is text.
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
  hexMemos = true,
}: MemoInputProps): ReactElement {
  const [memo, setMemo] = useState(value);
  const [isValid, setIsValid] = useState(true);

  // Validate memo using centralized validation
  const checkMemoValidity = (memoValue: string): boolean => {
    if (required && !memoValue.trim()) {
      return false;
    }
    if (!hexMemos) return validateMemoLength(memoValue, false, maxBytes);
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

  // Sync with external value changes. `memo` is deliberately not a dep — listing it would re-run
  // this on every keystroke and setMemo(value) would discard what the user just typed.
  useEffect(() => {
    if (value !== memo) {
      setMemo(value);
      const valid = checkMemoValidity(value);
      setIsValid(valid);
      onValidationChange?.(valid);
    }
  }, [value]);

  // Initial validation, mount only. Later changes report through handleMemoChange and the sync
  // effect above.
  useEffect(() => {
    const valid = checkMemoValidity(memo);
    setIsValid(valid);
    onValidationChange?.(valid);
  }, []);

  // Only shown for a 0x memo: the one input that changes how the memo is encoded.
  const hexNote = hexMemos && hasHexPrefix(memo)
    ? (isHexMemo(memo) ? t('inputs_memo_input_sent_as_hex') : t('safety_memo_hex_invalid'))
    : null;
  const describedBy = [showHelpText && "memo-description", hexNote && "memo-hex-note"].filter(Boolean).join(" ");

  return (
    <Field className={className}>
      <Label className="text-sm font-medium text-gray-700">
        {t('common_memo')} {required && <span className="text-red-500">*</span>}
      </Label>
      <Input
        type="text"
        name={name}
        value={memo}
        onChange={handleMemoChange}
        placeholder={t('inputs_memo_input_optional_memo')}
        className={`mt-1 block w-full p-2.5 rounded-md border bg-gray-50 outline-none focus-visible:ring-2 transition-colors ${
          !isValid
            ? "border-red-500 focus:border-red-500 focus-visible:ring-red-500"
            : "border-gray-300 focus:border-blue-500 focus-visible:ring-blue-500"
        }`}
        disabled={disabled}
        aria-invalid={!isValid}
        aria-describedby={describedBy || undefined}
      />

      {hexNote && (
        <p id="memo-hex-note" className={`mt-1 text-xs ${isValid ? "text-gray-500" : "text-red-600"}`}>
          {hexNote}
        </p>
      )}

      {showHelpText && (
        <Description id="memo-description" className="mt-2 text-sm text-gray-500">
          {t('inputs_memo_input_optional_memo_to_include')}
          {hexMemos && <> {t('inputs_memo_input_hex_help')}</>}
        </Description>
      )}
    </Field>
  );
}
