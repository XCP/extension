import { useState, useEffect, useRef, forwardRef } from "react";
import { Field, Label, Input, Description } from "@headlessui/react";
import { FaSearch, FiX } from "@/components/icons";
import { Button } from "@/components/button";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSearch?: (query: string) => void;
  placeholder?: string;
  label?: string;
  name?: string;
  disabled?: boolean;
  isLoading?: boolean;
  showClearButton?: boolean;
  showHelpText?: boolean;
  description?: string;
  debounceMs?: number;
  required?: boolean;
  className?: string;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>((
  {
    value,
    onChange,
    onSearch,
    placeholder = "Search...",
    label,
    name = "search",
    disabled = false,
    isLoading = false,
    showClearButton = true,
    showHelpText = false,
    description = "Start typing to search",
    debounceMs = 300,
    required = false,
    className = "",
  },
  ref
) => {
  const [localValue, setLocalValue] = useState(value);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Sync local value with prop value
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Debounced search effect
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    if (onSearch) {
      debounceTimer.current = setTimeout(() => {
        onSearch(localValue);
      }, debounceMs);
    }

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [localValue, onSearch, debounceMs]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    onChange(newValue);
  };

  const handleClear = () => {
    setLocalValue("");
    onChange("");
    if (onSearch) {
      onSearch("");
    }
  };

  return (
    <Field className={className}>
      {label && (
        <Label className="text-sm font-medium text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
      )}
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <FaSearch className="h-4 w-4 text-gray-400" aria-hidden="true" />
        </div>
        <Input
          ref={ref}
          type="text"
          name={name}
          value={localValue}
          onChange={handleInputChange}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={`block w-full pl-8 pr-8 p-2.5 rounded-md border border-gray-200 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
            label ? "mt-1" : ""
          } ${disabled ? "bg-gray-100 cursor-not-allowed" : ""}`}
          aria-label={label || "Search"}
        />
        {(isLoading || (showClearButton && localValue)) && (
          <div className="absolute right-1 top-1/2 -translate-y-1/2">
            {isLoading ? (
              <div className="mr-2">
                <div className="animate-spin h-4 w-4 border-2 border-gray-500 border-t-transparent rounded-full" />
              </div>
            ) : (
              showClearButton && localValue && (
                <Button
                  variant="input"
                  onClick={handleClear}
                  disabled={disabled}
                  aria-label="Clear search"
                  className="px-2 py-1"
                >
                  <FiX className="h-4 w-4" />
                </Button>
              )
            )}
          </div>
        )}
      </div>
      {showHelpText && description && (
        <Description className="mt-2 text-sm text-gray-500">
          {description}
        </Description>
      )}
    </Field>
  );
});

SearchInput.displayName = "SearchInput";