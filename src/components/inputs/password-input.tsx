import { useState } from 'react';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { Field, Input, Label, Description } from '@headlessui/react';
import { Button } from '@/components/button';

interface PasswordInputProps {
  disabled?: boolean;
  name?: string;
  placeholder?: string;
  value?: string;
  innerRef?: React.RefObject<HTMLInputElement | null>;
  label?: string;
  required?: boolean;
  showHelpText?: boolean;
  helpText?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export function PasswordInput({
  disabled = false,
  name = "password",
  placeholder = "Enter password",
  value,
  innerRef,
  label,
  required = false,
  showHelpText = false,
  helpText,
  onChange,
  onKeyDown,
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  function handleTogglePassword() {
    setShowPassword((prev) => !prev);
  }

  return (
    <Field>
      {label && (
        <Label className="text-sm font-medium text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
      )}
      <div className="relative">
        <Input
          ref={innerRef}
          name={name}
          type={showPassword ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          onChange={onChange} // Pass onChange handler
          onKeyDown={onKeyDown} // Pass onKeyDown handler
          className={`
            w-full p-2 border border-gray-300 rounded-md pr-10 bg-white
            ${label ? 'mt-1' : ''}
            ${disabled ? 'bg-gray-50 cursor-not-allowed' : ''}
            data-[focus]:ring-2 data-[focus]:ring-blue-500 data-[focus]:border-blue-500
          `}
        />
        <Button
          type="button"
          onClick={handleTogglePassword}
          variant="input"
          disabled={disabled}
          aria-label={showPassword ? "Hide password" : "Show password"}
          className={label ? "!top-[calc(50%+0.125rem)]" : ""}
        >
          {showPassword ? (
            <FaEyeSlash aria-hidden="true" />
          ) : (
            <FaEye aria-hidden="true" />
          )}
        </Button>
      </div>
      {showHelpText && helpText && (
        <Description className="mt-2 text-sm text-gray-500">
          {helpText}
        </Description>
      )}
    </Field>
  );
}
