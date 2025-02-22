import React, { useState, useRef, useEffect, FormEvent } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { AssetHeader } from "@/components/headers/asset-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { IssuanceOptions } from "@/utils/blockchain/counterparty";

interface TransferOwnershipFormDataInternal {
  transfer_destination: string;
  sat_per_vbyte: number;
}

interface TransferOwnershipFormProps {
  onSubmit: (data: IssuanceOptions) => void;
  initialFormData?: IssuanceOptions;
  asset: string;
}

export function TransferOwnershipForm({ onSubmit, initialFormData, asset }: TransferOwnershipFormProps) {
  const { activeAddress } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText ?? false;
  const { data: assetDetails, isLoading, error: assetError } = useAssetDetails(asset);

  const [formData, setFormData] = useState<TransferOwnershipFormDataInternal>(() => ({
    transfer_destination: initialFormData?.transfer_destination || "",
    sat_per_vbyte: initialFormData?.sat_per_vbyte || 1,
  }));
  const [localError, setLocalError] = useState<string | null>(null);

  const transferDestinationRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    transferDestinationRef.current?.focus();
  }, []);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.transfer_destination.trim()) {
      setLocalError("Transfer destination is required.");
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
      lock: false,
      reset: false,
      transfer_destination: formData.transfer_destination.trim(),
      sat_per_vbyte: formData.sat_per_vbyte,
    };
    onSubmit(submissionData);
  };

  if (isLoading) return <div className="p-4">Loading asset details...</div>;
  if (assetError || !assetDetails)
    return <div className="p-4 text-red-500">Error loading asset details: {assetError?.message}</div>;
  if (asset === "BTC") return <div className="p-4 text-red-500">Cannot transfer ownership of BTC</div>;

  return (
    <div className="space-y-4">
      <AssetHeader assetInfo={assetDetails?.assetInfo || { asset_longname: null }} className="mb-6" />
      {localError && <div className="text-red-500 mb-2">{localError}</div>}
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field>
            <Label htmlFor="transfer_destination" className="block text-sm font-medium text-gray-700">
              Transfer Destination <span className="text-red-500">*</span>
            </Label>
            <Input
              ref={transferDestinationRef}
              id="transfer_destination"
              name="transfer_destination"
              type="text"
              value={formData.transfer_destination}
              onChange={(e) => setFormData((prev) => ({ ...prev, transfer_destination: e.target.value }))}
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
              required
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the address to which you want to transfer ownership.
            </Description>
          </Field>
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
    </div>
  );
}
