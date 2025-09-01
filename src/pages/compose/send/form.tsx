"use client";

import { useEffect, useState, useMemo } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/button";
import { BalanceHeader } from "@/components/headers/balance-header";
import { AmountWithMaxInput } from "@/components/inputs/amount-with-max-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { DestinationsInput } from "@/components/inputs/destinations-input";
import { MemoInput } from "@/components/inputs/memo-input";
import { ErrorAlert } from "@/components/error-alert";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { validateQuantity } from "@/utils/validation";
import type { SendOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

interface Destination {
  id: number;
  address: string;
}

interface SendFormProps {
  formAction: (formData: FormData) => void;
  initialAsset?: string;
  initialFormData: SendOptions | null;
  error?: string | null;
  showHelpText?: boolean;
}

export function SendForm({
  formAction,
  initialAsset,
  initialFormData,
  error: composerError,
  showHelpText,
}: SendFormProps): ReactElement {
  // Context hooks
  const { activeAddress } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = showHelpText ?? settings?.showHelpText ?? false;
  const enableMPMA = settings?.enableMPMA ?? false;
  
  // Data fetching hooks
  const { data: assetDetails, error: assetDetailsError } = useAssetDetails(
    initialAsset || initialFormData?.asset || "BTC"
  );
  
  // Form status
  const { pending } = useFormStatus();
  
  // Error state management
  const [error, setError] = useState<{ message: string } | null>(null);
  
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

  // Effects - composer error first
  useEffect(() => {
    if (composerError) {
      setError({ message: composerError });
    }
  }, [composerError]);

  // Asset details error effect
  useEffect(() => {
    if (assetDetailsError) {
      setError({
        message: `Failed to fetch details for asset ${initialAsset || initialFormData?.asset || "BTC"}. ${assetDetailsError.message || "Please try again later."}`
      });
    } else if (!composerError) {
      // Clear error if it was an asset details error and there's no composer error
      setError(null);
    }
  }, [assetDetailsError, initialAsset, initialFormData?.asset, composerError]);

  // Sync amount when initialFormData changes
  useEffect(() => {
    if (initialFormData?.quantity !== undefined) {
      setAmount(initialFormData.quantity.toString());
    }
  }, [initialFormData?.quantity]);

  // Handlers
  const handleAmountChange = (value: string) => {
    setAmount(value);
    // Clear error when amount changes
    setError(null);
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

  const isSubmitDisabled = pending || !isAmountValid() || !destinationsValid || !memoValid;

  return (
    <div className="space-y-4">
      {activeAddress ? (
        assetDetails ? (
          <BalanceHeader
            balance={{
              asset: initialAsset || initialFormData?.asset || "BTC",
              quantity_normalized: assetDetails.availableBalance,
              asset_info: assetDetails.assetInfo || undefined,
            }}
            className="mt-1 mb-5"
          />
        ) : null
      ) : null}
      <div className="bg-white rounded-lg shadow-lg p-4">
        {error && (
          <ErrorAlert
            message={error.message}
            onClose={() => setError(null)}
          />
        )}
        <form action={handleFormAction} className="space-y-6">
          <DestinationsInput
            destinations={destinations}
            onChange={setDestinations}
            onValidationChange={setDestinationsValid}
            asset={initialAsset || initialFormData?.asset || "BTC"}
            enableMPMA={enableMPMA}
            required
            disabled={pending}
            showHelpText={shouldShowHelpText}
          />
          <input type="hidden" name="asset" value={initialAsset || initialFormData?.asset || "BTC"} />

          <AmountWithMaxInput
            asset={initialAsset || initialFormData?.asset || "BTC"}
            availableBalance={assetDetails?.availableBalance || "0"}
            value={amount}
            onChange={handleAmountChange}
            sat_per_vbyte={satPerVbyte}
            setError={(message) => message ? setError({ message }) : setError(null)}
            sourceAddress={activeAddress}
            maxAmount={assetDetails?.availableBalance || "0"}
            shouldShowHelpText={shouldShowHelpText}
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
              showHelpText={shouldShowHelpText}
            />
          )}

          <FeeRateInput
            showHelpText={shouldShowHelpText}
            disabled={pending}
            onFeeRateChange={setSatPerVbyte}
          />

          <Button
            type="submit"
            color="blue"
            fullWidth
            disabled={isSubmitDisabled}
          >
            {pending ? "Submitting..." : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
