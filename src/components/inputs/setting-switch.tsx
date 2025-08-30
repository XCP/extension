"use client";

import { Field, Label, Description, Switch } from "@headlessui/react";
import type { ReactElement } from "react";

/**
 * Props for the SettingSwitch component
 */
interface SettingSwitchProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  showHelpText?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Reusable settings switch component for toggling boolean settings
 * @param {SettingSwitchProps} props - Component props
 * @returns {ReactElement} Setting switch UI
 */
export function SettingSwitch({ 
  label,
  description,
  checked, 
  onChange, 
  showHelpText = false, 
  disabled = false,
  className = ""
}: SettingSwitchProps): ReactElement {
  return (
    <Field className={className}>
      <div className="flex items-center justify-between">
        <Label className="font-bold">{label}</Label>
        <Switch
          checked={checked}
          onChange={onChange}
          className={`${
            checked ? 'bg-blue-600' : 'bg-gray-200'
          } p-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer`}
          disabled={disabled}
        >
          <span
            className={`${
              checked ? 'translate-x-6' : 'translate-x-1'
            } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
          />
        </Switch>
      </div>
      {description && (
        <Description className={`mt-2 text-sm text-gray-500 ${showHelpText ? "" : "hidden"}`}>
          {description}
        </Description>
      )}
    </Field>
  );
}