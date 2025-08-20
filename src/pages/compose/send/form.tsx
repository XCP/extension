"use client";

import { useEffect, useState, useMemo } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { BalanceHeader } from "@/components/headers/balance-header";
import { HeaderSkeleton } from "@/components/skeleton";
import { AmountWithMaxInput } from "@/components/inputs/amount-with-max-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { DestinationInput } from "@/components/inputs/destination-input";
import { DestinationsInput } from "@/components/inputs/destinations-input";
import { ErrorAlert } from "@/components/error-alert";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { formatAmount } from "@/utils/format";
import { toSatoshis } from "@/utils/numeric";
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
  const { activeAddress } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = showHelpText ?? settings?.showHelpText ?? false;
  const enableMPMA = settings?.enableMPMA ?? false;
  const { data: assetDetails, error: assetDetailsError } = useAssetDetails(
    initialAsset || initialFormData?.asset || "BTC"
  );
  const { pending } = useFormStatus();
  
  // Single error state to handle all errors
  const [error, setError] = useState<{ message: string; } | null>(null);
  
  // Destinations state for MPMA
  const [destinations, setDestinations] = useState<Destination[]>(() => [
    { id: Date.now(), address: initialFormData?.destination || "" }
  ]);
  const [destinationsValid, setDestinationsValid] = useState(false);

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
        message: `Failed to fetch details for asset ${initialAsset || initialFormData?.asset || "BTC"}. ${assetDetailsError.message || "Please try again later."}`
      });
    } else if (!composerError) {
      // Clear error if it was an asset details error and there's no composer error
      setError(null);
    }
  }, [assetDetailsError, initialAsset, initialFormData?.asset, composerError]);

  const isDivisible = useMemo(() => {
    if (initialAsset === "BTC" || initialFormData?.asset === "BTC") return true;
    return assetDetails?.assetInfo?.divisible || false;
  }, [initialAsset, initialFormData?.asset, assetDetails?.assetInfo]);

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
  }, [initialFormData, isDivisible]); // Depend on full object


  const handleFormAction = (formData: FormData) => {
    if (amount) {
      const quantity = isDivisible ? toSatoshis(amount) : amount;
      formData.set("quantity", quantity);
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

  const isSubmitDisabled = pending || !isAmountValid() || !destinationsValid;

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
        ) : (
          <HeaderSkeleton className="mt-1 mb-5" variant="balance" />
        )
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
                ? "Enter the amount to send (up to 8 decimal places)."
                : "Enter a whole number amount."
            }
            disabled={pending}
          />

          {(initialAsset || initialFormData?.asset) !== "BTC" && (
            <Field>
              <Label className="text-sm font-medium text-gray-700">Memo</Label>
              <Input
                type="text"
                name="memo"
                defaultValue={initialFormData?.memo || ""}
                placeholder="Optional memo"
                className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
                disabled={pending}
              />
              <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
                Optional memo to include with the transaction.
              </Description>
            </Field>
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
