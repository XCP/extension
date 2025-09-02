"use client";

import { useEffect, useState, useMemo } from "react";
import { useFormStatus } from "react-dom";
import { ComposeForm } from "@/components/compose-form";
import { BalanceHeader } from "@/components/headers/balance-header";
import { AmountWithMaxInput } from "@/components/inputs/amount-with-max-input";
import { DestinationsInput } from "@/components/inputs/destinations-input";
import { MemoInput } from "@/components/inputs/memo-input";
import { useComposer } from "@/contexts/composer-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { validateQuantity } from "@/utils/validation";
import type { SendOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";
import { ErrorAlert } from "@/components/error-alert";

interface Destination {
  id: number;
  address: string;
}

interface SendFormProps {
  formAction: (formData: FormData) => void;
  initialAsset?: string;
  initialFormData: SendOptions | null;
}

export function SendForm({
  formAction,
  initialAsset,
  initialFormData
}: SendFormProps): ReactElement {
  // Get everything from composer context
  const { activeAddress, settings, showHelpText } = useComposer<SendOptions>();
  const enableMPMA = settings?.enableMPMA ?? false;
  
  // Data fetching hooks
  const { data: assetDetails, error: assetDetailsError } = useAssetDetails(
    initialAsset || initialFormData?.asset || "BTC"
  );
  
  // Form status
  const { pending } = useFormStatus();
  
  // Local validation error state
  const [validationError, setValidationError] = useState<string | null>(null);
  
  // Form state
  const [amount, setAmount] = useState<string>(
    initialFormData?.quantity?.toString() || ""
  );
  const [satPerVbyte, setSatPerVbyte] = useState<number>(initialFormData?.sat_per_vbyte || 0.1);
  
  // Destinations state for MPMA
  const [destinations, setDestinations] = useState<Destination[]>(() => [
    { id: Date.now(), address: initialFormData?.destination || "" }
  ]);
  const [destinationsValid, setDestinationsValid] = useState(false);
  
  // Memo state and validation
  const [memo, setMemo] = useState(initialFormData?.memo || "");
  const [memoValid, setMemoValid] = useState(true);
  
  // Computed values
  const isDivisible = useMemo(() => {
    if (initialAsset === "BTC" || initialFormData?.asset === "BTC") return true;
    return assetDetails?.assetInfo?.divisible || false;
  }, [initialAsset, initialFormData?.asset, assetDetails?.assetInfo]);

  // Asset details error effect
  useEffect(() => {
    if (assetDetailsError) {
      setValidationError(`Failed to fetch details for asset ${initialAsset || initialFormData?.asset || "BTC"}. ${assetDetailsError.message || "Please try again later."}`);
    } else {
      setValidationError(null);
    }
  }, [assetDetailsError, initialAsset, initialFormData?.asset]);

  // Sync amount when initialFormData changes
  useEffect(() => {
    if (initialFormData?.quantity !== undefined) {
      setAmount(initialFormData.quantity.toString());
    }
  }, [initialFormData?.quantity]);

  // Handlers
  const handleAmountChange = (value: string) => {
    setAmount(value);
    // Clear validation error when amount changes
    setValidationError(null);
  };

  const handleFormAction = (formData: FormData) => {
    if (amount) {
      formData.set("quantity", amount);
    }
    
    // Add all destinations to form data
    if (destinations.length > 1) {
      // For MPMA, pass destinations as comma-separated list
      formData.set("destinations", destinations.map(d => d.address).join(","));
      formData.delete("destination"); // Remove single destination field
    } else {
      // For single send, use the first destination
      formData.set("destination", destinations[0].address);
    }
    
    // Add memo to form data
    if (memo) {
      formData.set("memo", memo);
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

  const isSubmitDisabled = !isAmountValid() || !destinationsValid || !memoValid;

  return (
    <ComposeForm
      formAction={handleFormAction}
      header={
        activeAddress && assetDetails ? (
          <BalanceHeader
            balance={{
              asset: initialAsset || initialFormData?.asset || "BTC",
              quantity_normalized: assetDetails.availableBalance,
              asset_info: assetDetails.assetInfo || undefined,
            }}
            className="mt-1 mb-5"
          />
        ) : null
      }
      submitText="Continue"
      submitDisabled={isSubmitDisabled}
      showFeeRate={true}
    >
          {validationError && (
            <ErrorAlert
              message={validationError}
              onClose={() => setValidationError(null)}
            />
          )}
          <DestinationsInput
            destinations={destinations}
            onChange={setDestinations}
            onValidationChange={setDestinationsValid}
            asset={initialAsset || initialFormData?.asset || "BTC"}
            enableMPMA={enableMPMA}
            required
            disabled={pending}
            showHelpText={showHelpText}
          />
          <input type="hidden" name="asset" value={initialAsset || initialFormData?.asset || "BTC"} />

          <AmountWithMaxInput
            asset={initialAsset || initialFormData?.asset || "BTC"}
            availableBalance={assetDetails?.availableBalance || "0"}
            value={amount}
            onChange={handleAmountChange}
            sat_per_vbyte={satPerVbyte}
            setError={setValidationError}
            sourceAddress={activeAddress}
            maxAmount={assetDetails?.availableBalance || "0"}
            shouldShowHelpText={showHelpText}
            label="Amount"
            name="quantity"
            description={
              isDivisible
                ? "Enter the amount to send."
                : "Enter a whole number amount."
            }
            disabled={pending}
            destinationCount={destinations.length}
            destination={destinations.length === 1 ? destinations[0].address : undefined}
            memo={memo}
          />

          {(initialAsset || initialFormData?.asset) !== "BTC" && (
            <MemoInput
              value={memo}
              onChange={setMemo}
              onValidationChange={setMemoValid}
              disabled={pending}
              showHelpText={showHelpText}
            />
          )}

    </ComposeForm>
  );
}
