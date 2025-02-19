import React, { useState } from "react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { useComposer } from "@/contexts/composer-context";
import { formatAmount, formatAddress } from "@/utils/format";

interface ReviewDispenseProps {
  apiResponse: any;
  onSign: () => Promise<void>;
  onBack: () => void;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

export function ReviewDispense({
  apiResponse,
  onSign,
  onBack,
  error,
  setError,
}: ReviewDispenseProps) {
  const [isSigning, setIsSigning] = useState(false);
  const { result } = apiResponse;
  // Retrieve extra data saved during form submission
  const { formData } = useComposer();
  const extra = formData?.extra || {};
  const { totalAssets = [], totalBtcAmount = 0 } = extra;

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
      <h3 className="text-lg font-bold">Review Dispense</h3>

      {error && <ErrorAlert message={error} onClose={() => setError(null)} />}

      <div className="space-y-4">
        {/* From Address */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">From:</span>
          <div className="text-gray-900 break-all bg-gray-50 p-2 rounded">
            {formatAddress(result.params.source, true)}
          </div>
        </div>

        {/* Dispenser Address */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">Dispenser Address:</span>
          <div className="text-gray-900 break-all bg-gray-50 p-2 rounded">
            {result.params.dispenser}
          </div>
        </div>

        {/* Assets You Get */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">Assets You Get:</span>
          <div className="text-gray-900 bg-gray-50 p-2 rounded">
            <ul className="list-disc list-inside">
              {totalAssets.map((asset: any, index: number) => (
                <li key={index}>
                  {formatAmount({
                    value: Number(asset.quantity),
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 8,
                  })}{" "}
                  {asset.asset_info?.asset_longname ?? asset.asset}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Total BTC Amount */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">Total BTC Amount:</span>
          <div className="text-gray-900 bg-gray-50 p-2 rounded">
            {(Number(result.params.quantity) / 1e8).toFixed(8)} BTC
          </div>
        </div>

        {/* Fee */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">Fee:</span>
          <div className="text-gray-900 bg-gray-50 p-2 rounded">
            {(result.btc_fee / 1e8).toFixed(8)} BTC
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
