"use client";

import { Field, Label, Description, Switch } from "@headlessui/react";
import type { ReactElement } from "react";

/**
 * Props for the InscribeSwitch component
 */
interface InscribeSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  showHelpText?: boolean;
  disabled?: boolean;
}

/**
 * Inscribe switch component for enabling Taproot inscriptions
 * @param {InscribeSwitchProps} props - Component props
 * @returns {ReactElement} Inscribe switch UI
 */
export function InscribeSwitch({ 
  checked, 
  onChange, 
  showHelpText = false, 
  disabled = false 
}: InscribeSwitchProps): ReactElement {
  return (
    <Field>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <Label className="text-sm font-medium text-gray-700">
            Inscribe?
          </Label>
          <Description className={showHelpText ? "text-sm text-gray-500" : "hidden"}>
            Store message as a Taproot inscription (on-chain)
          </Description>
        </div>
        <Switch
          checked={checked}
          onChange={onChange}
          className={`${
            checked ? 'bg-blue-600' : 'bg-gray-200'
          } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
          disabled={disabled}
        >
          <span
            className={`${
              checked ? 'translate-x-6' : 'translate-x-1'
            } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
          />
        </Switch>
      </div>
    </Field>
  );
}