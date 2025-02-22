import React, { useState, useEffect, FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Field, Label, Description, Input, Textarea } from "@headlessui/react";
import { Button } from "@/components/button";
import { CheckboxInput } from "@/components/inputs/checkbox-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { IssuanceOptions } from "@/utils/blockchain/counterparty";

interface IssuanceFormDataInternal {
  asset: string;
  quantity: string;
  divisible: boolean;
  lock: boolean;
  description: string;
  sat_per_vbyte: number;
}

interface IssuanceFormProps {
  onSubmit: (data: IssuanceOptions) => void;
  initialFormData?: IssuanceOptions;
  initialParentAsset?: string;
}

export function IssuanceForm({ onSubmit, initialFormData, initialParentAsset }: IssuanceFormProps) {
  const { activeAddress } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText ?? false;
  const [searchParams] = useSearchParams();
  const parentAsset = searchParams.get("parent");

  const [formData, setFormData] = useState<IssuanceFormDataInternal>(() => ({
    asset: initialFormData?.asset || (initialParentAsset ? `${initialParentAsset}.` : ""),
    quantity: initialFormData?.quantity?.toString() || "",
    divisible: initialFormData?.divisible ?? true,
    lock: initialFormData?.lock || false,
    description: initialFormData?.description || "",
    sat_per_vbyte: initialFormData?.sat_per_vbyte || 1,
  }));
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    const assetInput = document.getElementById("asset");
    assetInput?.focus();
  }, []);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.asset.trim()) {
      setLocalError("Asset name is required.");
      return;
    }
    if (!formData.quantity || Number(formData.quantity) <= 0) {
      setLocalError("Quantity must be greater than zero.");
      return;
    }
    if (formData.sat_per_vbyte <= 0) {
      setLocalError("Fee rate must be greater than zero.");
      return;
    }
    setLocalError(null);

    const submissionData: IssuanceOptions = {
      sourceAddress: activeAddress?.address || "",
      asset: formData.asset,
      quantity: Math.round(Number(formData.quantity)),
      divisible: formData.divisible,
      lock: formData.lock,
      reset: false,
      description: formData.description,
      sat_per_vbyte: formData.sat_per_vbyte,
    };
    onSubmit(submissionData);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
      {localError && <div className="text-red-500 mb-2">{localError}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field>
          <Label htmlFor="asset" className="block text-sm font-medium text-gray-700">
            Asset Name <span className="text-red-500">*</span>
          </Label>
          <Input
            id="asset"
            name="asset"
            type="text"
            value={formData.asset}
            onChange={(e) => setFormData((prev) => ({ ...prev, asset: e.target.value }))}
            className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
            required
            placeholder={initialParentAsset ? `${initialParentAsset}.SUBASSET` : "Enter asset name"}
          />
          <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
            {initialParentAsset ? `Enter a subasset name after "${initialParentAsset}." to create a subasset` : "The name of the asset to issue."}
          </Description>
        </Field>
        <Field>
          <Label htmlFor="quantity" className="block text-sm font-medium text-gray-700">
            Amount <span className="text-red-500">*</span>
          </Label>
          <Input
            id="quantity"
            name="quantity"
            type="text"
            value={formData.quantity}
            onChange={(e) => setFormData((prev) => ({ ...prev, quantity: e.target.value }))}
            className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
            required
          />
          <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
            The quantity of the asset to issue {formData.divisible ? "(up to 8 decimal places)" : "(whole numbers only)"}.
          </Description>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <CheckboxInput
            checked={formData.divisible}
            onChange={(checked) => setFormData((prev) => ({ ...prev, divisible: checked }))}
            label="Divisible"
            aria-label="Toggle asset divisibility"
          />
          <CheckboxInput
            checked={formData.lock}
            onChange={(checked) => setFormData((prev) => ({ ...prev, lock: checked }))}
            label="Locked"
            aria-label="Toggle supply lock"
          />
        </div>
        <Field>
          <Label htmlFor="description" className="block text-sm font-medium text-gray-700">
            Description
          </Label>
          <Textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
            rows={2}
          />
          <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
            A textual description for the asset.
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
