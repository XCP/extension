import React, { type ReactElement, useState, useEffect } from "react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { formatAddress, formatAmount } from "@/utils/format";

/**
 * Props for the ReviewScreen component.
 */
interface ReviewScreenProps {
  apiResponse: any; // Consider typing this more strictly based on your API response shape
  onSign: () => void;
  onBack: () => void;
  customFields: {
    label: string;
    value: string | number;
    rightElement?: React.ReactNode;
  }[];
  error: string | null; // Managed by useActionState in Composer
  isSigning: boolean; // Passed from useActionState in Composer
}

/**
 * Displays a transaction review screen with details and actions.
 * @param {ReviewScreenProps} props - Component props
 * @returns {ReactElement} Review UI with transaction details
 */
export function ReviewScreen({
  apiResponse,
  onSign,
  onBack,
  customFields,
  error: errorProp,
  isSigning,
}: ReviewScreenProps): ReactElement {
  const { result } = apiResponse;
  
  // Local error state management (same pattern as form.tsx)
  const [error, setError] = useState<string | null>(null);
  
  // Sync error prop to local state
  useEffect(() => {
    if (errorProp) {
      setError(errorProp);
    }
  }, [errorProp]);

  const handleSignClick = () => {
    // Clear any existing error when attempting to sign again
    setError(null);
    onSign();
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow-lg space-y-4">
      <h3 className="text-lg font-bold">Review Transaction</h3>
      {error && (
        <ErrorAlert 
          message={error}
          onClose={() => setError(null)}
        />
      )}
      <div className="space-y-4">
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">From:</span>
          <div className="bg-gray-50 p-2 rounded break-all text-gray-900">
            {formatAddress(result.params.source, true)}
          </div>
        </div>
        {result.params.destination && (
          <div className="space-y-1">
            <span className="font-semibold text-gray-700">To:</span>
            <div className="bg-gray-50 p-2 rounded break-all text-gray-900">
              {result.params.destination}
            </div>
          </div>
        )}
        {customFields.map((field, idx) => (
          <div key={idx} className="space-y-1">
            <span className="font-semibold text-gray-700">{field.label}:</span>
            <div className="bg-gray-50 p-2 rounded break-all text-gray-900">
              {typeof field.value === 'string' || typeof field.value === 'number' ? (
                <div className="flex justify-between items-center">
                  <span className="break-all">{field.value}</span>
                  {field.rightElement}
                </div>
              ) : (
                field.value
              )}
            </div>
          </div>
        ))}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">Fee:</span>
          <div className="bg-gray-50 p-2 rounded text-gray-900">
            {formatAmount({
              value: result.btc_fee / 1e8,
              minimumFractionDigits: 8,
              maximumFractionDigits: 8,
            })}{" "}
            BTC
          </div>
        </div>
      </div>
      <div className="mt-4">
        <details>
          <summary className="text-md font-semibold cursor-pointer text-gray-700 hover:text-gray-900">
            Raw Transaction
          </summary>
          <pre className="mt-2 overflow-y-auto overflow-x-auto text-sm bg-gray-50 p-3 rounded-md h-44 border border-gray-200">
            {JSON.stringify(apiResponse, null, 2)}
          </pre>
        </details>
      </div>
      <div className="flex space-x-4">
        <Button onClick={onBack} color="gray">
          Back
        </Button>
        <Button onClick={handleSignClick} color="blue" fullWidth disabled={isSigning}>
          {isSigning ? "Signing..." : "Sign & Broadcast"}
        </Button>
      </div>
    </div>
  );
}
