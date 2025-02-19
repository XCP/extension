import React, { useState } from "react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { useComposer } from "@/contexts/composer-context";
import { formatAddress, formatAmount } from "@/utils/format";

interface ReviewIssuanceTransferOwnershipProps {
  apiResponse: {
    result: {
      params: {
        source: string;
        transfer_destination: string;
        asset: string;
      };
      btc_fee: number;
    };
  };
  onSign: () => Promise<void>;
  onBack: () => void;
}

export function ReviewIssuanceTransferOwnership({
  apiResponse,
  onSign,
  onBack,
}: ReviewIssuanceTransferOwnershipProps) {
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
    <div
      role="region"
      aria-label="Transaction Review"
      className="p-4 bg-white rounded-lg shadow-lg space-y-4"
    >
      <h3 className="text-lg font-bold">Review Transfer</h3>

      {error && <ErrorAlert message={error} onClose={() => setError(null)} />}

      <div className="space-y-4">
        {/* From Address */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">From:</span>
          <div className="bg-gray-50 p-2 rounded text-gray-900 break-all">
            {formatAddress(result.params.source, true)}
          </div>
        </div>

        {/* Transfer Destination */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">To:</span>
          <div className="bg-gray-50 p-2 rounded text-gray-900 break-all">
            {result.params.transfer_destination}
          </div>
        </div>

        {/* Asset */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">Asset:</span>
          <div className="bg-gray-50 p-2 rounded text-gray-900">
            {result.params.asset}
          </div>
        </div>

        {/* Fee */}
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
