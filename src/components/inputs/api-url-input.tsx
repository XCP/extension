import { useState, useEffect } from 'react';
import { FiRotateCcw } from 'react-icons/fi';
import { Input } from '@headlessui/react';
import { validateCounterpartyApi } from '@/utils/validation/api';
import { DEFAULT_KEYCHAIN_SETTINGS } from '@/utils/storage/settingsStorage';

interface ApiUrlInputProps {
  value: string;
  onChange: (value: string) => void;
  onValidationSuccess: (url: string) => Promise<void>;
  disabled?: boolean;
  className?: string;
  showHelpText?: boolean;
}

export const ApiUrlInput = ({ 
  value, 
  onChange, 
  onValidationSuccess,
  disabled = false,
  className = '',
  showHelpText = true
}: ApiUrlInputProps) => {
  const [localValue, setLocalValue] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleValidation = async (url: string) => {
    setIsValidating(true);
    setError(null);
    setShowSuccess(false);

    const result = await validateCounterpartyApi(url);
    
    if (result.isValid) {
      await onValidationSuccess(url);
      setError(null);
      setShowSuccess(true);
      onChange(url);
      // Clear success message after 3 seconds
      setTimeout(() => setShowSuccess(false), 3000);
    } else {
      setError(result.error || "Failed to validate API");
      setShowSuccess(false);
    }
    
    setIsValidating(false);
  };

  const handleBlur = async () => {
    if (localValue.trim()) {
      await handleValidation(localValue);
    }
  };

  const handleReset = async () => {
    const defaultUrl = DEFAULT_KEYCHAIN_SETTINGS.counterpartyApiBase;
    setLocalValue(defaultUrl);
    await handleValidation(defaultUrl);
  };

  const isDefault = localValue === DEFAULT_KEYCHAIN_SETTINGS.counterpartyApiBase;

  // Determine border color based on state
  const getBorderClass = () => {
    if (!showHelpText) {
      if (error) return 'border-red-500 focus:border-red-500 focus:ring-red-500';
      if (showSuccess && !isValidating) return 'border-green-500 focus:border-green-500 focus:ring-green-500';
    }
    return 'border-gray-300 focus:border-blue-500 focus:ring-blue-500';
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex gap-2">
        <Input
          type="url"
          value={localValue}
          onChange={(e) => {
            setLocalValue(e.target.value);
            setShowSuccess(false);
            setError(null);
          }}
          onBlur={handleBlur}
          disabled={disabled || isValidating}
          placeholder="https://api.counterparty.io:4000"
          className={`flex-1 p-2.5 rounded-md border bg-gray-50 focus:ring-2 disabled:opacity-50 transition-colors ${getBorderClass()}`}
        />
        <button
          onClick={handleReset}
          disabled={disabled || isValidating || isDefault}
          className="p-2.5 rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Reset to default"
          aria-label="Reset API URL to default"
        >
          <FiRotateCcw className="w-5 h-5 text-gray-600" />
        </button>
      </div>
      
      {showHelpText && (
        <>
          {isValidating && (
            <p className="text-sm text-gray-500">Validating API endpoint...</p>
          )}
          {error && (
            <p className="text-sm text-red-500">❌ {error}</p>
          )}
          {showSuccess && !isValidating && (
            <p className="text-sm text-green-500">✓ API endpoint validated and saved successfully</p>
          )}
          {isDefault && !error && !isValidating && !showSuccess && (
            <p className="text-sm text-gray-500">Using default API endpoint</p>
          )}
        </>
      )}
    </div>
  );
};