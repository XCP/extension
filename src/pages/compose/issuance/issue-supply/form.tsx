import React, { useState, useRef, useEffect, FormEvent } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { IssuanceOptions } from "@/utils/blockchain/counterparty";
import { useLoading } from "@/contexts/loading-context";

interface IssueSupplyFormDataInternal {
  quantity: string;
  sat_per_vbyte: number;
}

interface IssueSupplyFormProps {
  onSubmit: (data: IssuanceOptions) => void;
  initialFormData?: IssuanceOptions;
  asset: string;
}

export function IssueSupplyForm({ onSubmit, initialFormData, asset }: IssueSupplyFormProps) {
  const { activeAddress } = useWallet();
  const { settings } = useSettings();
  const { showLoading, hideLoading } = useLoading();
  const shouldShowHelpText = settings?.showHelpText ?? false;
  
  const { error: assetError, data: assetDetails } = useAssetDetails(asset, {
    onLoadStart: () => showLoading(`Loading ${asset} details...`),
    onLoadEnd: hideLoading
  });

  const [formData, setFormData] = useState<IssueSupplyFormDataInternal>(() => {
    const isDivisible = assetDetails?.assetInfo?.divisible ?? true;
    return {
      quantity: initialFormData?.quantity
        ? isDivisible
          ? (initialFormData.quantity / 1e8).toFixed(8)
          : initialFormData.quantity.toString()
        : "",
      sat_per_vbyte: initialFormData?.sat_per_vbyte || 1,
    };
  });
  const [localError, setLocalError] = useState<string | null>(null);

  const quantityInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    quantityInputRef.current?.focus();
  }, []);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.quantity || Number(formData.quantity) <= 0) {
      setLocalError("Quantity must be greater than zero.");
      return;
    }
    if (formData.sat_per_vbyte <= 0) {
      setLocalError("Fee rate must be greater than zero.");
      return;
    }
    setLocalError(null);

    const isDivisible = assetDetails?.assetInfo?.divisible ?? true;
    const quantityNum = Number(formData.quantity);

    const submissionData: IssuanceOptions = {
      sourceAddress: activeAddress?.address || "",
      asset,
      quantity: isDivisible ? Math.round(quantityNum * 1e8) : Math.round(quantityNum),
      divisible: isDivisible,
      lock: false,
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
        </div>
      </div>
      {localError && <div className="text-red-500 mb-2">{localError}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field>
          <Label htmlFor="quantity" className="block text-sm font-medium text-gray-700">
            Quantity <span className="text-red-500">*</span>
          </Label>
          <Input
            ref={quantityInputRef}
            id="quantity"
            name="quantity"
            type="text"
            value={formData.quantity}
            onChange={(e) => setFormData((prev) => ({ ...prev, quantity: e.target.value }))}
            className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
            required
            placeholder={assetDetails?.assetInfo?.divisible ? "0.00000000" : "0"}
          />
          <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
            {assetDetails?.assetInfo?.divisible
              ? "Enter the quantity to issue (up to 8 decimal places)."
              : "Enter a whole number quantity."}
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
  );
}
