
import { useEffect, useState } from "react";
import { ComposerForm } from "@/components/composer-form";
import { BalanceHeader } from "@/components/headers/balance-header";
import { AmountWithMaxInput } from "@/components/inputs/amount-with-max-input";
import { useComposer } from "@/contexts/composer-context";
import { ErrorAlert } from "@/components/error-alert";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import type { AttachOptions } from "@/utils/blockchain/counterparty/compose";
import type { ReactElement } from "react";

/**
 * Props for the UtxoAttachForm component, aligned with Composer's formAction.
 */
interface UtxoAttachFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: AttachOptions | null;
  initialAsset: string;
}

/**
 * Form for attaching assets to a UTXO using React 19 Actions.
 */
export function UtxoAttachForm({
  formAction,
  initialFormData,
  initialAsset,
}: UtxoAttachFormProps): ReactElement {
  // Context hooks
  const { activeAddress, showHelpText } = useComposer();
  
  // Data fetching hooks
  const asset = initialAsset || initialFormData?.asset || "";
  const { data: assetDetails } = useAssetDetails(asset);
  
  // Local error state management
  const [validationError, setValidationError] = useState<string | null>(null);
  
  // Form state
  const [quantity, setQuantity] = useState(initialFormData?.quantity?.toString() || "");
  
  // Computed values
  const isDivisible = assetDetails?.assetInfo?.divisible ?? true;

  // Effects

  // Focus quantity input on mount
  useEffect(() => {
    const quantityInput = document.querySelector("input[name='quantity']") as HTMLInputElement;
    quantityInput?.focus();
  }, []);

  return (
    <ComposerForm
      formAction={formAction}
      header={
        asset && assetDetails && (
          <BalanceHeader
            balance={{
              asset: asset,
              asset_info: {
                asset_longname: assetDetails.assetInfo?.asset_longname || null,
                description: assetDetails.assetInfo?.description || '',
                issuer: assetDetails.assetInfo?.issuer || 'Unknown',
                divisible: assetDetails.assetInfo?.divisible ?? false,
                locked: assetDetails.assetInfo?.locked ?? false,
                supply: assetDetails.assetInfo?.supply
              },
              quantity_normalized: assetDetails.availableBalance
            }}
            className="mt-1 mb-5"
          />
        )
      }
      submitDisabled={!quantity || quantity === "0" || parseFloat(quantity) <= 0}
    >
      {validationError && (
        <div className="mb-4">
          <ErrorAlert
            message={validationError}
            onClose={() => setValidationError(null)}
          />
        </div>
      )}
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
            showHelpText={showHelpText}
            label="Amount"
            name="quantity"
            description={
              isDivisible
                ? "Enter the amount to attach (up to 8 decimal places)."
                : "Enter a whole number amount."
            }
            disabled={false}
          />
    </ComposerForm>
  );
}
