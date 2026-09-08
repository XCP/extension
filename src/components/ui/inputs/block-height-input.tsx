import { Description, Field, Input, Label } from "@headlessui/react";
import React, { type ChangeEvent, type ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { useBlockHeight } from "@/hooks/useBlockHeight";

import { t } from '@/i18n';

interface BlockHeightInputProps {
  value: string;
  onChange: (value: string) => void;
  setError?: (message: string | null) => void;
  showHelpText?: boolean;
  label?: string;
  name: string;
  description?: string;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * A custom input component for block height values with a "Now" button
 * that fetches the current block height from the blockchain.
 */
export function BlockHeightInput({
  value,
  onChange,
  setError,
  showHelpText = false,
  label = t('inputs_block_height_input_block_height'),
  name,
  description,
  disabled = false,
  placeholder = t('inputs_block_height_input_enter_block_height'),
}: BlockHeightInputProps): ReactElement {
  // Use our custom hook with autoFetch set to false
  const { isLoading, error, refresh } = useBlockHeight({ autoFetch: false });
  
  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    setError?.(null);
  };
  
  const handleNowButtonClick = async () => {
    if (disabled || isLoading) return;
    
    try {
      // Clear any previous errors
      setError?.(null);
      
      // Fetch the current block height using our hook's refresh function
      const currentHeight = await refresh();
      
      // If we got a block height, update the input value
      if (currentHeight !== null && currentHeight !== undefined) {
        onChange(currentHeight.toString());
      }
    } catch (err: unknown) {
      // This should be handled by the hook, but just in case
      console.error("Failed to fetch current block height:", err);
      // Use generic error to prevent leaking internal details
      setError?.(t('inputs_block_height_input_failed_to_fetch_current_block'));
    }
  };

  // If the hook has an error, propagate it to the parent component
  React.useEffect(() => {
    if (error) {
      setError?.(error);
    }
  }, [error, setError]);

  return (
    <Field>
      <Label htmlFor={name} className="text-sm font-medium text-gray-700">
        {label}
      </Label>
      <div className="mt-1 relative z-0 rounded-md">
        <Input
          type="text"
          name={name}
          id={name}
          value={value}
          onChange={handleInputChange}
          autoComplete="off"
          className="mt-1 block w-full p-2.5 rounded-md border border-gray-300 bg-gray-50 pr-16 outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          placeholder={placeholder}
          disabled={disabled}
        />
        <div className="absolute right-1 top-1/2 transform -translate-y-1/2">
          <Button
            variant="input"
            onClick={handleNowButtonClick}
            disabled={disabled || isLoading}
            aria-label={t('inputs_block_height_input_use_current_block_height')}
            className="px-2 py-1 text-sm"
          >
            {t('inputs_block_height_input_now')}
          </Button>
        </div>
      </div>
      {showHelpText && (
        <Description id={`${name}-description`} className="mt-2 text-sm text-gray-500">
          {description || t('inputs_block_height_input_enter_a_block_height_or')}
        </Description>
      )}
    </Field>
  );
} 