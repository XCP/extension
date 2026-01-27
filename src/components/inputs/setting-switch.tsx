import { useState } from "react";
import { Field, Label, Description, Switch } from "@headlessui/react";
import { FiInfo } from "@/components/icons";
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
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <Field className={className}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Label className="font-bold">{label}</Label>
          {/* Show info icon when help text is hidden but description exists */}
          {description && !showHelpText && (
            <div className="relative inline-block">
              <button
                type="button"
                className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                onFocus={() => setShowTooltip(true)}
                onBlur={() => setShowTooltip(false)}
                aria-label={`Info: ${description}`}
              >
                <FiInfo className="size-3.5" aria-hidden="true" />
              </button>
              {showTooltip && (
                <div className="absolute left-0 bottom-full mb-2 z-50 w-48 p-2 text-xs text-gray-600 bg-white rounded-lg shadow-lg border border-gray-200">
                  {description}
                  <div className="absolute left-3 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white" />
                </div>
              )}
            </div>
          )}
        </div>
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
            } inline-block size-4 transform rounded-full bg-white transition-transform`}
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