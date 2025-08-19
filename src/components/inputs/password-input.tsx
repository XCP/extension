import React, { useState } from 'react';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { Field, Input } from '@headlessui/react';
import { Button } from '@/components/button';

interface PasswordInputProps {
  disabled?: boolean;
  name?: string;
  placeholder: string;
  value?: string;
  innerRef?: React.RefObject<HTMLInputElement | null>;
}

export function PasswordInput({
  disabled = false,
  name = "password",
  placeholder,
  value,
  innerRef,
  onChange, // Add onChange prop
  onKeyDown, // Add onKeyDown prop
}: PasswordInputProps & { 
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const [showPassword, setShowPassword] = useState(false);

  function handleTogglePassword() {
    setShowPassword((prev) => !prev);
  }

  return (
    <Field>
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
            w-full p-2 border rounded-md pr-10 bg-white
            ${disabled ? 'bg-gray-50 cursor-not-allowed' : ''}
            data-[focus]:ring-blue-500 data-[focus]:border-blue-500
          `}
        />
        <Button
          type="button"
          onClick={handleTogglePassword}
          variant="input"
          disabled={disabled}
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? (
            <FaEyeSlash aria-hidden="true" />
          ) : (
            <FaEye aria-hidden="true" />
          )}
        </Button>
      </div>
    </Field>
  );
}
