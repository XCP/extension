import React, { useState, useRef, useEffect, Suspense } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { BalanceHeader } from "@/components/headers/balance-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { FairmintOptions } from "@/utils/blockchain/counterparty";

interface FairmintFormDataInternal {
  asset: string;
  quantity: string;
  sat_per_vbyte: number;
}

interface FairmintFormProps {
  onSubmit: (data: FairmintOptions) => void;
  initialFormData?: FairmintOptions;
  initialAsset?: string;
}

export function FairmintForm({ onSubmit, initialFormData, initialAsset = "" }: FairmintFormProps) {
  const { activeAddress } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText ?? false;
  const { error: assetError, data: assetDetails } = useAssetDetails(initialFormData?.asset || initialAsset);

  const [formData, setFormData] = useState<FairmintFormDataInternal>(() => {
    const isDivisible = assetDetails?.assetInfo?.divisible ?? true;
    return {
      asset: initialFormData?.asset || initialAsset,
      quantity: initialFormData?.quantity ? (isDivisible ? (initialFormData.quantity / 1e8).toFixed(8) : initialFormData.quantity.toString()) : "",
      sat_per_vbyte: initialFormData?.sat_per_vbyte || 1,
    };
  });
  const [localError, setLocalError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

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
    if (formData.sat_per_vbyte <= 0) {
      setLocalError("Fee rate must be greater than zero.");
      return;
    }
    setLocalError(null);

    const isDivisible = assetDetails?.assetInfo?.divisible ?? true;
    const quantityNum = Number(formData.quantity);

    const submissionData: FairmintOptions = {
      sourceAddress: activeAddress?.address || "",
      asset: formData.asset,
      quantity: isDivisible ? Math.round(quantityNum * 1e8) : Math.round(quantityNum),
      sat_per_vbyte: formData.sat_per_vbyte,
    };
    onSubmit(submissionData);
  };

  return (
    <div className="space-y-4">
      <Suspense fallback={null}>
        {assetError ? (
          <div className="text-red-500 mb-4">{assetError.message}</div>
        ) : assetDetails && formData.asset ? (
          <BalanceHeader
            balance={{
              asset: formData.asset,
              asset_info: assetDetails?.assetInfo || { 
                asset_longname: null,
                divisible: false,
                locked: false,
                description: '',
                issuer: '',
                supply: '0'
              },
              quantity_normalized: (assetDetails?.availableBalance || 0).toString()
            }}
            className="mb-4"
          />
        ) : null}
      </Suspense>
      {localError && <div className="text-red-500 mb-2">{localError}</div>}
      <div className="bg-white rounded-lg shadow-lg p-4">
        <form onSubmit={handleSubmit} className="space-y-6">
          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Asset <span className="text-red-500">*</span>
            </Label>
            <Input
              ref={inputRef}
              type="text"
              name="asset"
              value={formData.asset}
              onChange={(e) => setFormData({ ...formData, asset: e.target.value.trim() })}
              required
              placeholder="Enter asset name"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the asset you want to perform a fair mint for.
            </Description>
          </Field>
          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Quantity <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              name="quantity"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: e.target.value.trim() })}
              required
              placeholder={assetDetails?.assetInfo?.divisible ? "0.00000000" : "0"}
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the quantity to mint {assetDetails?.assetInfo?.divisible ? "(up to 8 decimal places)" : "(whole numbers only)"}.
            </Description>
          </Field>
          <FeeRateInput
            value={formData.sat_per_vbyte}
            onChange={(value) => setFormData({ ...formData, sat_per_vbyte: value })}
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
