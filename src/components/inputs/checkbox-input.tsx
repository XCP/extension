import { Checkbox, Field, Label } from '@headlessui/react';
import { useEffect, useState, type ReactElement } from 'react';

interface CheckboxInputProps {
  name: string;
  label: string;
  disabled?: boolean;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  id?: string;
}

/**
 * CheckboxInput provides a styled checkbox with label and controlled/uncontrolled modes.
 *
 * @param props - The component props
 * @returns A ReactElement representing the checkbox input
 */
export function CheckboxInput({
  name,
  label,
  disabled = false,
  defaultChecked = false,
  checked,
  onChange,
  id,
}: CheckboxInputProps): ReactElement {
  const [isChecked, setIsChecked] = useState(defaultChecked);
  // Generate a unique ID if none is provided
  const checkboxId = id || `checkbox-${name}`;
  
  // If component is controlled (checked prop is provided), update internal state
  useEffect(() => {
    if (checked !== undefined) {
      setIsChecked(checked);
    }
  }, [checked]);

  const handleChange = (newChecked: boolean) => {
    // Only update internal state if not controlled
    if (checked === undefined) {
      setIsChecked(newChecked);
    }
    if (onChange) {
      onChange(newChecked);
    }
  };

  return (
    <Field>
      <div className="flex items-center gap-3">
        <Checkbox
          checked={isChecked}
          name={name}
          id={checkboxId}
          value="yes"
          disabled={disabled}
          onChange={handleChange}
          className={`
            group relative flex size-4 items-center justify-center rounded 
            border bg-white transition-colors
            ${
              disabled
                ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
                : 'border-gray-300 cursor-pointer hover:border-gray-400'
            }
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
            data-[checked]:border-blue-600 data-[checked]:bg-blue-600
          `}
        >
          <svg
            className="size-3.5 stroke-white opacity-0 group-data-[checked]:opacity-100 transition-opacity"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M3 8L6 11L11 3.5"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Checkbox>
        <Label htmlFor={checkboxId} className={`text-xs ${disabled ? 'text-gray-500 cursor-not-allowed' : 'text-gray-700 cursor-pointer'}`}>
          {label}
        </Label>
      </div>
    </Field>
  );
}
