import React, { useEffect, useRef, FormEvent, useState } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { AssetHeader } from "@/components/headers/asset-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useAssetDetails } from "@/hooks/useAssetDetails";

export interface TransferOwnershipFormData {
  transfer_destination: string;

}

interface TransferOwnershipFormProps {
  onSubmit: (data: TransferOwnershipFormData) => void;
  shouldShowHelpText?: boolean;
  asset: string;
}

export function TransferOwnershipForm({
  onSubmit,
  shouldShowHelpText = true,
  asset,
}: TransferOwnershipFormProps) {
  const { data: assetDetails, isLoading, error } = useAssetDetails(asset);
  const [formData, setFormData] = useState<TransferOwnershipFormData>({
    transfer_destination: "",

  });

  const transferDestinationRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    transferDestinationRef.current?.focus();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.transfer_destination.trim() || formData.feeRateSatPerVByte <= 0) {
      return; // Validation handled by form fields and FeeRateInput
    }
    onSubmit(formData);
  };

  if (error || !assetDetails) {
    return <ErrorAlert message={error?.message || "Failed to load asset details"} />;
  }

  if (asset === "BTC") {
    return <ErrorAlert message="Cannot transfer ownership of BTC" />;
  }

  return (
    <div className="space-y-4">
      <AssetHeader assetInfo={assetDetails.assetInfo} className="mb-6" />

      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field>
            <Label htmlFor="transfer_destination" className="block text-sm font-medium text-gray-700">
              Transfer Destination<span className="text-red-500">*</span>
            </Label>
            <Input
              ref={transferDestinationRef}
              id="transfer_destination"
              name="transfer_destination"
              type="text"
              value={formData.transfer_destination}
              onChange={handleInputChange}
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
              required
            />
            {shouldShowHelpText && (
              <Description className="mt-2 text-sm text-gray-500">
                Enter the address to which you want to transfer ownership.
              </Description>
            )}
          </Field>

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
            disabled={!formData.transfer_destination.trim() || formData.feeRateSatPerVByte <= 0}
          >
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
