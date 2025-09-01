"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { BalanceHeader } from "@/components/headers/balance-header";
import { AmountWithMaxInput } from "@/components/inputs/amount-with-max-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { formatAmount } from "@/utils/format";
import type { AttachOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

/**
 * Props for the UtxoAttachForm component, aligned with Composer's formAction.
 */
interface UtxoAttachFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: AttachOptions | null;
  initialAsset: string;
  error?: string | null;
  showHelpText?: boolean;
}

/**
 * Form for attaching assets to a UTXO using React 19 Actions.
 */
export function UtxoAttachForm({
  formAction,
  initialFormData,
  initialAsset,
  error: composerError,
  showHelpText,
}: UtxoAttachFormProps): ReactElement {
  // Context hooks
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = showHelpText ?? settings?.showHelpText ?? false;
  
  // Data fetching hooks
  const asset = initialAsset || initialFormData?.asset || "";
  const { data: assetDetails } = useAssetDetails(asset);
  
  // Form status
  const { pending } = useFormStatus();
  
  // Error state management
  const [error, setError] = useState<{ message: string } | null>(null);
  
  // Form state
  const [quantity, setQuantity] = useState(initialFormData?.quantity?.toString() || "");
  
  // Computed values
  const isDivisible = assetDetails?.assetInfo?.divisible ?? true;

  // Effects - composer error first
  useEffect(() => {
    if (composerError) {
      setError({ message: composerError });
    }
  }, [composerError]);

  // Focus quantity input on mount
  useEffect(() => {
    const quantityInput = document.querySelector("input[name='quantity']") as HTMLInputElement;
    quantityInput?.focus();
  }, []);

  return (
    <div className="space-y-4">
      {asset && assetDetails && (
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
      )}
      <div className="bg-white rounded-lg shadow-lg p-4">
        {error && (
          <ErrorAlert
            message={error.message}
            onClose={() => setError(null)}
          />
        )}
        <form action={formAction} className="space-y-6">
          {/* Hidden asset input - passed from navigation */}
          <input 
            type="hidden" 
            name="asset" 
            value={asset}
          />
          <AmountWithMaxInput
            asset={initialAsset || initialFormData?.asset || "XCP"}
            availableBalance={assetDetails?.availableBalance || "0"}
            value={quantity}
            onChange={setQuantity}
            sat_per_vbyte={initialFormData?.sat_per_vbyte || 0.1}
            setError={() => {}} // No-op since Composer handles errors
            sourceAddress={activeAddress}
            maxAmount={assetDetails?.availableBalance || "0"}
            shouldShowHelpText={shouldShowHelpText}
            label="Amount"
            name="quantity"
            description={
              isDivisible
                ? "Enter the amount to attach (up to 8 decimal places)."
                : "Enter a whole number amount."
            }
            disabled={pending}
          />
          
          <FeeRateInput showHelpText={shouldShowHelpText} disabled={pending} />
          
          <Button 
            type="submit" 
            color="blue" 
            fullWidth 
            disabled={pending || !quantity || quantity === "0" || parseFloat(quantity) <= 0}
          >
            {pending ? "Submitting..." : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
