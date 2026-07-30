import type { InputHTMLAttributes } from 'react';
import { Field, Label, Input, Description } from '@headlessui/react';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label?: string;
  /** Help text, shown when `showHelpText` is set (and there is no error). */
  description?: string;
  showHelpText?: boolean;
  /** Validation error; when set, shows the message and error styling. */
  error?: string | null;
  /** Extra classes on the <input>. */
  inputClassName?: string;
  /** Classes on the field wrapper. */
  className?: string;
}

/**
 * TextField — the standardized labeled text/number input.
 *
 * Owns the label (+ required asterisk), the shared input shell, and the
 * help/error footer that the compose forms hand-roll a dozen times over with
 * drifting classes. Built on the same Headless UI Field/Label/Input/Description
 * as the rest of the input library: `invalid` drives aria-invalid, and the
 * <Description> is auto-wired to the input's aria-describedby. Spreads native
 * input props, so it works controlled or uncontrolled with FormData. Error
 * styling uses the `danger` semantic token.
 */
export function TextField({
  label,
  description,
  showHelpText = false,
  error,
  required,
  name,
  id,
  inputClassName = '',
  className = '',
  disabled,
  ...inputProps
}: TextFieldProps) {
  const hasError = Boolean(error);
  const showHelp = !hasError && showHelpText && Boolean(description);
  return (
    <Field className={className}>
      {label && (
        <Label className="text-sm font-medium text-gray-700">
          {label} {required && <span className="text-danger-500">*</span>}
        </Label>
      )}
      <Input
        id={id}
        name={name}
        required={required}
        disabled={disabled}
        invalid={hasError}
        className={`block w-full p-2.5 rounded-md border outline-none focus-visible:ring-2 ${
          hasError
            ? 'border-danger-500 focus:border-danger-500 focus-visible:ring-danger-500'
            : 'border-gray-300 focus:border-blue-500 focus-visible:ring-blue-500'
        } ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-gray-50'} ${label ? 'mt-1' : ''} ${inputClassName}`}
        {...inputProps}
      />
      {hasError ? (
        <Description id={name ? `${name}-error` : undefined} role="alert" className="text-sm text-danger-600 mt-1">
          {error}
        </Description>
      ) : showHelp ? (
        <Description className="text-sm text-gray-500 mt-1">{description}</Description>
      ) : null}
    </Field>
  );
}
