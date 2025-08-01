"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Input } from "@headlessui/react";
import { AssetSelectInput } from "@/components/inputs/asset-select-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { Button } from "@/components/button";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { formatAmount } from "@/utils/format";
import { toBigNumber, toSatoshis } from "@/utils/numeric";
import { AssetHeader } from "@/components/headers/asset-header";
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

// Custom form action button component that uses useFormStatus
function FormActionButton() {
  const { pending } = useFormStatus();
  
  return (
    <Button
      type="submit"
      color="blue"
      fullWidth
      disabled={pending}
    >
      {pending ? "Submitting..." : "Continue"}
    </Button>
  );
}

export function DividendForm({ 
  formAction, 
  asset, 
  initialFormData, 
  shouldShowHelpText 
}: DividendFormProps): ReactElement {
  const amountRef = useRef<HTMLInputElement>(null);
  
  const { data: assetInfo, error: assetError } = useAssetDetails(asset);
  const [selectedDividendAsset, setSelectedDividendAsset] = useState<string>(
    initialFormData?.dividend_asset || "XCP"
  );
  const { data: dividendAssetInfo } = useAssetDetails(selectedDividendAsset);

  // Focus amount input on mount
  useEffect(() => {
    amountRef.current?.focus();
  }, []);

  // Create a server action wrapper that processes the form data
  const processedFormAction = async (formData: FormData) => {
    // Get the quantity_per_unit value
    const quantityPerUnitStr = formData.get('quantity_per_unit') as string;
    
    // Convert to the proper format based on divisibility
    if (quantityPerUnitStr && dividendAssetInfo?.assetInfo) {
      const cleanedValue = quantityPerUnitStr.replace(/,/g, '');
      
      if (dividendAssetInfo.assetInfo.divisible) {
        // For divisible assets, convert to satoshis (multiply by 10^8)
        const satoshiValue = toSatoshis(cleanedValue);
        formData.set('quantity_per_unit', satoshiValue);
      } else {
        // For non-divisible assets, round to integer
        const intValue = toBigNumber(cleanedValue).integerValue().toString();
        formData.set('quantity_per_unit', intValue);
      }
    }
    
    // Submit the processed form data
    formAction(formData);
  };

  // Handle dividend asset change
  const handleDividendAssetChange = (asset: string) => {
    setSelectedDividendAsset(asset);
  };

  if (assetError || !assetInfo?.assetInfo) {
    return (
      <div className="p-4 text-red-500">
        Unable to load asset details. Please ensure the asset exists and you have the necessary
        permissions.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AssetHeader
        assetInfo={{
          ...assetInfo.assetInfo,
          asset: asset,
          divisible: assetInfo.assetInfo.divisible ?? false,
          locked: assetInfo.assetInfo.locked ?? false
        }}
        className="mt-1 mb-5"
      />
      
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        <form action={processedFormAction} className="space-y-4">
          <input type="hidden" name="asset" value={asset} />
          <input type="hidden" name="dividend_asset" value={selectedDividendAsset} />
          
          <AssetSelectInput
            selectedAsset={selectedDividendAsset}
            onChange={handleDividendAssetChange}
            label="Dividend Asset"
            required
            shouldShowHelpText={shouldShowHelpText}
            description="The asset to pay dividends in (e.g., XCP)."
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
            />
            {shouldShowHelpText && (
              <Description className="mt-2 text-sm text-gray-500">
                Amount of dividend asset to be paid per unit of the source asset.
                {dividendAssetInfo?.assetInfo?.divisible && 
                  " This value will be converted to satoshis (multiplied by 10^8) when submitted."}
              </Description>
            )}
          </Field>

          <FeeRateInput showHelpText={shouldShowHelpText} />

          <FormActionButton />
        </form>
      </div>
    </div>
  );
}
