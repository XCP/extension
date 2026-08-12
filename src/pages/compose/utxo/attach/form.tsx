import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { ComposerForm } from "@/components/composer/composer-form";
import { AmountWithMaxInput } from "@/components/domain/balance/amount-with-max-input";
import { BalanceHeader } from "@/components/domain/balance/balance-header";
import { ErrorAlert } from "@/components/ui/error-alert";
import { useComposer } from "@/contexts/composer-context-object";
import type { AttachOptions } from "@/core/counterparty/compose";
import { asDisplayUnits, isGreaterThan } from "@/core/numeric";
import { useAssetDetails } from "@/hooks/useAssetDetails";

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
  const { activeAddress, showHelpText, feeRate } = useComposer();
  
  // Data fetching hooks
  const asset = initialAsset || initialFormData?.asset || "";
  const { data: assetDetails, error: assetError } = useAssetDetails(asset);
  
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

  // Surface a failed asset load instead of rendering the form as if the asset
  // simply had no balance. Seeded into local state so it stays dismissible.
  useEffect(() => {
    if (assetError) {
      setValidationError('Could not load details for this asset.');
    }
  }, [assetError]);

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
              quantity_normalized: asDisplayUnits(assetDetails.availableBalance)
            }}
            className="mt-1 mb-5"
          />
        )
      }
      submitDisabled={!quantity || quantity === "0" || !isGreaterThan(quantity, 0)}
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
            availableBalance={assetDetails?.spendableBalance ?? assetDetails?.availableBalance ?? "0"}
            value={quantity}
            onChange={setQuantity}
            feeRate={feeRate}
            setError={() => {}} // No-op since Composer handles errors
            sourceAddress={activeAddress}
            maxAmount={assetDetails?.spendableBalance ?? assetDetails?.availableBalance ?? "0"}
            showHelpText={showHelpText}
            label="Amount"
            name="quantity"
            description={
              isDivisible
                ? "Enter the amount to attach (up to 8 decimal places)."
                : "Enter a whole number amount."
            }
            disabled={false}
            isDivisible={isDivisible}
          />
    </ComposerForm>
  );
}
