import React, { useState, FormEvent } from "react";
import { Button } from "@/components/button";
import { CheckboxInput } from "@/components/inputs/checkbox-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { IssuanceOptions } from "@/utils/blockchain/counterparty";
import { useLoading } from "@/contexts/loading-context";

interface LockSupplyFormDataInternal {
  isConfirmed: boolean;
  sat_per_vbyte: number;
}

interface LockSupplyFormProps {
  onSubmit: (data: IssuanceOptions) => void;
  initialFormData?: IssuanceOptions;
  asset: string;
}

export function LockSupplyForm({ onSubmit, initialFormData, asset }: LockSupplyFormProps) {
  const { activeAddress } = useWallet();
  const { settings } = useSettings();
  const { showLoading, hideLoading } = useLoading();
  const shouldShowHelpText = settings?.showHelpText ?? false;
  
  const { error: assetError, data: assetDetails } = useAssetDetails(asset, {
    onLoadStart: () => showLoading(`Loading ${asset} details...`),
    onLoadEnd: hideLoading
  });

  const [formData, setFormData] = useState<LockSupplyFormDataInternal>(() => ({
    isConfirmed: false,
    sat_per_vbyte: initialFormData?.sat_per_vbyte || 10,
  }));
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.isConfirmed) {
      setLocalError("Please confirm the lock action.");
      return;
    }
    if (formData.sat_per_vbyte <= 0) {
      setLocalError("Fee rate must be greater than zero.");
      return;
    }
    setLocalError(null);

    const submissionData: IssuanceOptions = {
      sourceAddress: activeAddress?.address || "",
      asset,
      quantity: 0,
      divisible: assetDetails?.assetInfo?.divisible ?? true,
      lock: true,
      reset: false,
      sat_per_vbyte: formData.sat_per_vbyte,
    };
    onSubmit(submissionData);
  };

  if (assetError || !assetDetails)
    return <div className="p-4 text-red-500">Error loading asset details: {assetError?.message}</div>;

  return (
    <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
      <div className="mb-4 p-3 bg-gray-50 rounded-md">
        <h3 className="text-sm font-medium text-gray-700">Asset Details</h3>
        <div className="mt-2 text-sm text-gray-600">
          <p>Current Supply: {assetDetails?.assetInfo?.supply || "0"}</p>
          <p>Divisible: {assetDetails?.assetInfo?.divisible ? "Yes" : "No"}</p>
          <p>Locked: {assetDetails?.assetInfo?.locked ? "Yes" : "No"}</p>
        </div>
      </div>
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
        <p className="text-sm text-yellow-700">
          Warning: Locking the token supply is an irreversible action. Once locked, you will not be able to create additional tokens.
        </p>
      </div>
      {localError && <div className="text-red-500 mb-2">{localError}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <CheckboxInput
          checked={formData.isConfirmed}
          onChange={(checked) => setFormData((prev) => ({ ...prev, isConfirmed: checked }))}
          label={`I understand that locking the supply of ${asset} is permanent and cannot be undone.`}
          aria-label="Confirm lock supply"
        />
        <FeeRateInput
          value={formData.sat_per_vbyte}
          onChange={(value) => setFormData((prev) => ({ ...prev, sat_per_vbyte: value }))}
          error={formData.sat_per_vbyte <= 0 ? "Fee rate must be greater than zero." : ""}
          showHelpText={shouldShowHelpText}
        />
        <Button type="submit" color="blue" fullWidth>
          Continue
        </Button>
      </form>
    </div>
  );
}
