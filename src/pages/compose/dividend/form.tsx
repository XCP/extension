"use client";

import { useEffect, useRef, useState } from "react";
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
  const formRef = useRef<HTMLFormElement>(null);
  
  const { data: assetInfo, error: assetError } = useAssetDetails(asset);
  const [selectedDividendAsset, setSelectedDividendAsset] = useState<string>(
    initialFormData?.dividend_asset || "XCP"
  );
  const { data: dividendAssetInfo } = useAssetDetails(selectedDividendAsset);

  // Focus amount input on mount
  useEffect(() => {
    amountRef.current?.focus();
  }, []);

  // Handle form submission
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (formRef.current) {
      const formData = new FormData(formRef.current);
      
      // Get the quantity_per_unit value
      const quantityPerUnitStr = formData.get('quantity_per_unit') as string;
      
      // Convert to the proper format based on divisibility
      if (quantityPerUnitStr && dividendAssetInfo?.assetInfo) {
        const numValue = parseFloat(quantityPerUnitStr.replace(/,/g, ''));
        
        if (!isNaN(numValue)) {
          // If divisible, convert to satoshis (multiply by 100000000)
          // If not divisible, round to integer
          const processedValue = dividendAssetInfo.assetInfo.divisible
            ? Math.round(numValue * 100000000).toString()
            : Math.round(numValue).toString();
          
          // Replace the value in the form data
          formData.set('quantity_per_unit', processedValue);
        }
      }
      
      // Submit the processed form data
      formAction(formData);
    }
  };

  // Handle dividend asset change
  const handleDividendAssetChange = (asset: string) => {
    setSelectedDividendAsset(asset);
  };

  return (
    <div className="space-y-4">
      {asset && assetInfo && <AssetHeader assetInfo={assetInfo.assetInfo} className="mb-6" />}
      {assetError && <div className="text-red-500">Failed to fetch asset details.</div>}
      
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <input type="hidden" name="asset" value={asset} />
          <input type="hidden" name="dividend_asset" value={selectedDividendAsset} />
          
          <AssetSelectInput
            selectedAsset={selectedDividendAsset}
            onChange={handleDividendAssetChange}
            label="Dividend Asset"
            required
            shouldShowHelpText={shouldShowHelpText}
            description="The asset to pay dividends in (e.g., XCP)."
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
                {dividendAssetInfo?.assetInfo && dividendAssetInfo.assetInfo.divisible && 
                  " This value will be converted to satoshis (multiplied by 10^8) when submitted."}
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
