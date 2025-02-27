import React, { useState, useRef, useEffect, Suspense } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { BalanceHeader } from "@/components/headers/balance-header";
import { AddressHeader } from "@/components/headers/address-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { AssetSelectInput } from "@/components/inputs/asset-select-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { formatAmount } from "@/utils/format";
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
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText ?? false;
  const [formData, setFormData] = useState<FairmintFormDataInternal>(() => {
    // Don't use BTC or XCP as the initial asset
    const initialAssetValue = initialFormData?.asset || initialAsset;
    const isSpecialAsset = initialAssetValue === "BTC" || initialAssetValue === "XCP";
    
    return {
      asset: isSpecialAsset ? "" : initialAssetValue,
      quantity: initialFormData?.quantity ? initialFormData.quantity.toString() : "",
      sat_per_vbyte: initialFormData?.sat_per_vbyte || 1,
    };
  });
  const { error: assetError, data: assetDetails } = useAssetDetails(formData.asset);
  const [pending, setPending] = useState(false);
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
    if (formData.asset === "BTC" || formData.asset === "XCP") {
      setLocalError("BTC and XCP cannot be used for fairmint operations. Please select a different asset.");
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
    setPending(true);

    const isDivisible = assetDetails?.assetInfo?.divisible ?? true;
    const quantityNum = Number(formData.quantity);

    const submissionData: FairmintOptions = {
      sourceAddress: activeAddress?.address || "",
      asset: formData.asset,
      quantity: isDivisible ? Math.round(quantityNum * 1e8) : Math.round(quantityNum),
      sat_per_vbyte: formData.sat_per_vbyte,
    };
    
    try {
      onSubmit(submissionData);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Show the active address information */}
      {activeAddress && (
        <AddressHeader 
          address={activeAddress.address} 
          walletName={activeWallet?.name}
          className="mb-4" 
        />
      )}

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
            className="mt-1 mb-5"
          />
        ) : null}
      </Suspense>

      {localError && <div className="text-red-500 mb-2">{localError}</div>}
      <div className="bg-white rounded-lg shadow-lg p-4">
        <form onSubmit={handleSubmit} className="space-y-6">
          <AssetSelectInput
            selectedAsset={formData.asset}
            onChange={(asset) => setFormData({ ...formData, asset })}
            label="Asset"
            required
            shouldShowHelpText={shouldShowHelpText}
            description="Select the asset for the fairmint operation. BTC and XCP cannot be fairminted."
          />

          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Quantity <span className="text-red-500">*</span>
            </Label>
            <Input
              ref={inputRef}
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

          <FeeRateInput showHelpText={shouldShowHelpText} disabled={pending} />
          
          <Button type="submit" color="blue" fullWidth>
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
