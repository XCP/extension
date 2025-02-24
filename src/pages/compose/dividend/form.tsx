"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Input } from "@headlessui/react";
import { AssetSelectInput } from "@/components/inputs/asset-select-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { Button } from "@/components/button";
import { AssetHeader } from "@/components/headers/asset-header";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { formatAmount } from "@/utils/format";
import type { ReactElement } from "react";

export interface DividendFormData {
  quantity_per_unit: string;
  dividend_asset: string;
  sat_per_vbyte: number;
  asset?: string;
}

interface DividendFormProps {
  formAction: (formData: FormData) => void;
  asset: string;
  initialFormData: DividendFormData | null;
  shouldShowHelpText: boolean;
}

export function DividendForm({ 
  formAction, 
  asset, 
  initialFormData, 
  shouldShowHelpText 
}: DividendFormProps): ReactElement {
  const { pending } = useFormStatus();
  const amountRef = useRef<HTMLInputElement>(null);
  
  const { data: assetInfo, error: assetError } = useAssetDetails(asset);
  const { data: dividendAssetInfo } = useAssetDetails(
    initialFormData?.dividend_asset || "XCP"
  );

  // Focus amount input on mount
  useEffect(() => {
    amountRef.current?.focus();
  }, []);

  // Format amount based on dividend asset divisibility
  useEffect(() => {
    const input = document.querySelector("input[name='quantity_per_unit']") as HTMLInputElement;
    if (input && input.value && dividendAssetInfo?.assetInfo) {
      const numValue = Number(input.value);
      if (!isNaN(numValue)) {
        const formattedValue = dividendAssetInfo.assetInfo.divisible
          ? formatAmount({
              value: numValue,
              minimumFractionDigits: 8,
              maximumFractionDigits: 8,
            })
          : Math.round(numValue).toString();
        input.value = formattedValue;
      }
    }
  }, [dividendAssetInfo?.assetInfo?.divisible]);

  return (
    <div className="space-y-4">
      {asset && assetInfo && <AssetHeader assetInfo={assetInfo.assetInfo} className="mb-6" />}
      {assetError && <div className="text-red-500">Failed to fetch asset details.</div>}
      
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="asset" value={asset} />
          
          <AssetSelectInput
            selectedAsset={initialFormData?.dividend_asset || "XCP"}
            onChange={() => {}} // No-op since formAction handles submission
            label="Dividend Asset"
            required
            shouldShowHelpText={shouldShowHelpText}
            description="The asset to pay dividends in (e.g., XCP)."
            name="dividend_asset"
            disabled={pending}
          />

          <Field>
            <Label htmlFor="quantity_per_unit" className="block text-sm font-medium text-gray-700">
              Amount Per Unit<span className="text-red-500">*</span>
            </Label>
            <Input
              ref={amountRef}
              id="quantity_per_unit"
              name="quantity_per_unit"
              type="number"
              defaultValue={initialFormData?.quantity_per_unit || ""}
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              required
              min="0"
              step="any"
              disabled={pending}
            />
            {shouldShowHelpText && (
              <Description className="mt-2 text-sm text-gray-500">
                Amount of dividend asset to be paid per unit of the source asset.
              </Description>
            )}
          </Field>

          <FeeRateInput showHelpText={shouldShowHelpText} disabled={pending} />

          <Button
            type="submit"
            color="blue"
            fullWidth
            disabled={pending}
          >
            {pending ? "Submitting..." : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
