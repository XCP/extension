"use client";

import { useEffect, useState, useMemo } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Input } from "@headlessui/react";
import { ComposeForm } from "@/components/forms/compose-form";
import { BalanceHeader } from "@/components/headers/balance-header";
import { AmountWithMaxInput } from "@/components/inputs/amount-with-max-input";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { useComposer } from "@/contexts/composer-context";
import { validateQuantity } from "@/utils/validation";
import type { DestroyOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

/**
 * Props for the DestroySupplyForm component, aligned with Composer's formAction.
 */
interface DestroySupplyFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: DestroyOptions | null;
  initialAsset?: string;
}

/**
 * Form for destroying asset supply using React 19 Actions.
 */
export function DestroySupplyForm({
  formAction,
  initialFormData,
  initialAsset,
}: DestroySupplyFormProps): ReactElement {
  // Context hooks
  const { activeAddress, showHelpText } = useComposer();
  
  // Data fetching hooks
  const asset = initialAsset || initialFormData?.asset || "";
  const { data: assetDetails, error: assetDetailsError } = useAssetDetails(asset);
  
  // Form status
  const { pending } = useFormStatus();
  
  // Form state
  const [amount, setAmount] = useState<string>(
    initialFormData?.quantity?.toString() || ""
  );
  const [satPerVbyte, setSatPerVbyte] = useState<number>(initialFormData?.sat_per_vbyte || 0.1);
  
  // Computed values
  const isDivisible = useMemo(() => {
    return assetDetails?.assetInfo?.divisible || false;
  }, [assetDetails?.assetInfo]);


  // Sync amount when initialFormData changes
  useEffect(() => {
    if (initialFormData?.quantity !== undefined) {
      setAmount(initialFormData.quantity.toString());
    }
  }, [initialFormData?.quantity]);

  // Focus on tag input on mount if asset is pre-selected
  useEffect(() => {
    const input = document.getElementById(initialAsset ? "tag" : "quantity") as HTMLInputElement;
    input?.focus();
  }, [initialAsset]);

  // Handlers
  const handleAmountChange = (value: string) => {
    setAmount(value);
  };

  const handleFormAction = (formData: FormData) => {
    if (amount) {
      // Remove any formatting (commas, spaces) from the amount
      const cleanAmount = amount.replace(/[,\s]/g, '');
      formData.set("quantity", cleanAmount);
    }
    // Ensure tag is always present, even if empty
    if (!formData.get("tag")) {
      formData.set("tag", "");
    }
    formAction(formData);
  };

  // Validation helpers
  const isAmountValid = (): boolean => {
    if (!amount || amount.trim() === "") return false;
    
    const validation = validateQuantity(amount, {
      divisible: isDivisible,
      allowZero: false
    });
    
    return validation.isValid;
  };


  return (
    <ComposeForm
      formAction={handleFormAction}
      header={
        asset && assetDetails ? (
          <BalanceHeader
            balance={{
              asset: asset,
              asset_info: {
                asset_longname: assetDetails.assetInfo?.asset_longname || null,
                description: assetDetails.assetInfo?.description,
                issuer: assetDetails.assetInfo?.issuer,
                divisible: assetDetails.assetInfo?.divisible ?? false,
                locked: assetDetails.assetInfo?.locked ?? false,
                supply: assetDetails.assetInfo?.supply
              },
              quantity_normalized: assetDetails.availableBalance
            }}
            className="mt-1 mb-5"
          />
        ) : null
      }
      submitText="Destroy Supply"
      submitDisabled={!isAmountValid() || !asset}
    >
          {/* Hidden asset field when pre-selected */}
          {initialAsset ? (
            <input type="hidden" name="asset" value={initialAsset} />
          ) : (
            <Field>
              <Label htmlFor="asset" className="block text-sm font-medium text-gray-700">
                Asset Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="asset"
                name="asset"
                type="text"
                defaultValue={initialFormData?.asset || ""}
                className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
                required
                placeholder="Enter asset name"
                disabled={pending}
              />
              {showHelpText && (
                <Description className="mt-2 text-sm text-gray-500">
                  The name of the asset to destroy supply from.
                </Description>
              )}
            </Field>
          )}

          <AmountWithMaxInput
            asset={asset}
            availableBalance={assetDetails?.availableBalance || "0"}
            value={amount}
            onChange={handleAmountChange}
            sat_per_vbyte={satPerVbyte}
            setError={(message) => {}}
            sourceAddress={activeAddress}
            maxAmount={assetDetails?.availableBalance || "0"}
            shouldShowHelpText={showHelpText}
            label="Amount to Destroy"
            name="quantity"
            description={
              isDivisible
                ? "Enter the amount to destroy (up to 8 decimal places)."
                : "Enter a whole number amount to destroy."
            }
            disabled={pending}
          />

          <Field>
            <Label htmlFor="tag" className="block text-sm font-medium text-gray-700">
              Message (Optional)
            </Label>
            <Input
              id="tag"
              name="tag"
              type="text"
              defaultValue={initialFormData?.tag || ""}
              className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
              disabled={pending}
              maxLength={34}
              placeholder="Optional reference or note (max 34 characters)"
            />
            {showHelpText && (
              <Description className="mt-2 text-sm text-gray-500">
                Optional tag to attach to this destroy action. This can be used for notes, references, or any metadata up to 34 characters.
              </Description>
            )}
          </Field>

    </ComposeForm>
  );
}
