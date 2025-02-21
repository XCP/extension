import React, { useState } from "react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { CheckboxInput } from "@/components/inputs/checkbox-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useAssetDetails } from "@/hooks/useAssetDetails";

export interface LockSupplyFormData {
  isConfirmed: boolean;

}

interface LockSupplyFormProps {
  onSubmit: (data: LockSupplyFormData) => void;
  shouldShowHelpText?: boolean;
  asset: string;
}

export const LockSupplyForm = ({
  onSubmit,
  shouldShowHelpText = true,
  asset,
}: LockSupplyFormProps) => {
  const { data: assetDetails, isLoading, error } = useAssetDetails(asset);
  const [formData, setFormData] = useState<LockSupplyFormData>({
    isConfirmed: false,
    feeRateSatPerVByte: 10, // Updated default to 10 sat/vB
  });

  const handleConfirmationChange = (checked: boolean) => {
    setFormData((prev) => ({ ...prev, isConfirmed: checked }));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.isConfirmed || formData.feeRateSatPerVByte <= 0) {
      return; // Validation handled by form fields and FeeRateInput
    }
    onSubmit(formData);
  };

  if (error || !assetDetails) {
    return <ErrorAlert message={error?.message || "Failed to load asset details"} />;
  }

  const { assetInfo } = assetDetails;

  return (
    <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
      <div className="mb-4 p-3 bg-gray-50 rounded-md">
        <h3 className="text-sm font-medium text-gray-700">Asset Details</h3>
        <div className="mt-2 text-sm text-gray-600">
          <p>Current Supply: {assetInfo?.supply || "0"}</p>
          <p>Divisible: {assetInfo.divisible ? "Yes" : "No"}</p>
          <p>Locked: {assetInfo.locked ? "Yes" : "No"}</p>
        </div>
      </div>

      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
        <p className="text-sm text-yellow-700">
          Warning: Locking the token supply is an irreversible action. Once locked, you will not be
          able to create additional tokens.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <CheckboxInput
          checked={formData.isConfirmed}
          onChange={handleConfirmationChange}
          label={`I understand that locking the supply of ${asset} is permanent and cannot be undone.`}
          aria-label="Confirm lock supply"
        />

        <FeeRateInput
          value={formData.feeRateSatPerVByte}
          onChange={(value) => setFormData((prev) => ({ ...prev, feeRateSatPerVByte: value }))}
          error={formData.feeRateSatPerVByte <= 0 ? "Fee rate must be greater than zero." : ""}
          showHelpText={shouldShowHelpText}
        />

        <Button
          type="submit"
          color="blue"
          fullWidth
          disabled={!formData.isConfirmed || formData.feeRateSatPerVByte <= 0}
        >
          Continue
        </Button>
      </form>
    </div>
  );
};
