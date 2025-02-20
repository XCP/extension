import React, { useState } from "react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { formatAddress } from "@/utils/format";

interface ReviewDetachProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
}

export function ReviewDetach({ apiResponse, onSign, onBack }: ReviewDetachProps) {
  const [isSigning, setIsSigning] = useState(false);
  const { result } = apiResponse;

  const handleSignClick = async () => {
    setIsSigning(true);
    try {
      await onSign();
    } finally {
      setIsSigning(false);
    }
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow-lg space-y-4">
      <h3 className="text-lg font-bold">Review Detach Transaction</h3>

      {result.error && <ErrorAlert message={result.error} onClose={() => {}} />}

      <div className="space-y-4">
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">From:</span>
          <div className="bg-gray-50 p-2 rounded break-all text-gray-900">
            {formatAddress(result.params.source, true)}
          </div>
        </div>
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">To:</span>
          <div className="bg-gray-50 p-2 rounded break-all text-gray-900">
            {formatAddress(result.params.destination, true)}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <details>
          <summary className="text-md font-semibold cursor-pointer text-gray-700 hover:text-gray-900">
            Raw Transaction
          </summary>
          <pre className="mt-2 overflow-auto text-sm bg-gray-50 p-3 rounded-md h-[175px] border border-gray-200">
            {JSON.stringify(apiResponse, null, 2)}
          </pre>
        </details>
      </div>

      <div className="flex space-x-4 mt-4">
        <Button onClick={onBack} color="gray">
          Back
        </Button>
        <Button onClick={handleSignClick} color="blue" disabled={isSigning}>
          {isSigning ? "Signing..." : "Sign & Broadcast"}
        </Button>
      </div>
    </div>
  );
}
