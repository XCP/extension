import React, { useState, useRef, useEffect, FormEvent } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { AssetHeader } from "@/components/headers/asset-header";
import { AssetSelectInput } from "@/components/inputs/asset-select-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { DividendOptions, fetchAssetDetails } from "@/utils/blockchain/counterparty";

interface DividendFormDataInternal {
  quantity_per_unit: string;
  dividend_asset: string;
  sat_per_vbyte: number;
}

interface DividendFormProps {
  onSubmit: (data: DividendOptions) => void;
  initialFormData?: DividendOptions;
  asset: string;
}

export function DividendForm({ onSubmit, initialFormData, asset }: DividendFormProps) {
  const { activeAddress } = useWallet();
  const { settings } = useSettings();

  const shouldShowHelpText = settings?.showHelpText ?? false;

  const [formData, setFormData] = useState<DividendFormDataInternal>(() => ({
    quantity_per_unit: initialFormData?.quantity_per_unit ? (initialFormData.quantity_per_unit / 1e8).toFixed(8) : "",
    dividend_asset: initialFormData?.dividend_asset || "XCP",
    sat_per_vbyte: initialFormData?.sat_per_vbyte || 1,
  }));
  const [assetInfo, setAssetInfo] = useState<any>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    amountRef.current?.focus();
  }, []);

  useEffect(() => {
    async function fetchDetails() {
      if (!asset) {
        setLocalError("Asset is not specified.");
        return;
      }
      try {
        const details = await fetchAssetDetails(asset);
        setAssetInfo(details);
      } catch (err) {
        console.error("Failed to fetch asset details:", err);
        setLocalError("Failed to retrieve asset information.");
      }
    }
    fetchDetails();
  }, [asset]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.quantity_per_unit || Number(formData.quantity_per_unit) <= 0) {
      setLocalError("Quantity per unit must be a positive number.");
      return;
    }
    if (!formData.dividend_asset.trim()) {
      setLocalError("Dividend asset is required.");
      return;
    }
    if (formData.sat_per_vbyte <= 0) {
      setLocalError("Fee rate must be greater than zero.");
      return;
    }
    setLocalError(null);

    const submissionData: DividendOptions = {
      sourceAddress: activeAddress?.address || "",
      asset,
      dividend_asset: formData.dividend_asset,
      quantity_per_unit: Math.round(Number(formData.quantity_per_unit) * 1e8),
      sat_per_vbyte: formData.sat_per_vbyte,
    };
    onSubmit(submissionData);
  };

  return (
    <div className="space-y-4">
      {asset && assetInfo && <AssetHeader assetInfo={assetInfo} className="mb-6" />}
      {localError && <div className="text-red-500">{localError}</div>}
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <AssetSelectInput
            selectedAsset={formData.dividend_asset}
            onChange={(value) => setFormData((prev) => ({ ...prev, dividend_asset: value }))}
            label="Dividend Asset"
            required
            shouldShowHelpText={shouldShowHelpText}
            description="The asset to pay dividends in (e.g., XCP)."
          />
          <Field>
            <Label htmlFor="quantity_per_unit" className="block text-sm font-medium text-gray-700">
              Amount Per Unit <span className="text-red-500">*</span>
            </Label>
            <Input
              ref={amountRef}
              id="quantity_per_unit"
              type="text"
              value={formData.quantity_per_unit}
              onChange={(e) => setFormData((prev) => ({ ...prev, quantity_per_unit: e.target.value }))}
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              required
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Amount of dividend asset to be paid per unit of the source asset (up to 8 decimal places).
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
