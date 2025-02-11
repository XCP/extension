import React, { useState } from 'react';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { Field, Input, Label } from '@headlessui/react';
import { Button } from '@/components/button';

interface PasswordInputProps {
  checked?: boolean;
  className?: string;
  disabled?: boolean;
  error?: string;
  id: string;
  label?: string;
  ariaLabel: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder: string;
  showLabel?: boolean;
  value: string;
  variant?: 'default' | 'warning';
  ref?: React.Ref<HTMLInputElement>;
}

/**
 * A password input component with show/hide functionality,
 * using Headless UI's Field, Input, and Label components.
 */
export function PasswordInput({
  className = '',
  disabled = false,
  error,
  id,
  label,
  ariaLabel,
  onChange,
  onKeyDown,
  placeholder,
  showLabel = false,
  value,
  variant = 'default',
  ref,
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  function handleTogglePassword() {
    setShowPassword(prev => !prev);
  }

  return (
    <Field className={className}>
      <Label
        htmlFor={id}
        className={showLabel ? 'block mb-2 text-sm font-medium' : 'sr-only'}
      >
        {label || ariaLabel}
      </Label>

      <div className="relative">
        <Input
          id={id}
          ref={ref}
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          invalid={!!error}
          aria-label={ariaLabel}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`
            w-full p-2 border rounded-md pr-10 bg-white
            ${disabled ? 'bg-gray-50 cursor-not-allowed' : ''}
            ${
              variant === 'warning'
                ? 'data-[focus]:ring-red-500 data-[focus]:border-red-500 data-[invalid]:border-red-500 data-[invalid]:ring-red-500'
                : 'data-[focus]:ring-blue-500 data-[focus]:border-blue-500 data-[invalid]:border-red-500 data-[invalid]:ring-red-500'
            }
          `}
        />

        <Button
          type="button"
          onClick={handleTogglePassword}
          variant="input"
          disabled={disabled}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
        >
          {showPassword ? (
            <FaEyeSlash aria-hidden="true" />
          ) : (
            <FaEye aria-hidden="true" />
          )}
        </Button>
      </div>

      {error && (
        <p className="text-red-500 text-xs mt-2" role="alert" id={`${id}-error`}>
          {error}
        </p>
      )}
    </Field>
  );
}
