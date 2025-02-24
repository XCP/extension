import React, { useState, useRef, useEffect, FormEvent } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { BalanceHeader } from "@/components/headers/balance-header";
import { AmountWithMaxInput } from "@/components/inputs/amount-with-max-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { DestroyOptions } from "@/utils/blockchain/counterparty";

interface DestroyFormDataInternal {
  asset: string;
  quantity: string;
  memo: string;
  sat_per_vbyte: number;
}

interface DestroyFormProps {
  onSubmit: (data: DestroyOptions) => void;
  initialFormData?: DestroyOptions;
  initialAsset: string;
}

export function DestroyForm({ onSubmit, initialFormData, initialAsset }: DestroyFormProps) {
  const { activeAddress } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText ?? false;
  const { error: assetError, data: assetDetails } = useAssetDetails(initialAsset);

  const [formData, setFormData] = useState<DestroyFormDataInternal>(() => {
    const isDivisible = assetDetails?.assetInfo?.divisible ?? true;
    return {
      asset: initialFormData?.asset || initialAsset,
      quantity: initialFormData?.quantity ? (isDivisible ? (initialFormData.quantity / 1e8).toFixed(8) : initialFormData.quantity.toString()) : "",
      memo: initialFormData?.tag || "",
      sat_per_vbyte: initialFormData?.sat_per_vbyte || 1,
    };
  });
  const [localError, setLocalError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.quantity || Number(formData.quantity) <= 0) {
      setLocalError("Amount must be greater than zero.");
      return;
    }
    if (!formData.memo.trim()) {
      setLocalError("Memo is required for destroy transactions.");
      return;
    }
    if (formData.sat_per_vbyte <= 0) {
      setLocalError("Fee rate must be greater than zero.");
      return;
    }
    setLocalError(null);

    const isDivisible = assetDetails?.assetInfo?.divisible ?? true;
    const quantityNum = Number(formData.quantity);

    const submissionData: DestroyOptions = {
      sourceAddress: activeAddress?.address || "",
      asset: formData.asset,
      quantity: isDivisible ? Math.round(quantityNum * 1e8) : Math.round(quantityNum),
      tag: formData.memo,
      sat_per_vbyte: formData.sat_per_vbyte,
    };
    onSubmit(submissionData);
  };

  if (assetError || !assetDetails) {
    return (
      <div className="p-4 text-red-500">
        Unable to load asset details. Please ensure the asset exists and you have the necessary permissions.
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
        className="mb-5"
      />
      {localError && <div className="text-red-500 mb-2">{localError}</div>}
      <div className="bg-white rounded-lg shadow-lg p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <AmountWithMaxInput
            asset={formData.asset}
            availableBalance={assetDetails.availableBalance}
            value={formData.quantity}
            onChange={(value) => setFormData((prev) => ({ ...prev, quantity: value }))}
            sat_per_vbyte={formData.sat_per_vbyte}
            setError={setLocalError}
            sourceAddress={activeAddress}
            maxAmount={assetDetails.availableBalance}
            shouldShowHelpText={shouldShowHelpText}
            label="Amount"
            name="quantity"
            description={assetDetails?.assetInfo?.divisible ? "Enter the amount to destroy (up to 8 decimal places)." : "Enter a whole number amount."}
          />
          <Field>
            <Label htmlFor="memo" className="block text-sm font-medium text-gray-700">
              Memo <span className="text-red-500">*</span>
            </Label>
            <Input
              id="memo"
              type="text"
              value={formData.memo}
              onChange={(e) => setFormData((prev) => ({ ...prev, memo: e.target.value }))}
              ref={textareaRef}
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 hover:border-gray-400"
              required
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              A memo is required for destroy transactions.
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
