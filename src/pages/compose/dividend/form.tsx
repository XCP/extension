import React, { useState, useRef, useEffect, FormEvent } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { AssetSelectInput } from "@/components/inputs/asset-select-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { Button } from "@/components/button";
import { AssetHeader } from "@/components/headers/asset-header";
import { fetchAssetDetails } from "@/utils/blockchain/counterparty";

export interface DividendFormData {
  /** Amount of dividend asset to be paid per unit of the source asset */
  quantity_per_unit: string;
  /** The asset to pay dividends in (e.g. XCP) */
  dividend_asset: string;
  /** Fee rate in satoshis per virtual byte */
  feeRateSatPerVByte: number;
}

interface DividendFormProps {
  asset: string;
  onSubmit: (data: any) => void;
  shouldShowHelpText: boolean;
}

export function DividendForm({ asset, onSubmit, shouldShowHelpText }: DividendFormProps) {
  const [formData, setFormData] = useState<DividendFormData>({
    quantity_per_unit: "",
    dividend_asset: "XCP",
    feeRateSatPerVByte: 1,
  });
  const [assetInfo, setAssetInfo] = useState<any>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    amountRef.current?.focus();
  }, []);

  // Fetch asset details to display in the header
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

  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, quantity_per_unit: e.target.value }));
  };

  const handleFeeRateChange = (value: number) => {
    setFormData((prev) => ({ ...prev, feeRateSatPerVByte: value }));
  };

  const handleDividendAssetChange = (asset: string) => {
    setFormData((prev) => ({ ...prev, dividend_asset: asset }));
  };

  const handleSubmitInternal = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Basic validation
    if (!formData.quantity_per_unit || Number(formData.quantity_per_unit) <= 0) {
      setLocalError("Quantity per unit must be a positive number.");
      return;
    }
    if (!formData.dividend_asset.trim()) {
      setLocalError("Dividend asset is required.");
      return;
    }

    setLocalError(null);

    // Pass form data (and extra info) to the Composer's onSubmit handler
    onSubmit({
      ...formData,
      asset,
      extra: {
        assetInfo,
      },
    });
  };

  return (
    <div className="space-y-4">
      {asset && assetInfo && <AssetHeader assetInfo={assetInfo} className="mb-6" />}
      {localError && <div className="text-red-500">{localError}</div>}
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        <form onSubmit={handleSubmitInternal} className="space-y-4">
          {/* Dividend Asset Selector */}
          <AssetSelectInput
            selectedAsset={formData.dividend_asset}
            onChange={handleDividendAssetChange}
            label="Dividend Asset"
            required
            shouldShowHelpText={shouldShowHelpText}
            description="The asset to pay dividends in (e.g., XCP)."
          />

          {/* Quantity Per Unit */}
          <Field>
            <Label htmlFor="quantity_per_unit" className="block text-sm font-medium text-gray-700">
              Amount Per Unit<span className="text-red-500">*</span>
            </Label>
            <Input
              ref={amountRef}
              id="quantity_per_unit"
              type="number"
              value={formData.quantity_per_unit}
              onChange={handleQuantityChange}
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              required
              min="0"
              step="any"
            />
            {shouldShowHelpText && (
              <Description className="mt-2 text-sm text-gray-500">
                Amount of dividend asset to be paid per unit of the source asset.
              </Description>
            )}
          </Field>

          {/* Fee Rate Input */}
          <FeeRateInput
            value={formData.feeRateSatPerVByte}
            onChange={handleFeeRateChange}
            showHelpText={shouldShowHelpText}
          />

          <Button
            type="submit"
            color="blue"
            fullWidth
            disabled={
              !formData.quantity_per_unit ||
              Number(formData.quantity_per_unit) <= 0 ||
              !formData.dividend_asset ||
              formData.feeRateSatPerVByte <= 0
            }
          >
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
