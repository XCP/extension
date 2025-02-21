import React, { useState, useRef, useEffect, Suspense } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { BalanceHeader } from "@/components/headers/balance-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";

export interface FairmintFormData {
  asset: string;
  quantity: string;

}

interface FairmintFormProps {
  onSubmit: (data: FairmintFormData) => void;
  initialAsset?: string;
}

export function FairmintForm({ onSubmit, initialAsset = "" }: FairmintFormProps) {
  const [formData, setFormData] = useState<FairmintFormData>({
    asset: initialAsset,
    quantity: "",

  });
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText;

  const { isLoading, error, data } = useAssetDetails(formData.asset);
  const { assetInfo } = data || { assetInfo: null };

  const { activeAddress } = useWallet();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!formData.asset) {
      setLocalError("Please enter an asset name.");
      return;
    }
    if (!formData.quantity || Number(formData.quantity) <= 0) {
      setLocalError("Please enter a valid quantity greater than zero.");
      return;
    }
    if (formData.feeRateSatPerVByte <= 0) {
      setLocalError("Please enter a valid fee rate greater than zero.");
      return;
    }
    setLocalError(null);

    let convertedQuantity = formData.quantity;
    if (assetInfo && assetInfo.divisible) {
      const quantityNumber = Number(formData.quantity);
      convertedQuantity = Math.round(quantityNumber * 1e8).toString();
    }

    const updatedFormData: FairmintFormData = {
      asset: formData.asset,
      quantity: convertedQuantity,
      
    };

    onSubmit(updatedFormData);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-4">
      {formData.asset && (
        <div className="min-h-[80px]">
          <Suspense fallback={<div>Loading asset details...</div>}>
            {isLoading ? (
              <div className="animate-pulse h-12 bg-gray-200 rounded"></div>
            ) : error ? (
              <div className="text-red-500">{error.message}</div>
            ) : (
              <BalanceHeader
                balance={{
                  asset: formData.asset,
                  asset_info: assetInfo || undefined,
                  quantity_normalized: "",
                }}
                className="mb-4"
              />
            )}
          </Suspense>
        </div>
      )}
      {localError && <div className="text-red-500 mb-2">{localError}</div>}
      <form onSubmit={handleSubmit} className="space-y-6">
        <Field>
          <Label className="text-sm font-medium text-gray-700">
            Asset <span className="text-red-500">*</span>
          </Label>
          <div className="relative mt-1 mb-2">
            <Input
              ref={inputRef}
              type="text"
              name="asset"
              value={formData.asset}
              onChange={(e) => setFormData({ ...formData, asset: e.target.value.trim() })}
              required
              placeholder="Enter asset name"
              className="block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
            Enter the asset you want to perform a fair mint for.
          </Description>
        </Field>

        <Field>
          <Label className="text-sm font-medium text-gray-700">
            Quantity <span className="text-red-500">*</span>
          </Label>
          <div className="relative mt-1 mb-2">
            <Input
              type="text"
              name="quantity"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: e.target.value.trim() })}
              required
              placeholder="Enter quantity to mint"
              className="block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
            Enter the quantity to mint (in decimal; will be converted to satoshis if the asset is divisible).
          </Description>
        </Field>

        <FeeRateInput
          id="feeRateSatPerVByte"
          value={formData.feeRateSatPerVByte}
          onChange={(value: number) =>
            setFormData({ ...formData, feeRateSatPerVByte: value })
          }
          error={formData.feeRateSatPerVByte <= 0 ? "Fee rate must be greater than zero." : ""}
          showLabel={true}
          label="Fee Rate (sat/vB)"
          showHelpText={shouldShowHelpText}
          autoFetch={true}
        />

        <Button type="submit" color="blue" fullWidth>
          Continue
        </Button>
      </form>
    </div>
  );
}
