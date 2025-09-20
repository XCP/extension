import React, { ChangeEvent } from "react";
import { Field, Input, Label, Description } from "@headlessui/react";
import { Button } from "@/components/button";
import { useBlockHeight } from "@/hooks/useBlockHeight";

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
  label = "Block Height",
  name,
  description,
  disabled = false,
  placeholder = "Enter block height",
}: BlockHeightInputProps) {
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
    } catch (err: any) {
      // This should be handled by the hook, but just in case
      console.error("Failed to fetch current block height:", err);
      setError?.(err.message || "Failed to fetch current block height");
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
      <div className="mt-1 relative rounded-md">
        <Input
          type="text"
          name={name}
          id={name}
          value={value}
          onChange={handleInputChange}
          autoComplete="off"
          className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 pr-16 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          placeholder={placeholder}
          disabled={disabled}
        />
        <div className="absolute right-1 top-1/2 transform -translate-y-1/2">
          <Button
            variant="input"
            onClick={handleNowButtonClick}
            disabled={disabled || isLoading}
            aria-label="Use current block height"
            className="px-2 py-1 text-sm"
          >
            Now
          </Button>
        </div>
      </div>
      {showHelpText && (
        <Description id={`${name}-description`} className="mt-2 text-sm text-gray-500">
          {description || "Enter a block height or click 'Now' to use the current block height."}
        </Description>
      )}
    </Field>
  );
} 