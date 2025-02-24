import { Checkbox, Field, Label } from '@headlessui/react';

interface CheckboxInputProps {
  name: string;
  label: string;
  checked?: boolean;
  disabled?: boolean;
}

export function CheckboxInput({
  name,
  label,
  checked = false,
  disabled = false,
}: CheckboxInputProps) {
  return (
    <Field>
      <div className="flex items-center gap-3">
        <Checkbox
          checked={checked}
          name={name}
          disabled={disabled}
          className={`
            group relative flex size-4 items-center justify-center rounded 
            border bg-white transition-colors
            ${
              disabled
                ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
                : 'border-gray-300 cursor-pointer hover:border-gray-400'
            }
            ${checked && !disabled ? 'border-blue-600 bg-blue-600' : ''}
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
            data-[checked]:bg-blue-600 data-[checked]:border-blue-600
          `}
        >
          <svg
            className="size-3.5 stroke-white opacity-0 group-data-[checked]:opacity-100 transition-opacity"
            viewBox="0 0 14 14"
            fill="none"
          >
            <path
              d="M3 8L6 11L11 3.5"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Checkbox>
        <Label className={`text-xs ${disabled ? 'text-gray-500' : 'text-gray-700'}`}>
          {label}
        </Label>
      </div>
    </Field>
  );
}
