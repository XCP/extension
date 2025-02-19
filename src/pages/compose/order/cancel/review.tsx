import React, { useState } from "react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { useComposer } from "@/contexts/composer-context";
import { formatAddress, formatAmount } from "@/utils/format";

interface ReviewCancelProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
}

export function ReviewCancel({ apiResponse, onSign, onBack }: ReviewCancelProps) {
  const [isSigning, setIsSigning] = useState(false);
  const { error, setError } = useComposer();
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
      <h3 className="text-lg font-bold">Review Cancel</h3>

      {error && <ErrorAlert message={error} onClose={() => setError(null)} />}

      <div className="space-y-4">
        {/* From Address */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">From:</span>
          <div className="text-gray-900 break-all bg-gray-50 p-2 rounded">
            {formatAddress(result.params.source, true)}
          </div>
        </div>

        {/* Offer Hash */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">Offer Hash:</span>
          <div className="text-gray-900 break-all bg-gray-50 p-2 rounded">
            {result.params.offer_hash}
          </div>
        </div>

        {/* Fee */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">Fee:</span>
          <div className="text-gray-900 bg-gray-50 p-2 rounded">
            {formatAmount({
              value: result.btc_fee / 1e8,
              minimumFractionDigits: 8,
              maximumFractionDigits: 8,
            })}{" "}
            BTC
          </div>
        </div>
      </div>

      {/* Raw Transaction (collapsible) */}
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
