"use client";

import { useEffect } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { BalanceHeader } from "@/components/headers/balance-header";
import { AmountWithMaxInput } from "@/components/inputs/amount-with-max-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import type { SendOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

/**
 * Props for the SendForm component, aligned with Composer's formAction.
 */
interface SendFormProps {
  formAction: (formData: FormData) => void;
  initialAsset?: string;
  initialFormData: SendOptions | null;
}

/**
 * Form for sending assets using React 19 Actions.
 */
export function SendForm({
  formAction,
  initialAsset,
  initialFormData,
}: SendFormProps): ReactElement {
  const { activeAddress } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText ?? false;
  const { data: assetDetails, error: assetDetailsError } = useAssetDetails(
    initialFormData?.asset || initialAsset || "BTC"
  );
  const { pending } = useFormStatus();

  const isDivisible = initialFormData?.asset === "BTC" || assetDetails?.assetInfo?.divisible;

  // Focus destination input on mount
  useEffect(() => {
    const input = document.querySelector("input[name='destination']") as HTMLInputElement;
    input?.focus();
  }, []);

  return (
    <div className="space-y-4">
      {activeAddress && assetDetails && (
        <BalanceHeader
          balance={{
            asset: initialFormData?.asset || initialAsset || "BTC",
            quantity_normalized: assetDetails.availableBalance,
            asset_info: assetDetails.assetInfo || undefined,
          }}
          className="mb-5"
        />
      )}
      {assetDetailsError && <div className="text-red-500 mb-2">Failed to fetch asset details.</div>}
      <div className="bg-white rounded-lg shadow-lg p-4">
        <form action={formAction} className="space-y-6">
          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Destination <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              name="destination"
              defaultValue={initialFormData?.destination || ""}
              required
              placeholder="Enter destination address"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
              disabled={pending}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the address to send the asset to.
            </Description>
          </Field>
          <input type="hidden" name="asset" value={initialFormData?.asset || initialAsset || "BTC"} />
          <AmountWithMaxInput
            asset={initialFormData?.asset || initialAsset || "BTC"}
            availableBalance={assetDetails?.availableBalance || "0"}
            value={
              initialFormData?.quantity
                ? isDivisible
                  ? (initialFormData.quantity / 1e8).toFixed(8)
                  : initialFormData.quantity.toString()
                : ""
            }
            onChange={() => {}} // No-op since formAction handles submission
            sat_per_vbyte={initialFormData?.sat_per_vbyte || 1}
            setError={() => {}} // No-op since Composer handles errors
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
          {(initialFormData?.asset || initialAsset) !== "BTC" && (
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

          <FeeRateInput showHelpText={shouldShowHelpText} disabled={pending} />
          
          <Button type="submit" color="blue" fullWidth disabled={pending}>
            {pending ? "Submitting..." : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
