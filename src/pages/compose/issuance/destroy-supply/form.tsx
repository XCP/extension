"use client";

import { useEffect, useState, useMemo } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { BalanceHeader } from "@/components/headers/balance-header";
import { HeaderSkeleton } from "@/components/skeleton";
import { AmountWithMaxInput } from "@/components/inputs/amount-with-max-input";
import { ErrorAlert } from "@/components/error-alert";
import { useSettings } from "@/contexts/settings-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { useWallet } from "@/contexts/wallet-context";
import { formatAmount } from "@/utils/format";
import type { DestroyOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

/**
 * Props for the DestroySupplyForm component, aligned with Composer's formAction.
 */
interface DestroySupplyFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: DestroyOptions | null;
  initialAsset?: string;
  error?: string | null;
  showHelpText?: boolean;
}

/**
 * Form for destroying asset supply using React 19 Actions.
 */
export function DestroySupplyForm({
  formAction,
  initialFormData,
  initialAsset,
  error: composerError,
  showHelpText,
}: DestroySupplyFormProps): ReactElement {
  const { settings } = useSettings();
  const shouldShowHelpText = showHelpText ?? settings?.showHelpText ?? false;
  const { pending } = useFormStatus();
  const { activeAddress } = useWallet();
  const asset = initialAsset || initialFormData?.asset || "";
  const { data: assetDetails, error: assetDetailsError } = useAssetDetails(asset);
  
  // Single error state to handle all errors
  const [error, setError] = useState<{ message: string; } | null>(null);

  // Set composer error when it occurs
  useEffect(() => {
    if (composerError) {
      setError({ message: composerError });
    }
  }, [composerError]);

  // Set asset details error when it occurs
  useEffect(() => {
    if (assetDetailsError) {
      setError({
        message: `Failed to fetch details for asset ${asset}. ${assetDetailsError.message || "Please try again later."}`
      });
    } else if (!composerError) {
      // Clear error if it was an asset details error and there's no composer error
      setError(null);
    }
  }, [assetDetailsError, asset, composerError]);

  const isDivisible = useMemo(() => {
    return assetDetails?.assetInfo?.divisible || false;
  }, [assetDetails?.assetInfo]);

  const normalizeAmountForDisplay = (quantity: number | undefined): string => {
    if (!quantity && quantity !== 0) return ""; // Handle null/undefined, allow 0
    if (isDivisible) {
      return formatAmount({
        value: quantity / 1e8,
        maximumFractionDigits: 8,
        minimumFractionDigits: 0,
      });
    }
    return quantity.toString();
  };

  const [amount, setAmount] = useState<string>(() =>
    normalizeAmountForDisplay(initialFormData?.quantity)
  );

  const [satPerVbyte, setSatPerVbyte] = useState<number>(initialFormData?.sat_per_vbyte || 0.1);

  // Sync amount when initialFormData changes
  useEffect(() => {
    const normalized = normalizeAmountForDisplay(initialFormData?.quantity);
    if (normalized !== amount) {
      setAmount(normalized);
    }
  }, [initialFormData, isDivisible]);

  // Focus on tag input on mount if asset is pre-selected
  useEffect(() => {
    const input = document.getElementById(initialAsset ? "tag" : "quantity") as HTMLInputElement;
    input?.focus();
  }, [initialAsset]);

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

  const handleAmountChange = (value: string) => {
    setAmount(value);
    // Clear error when amount changes
    setError(null);
  };

  const isAmountValid = (): boolean => {
    if (!amount || amount.trim() === "") return false;
    if (isDivisible) {
      const numAmount = parseFloat(amount);
      return !isNaN(numAmount) && numAmount > 0;
    }
    const intAmount = parseInt(amount, 10);
    return !isNaN(intAmount) && intAmount > 0 && intAmount.toString() === amount.trim();
  };

  const isSubmitDisabled = pending || !isAmountValid() || !asset;

  return (
    <div className="space-y-4">
      {asset && (
        assetDetails ? (
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
        ) : (
          <HeaderSkeleton className="mt-1 mb-5" variant="balance" />
        )
      )}
      
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        {error && (
          <ErrorAlert
            message={error.message}
            onClose={() => setError(null)}
          />
        )}
        <form action={handleFormAction} className="space-y-4">
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
                className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
                required
                placeholder="Enter asset name"
                disabled={pending}
              />
              <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
                The name of the asset to destroy supply from.
              </Description>
            </Field>
          )}

          <AmountWithMaxInput
            asset={asset}
            availableBalance={assetDetails?.availableBalance || "0"}
            value={amount}
            onChange={handleAmountChange}
            sat_per_vbyte={satPerVbyte}
            setError={(message) => message ? setError({ message }) : setError(null)}
            sourceAddress={activeAddress}
            maxAmount={assetDetails?.availableBalance || "0"}
            shouldShowHelpText={shouldShowHelpText}
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
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
              disabled={pending}
              maxLength={34}
              placeholder="Optional reference or note (max 34 characters)"
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Optional tag to attach to this destroy action. This can be used for notes, references, or any metadata up to 34 characters.
            </Description>
          </Field>

          <FeeRateInput showHelpText={shouldShowHelpText} disabled={pending} />
          
          <Button type="submit" color="red" fullWidth disabled={isSubmitDisabled}>
            {pending ? "Destroying..." : "Destroy Supply"}
          </Button>
        </form>
      </div>
    </div>
  );
}
