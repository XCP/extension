"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { BalanceHeader } from "@/components/headers/balance-header";
import { AmountWithMaxInput } from "@/components/inputs/amount-with-max-input";
import { AssetSelectInput } from "@/components/inputs/asset-select-input";
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
}

/**
 * Form for attaching assets to a UTXO using React 19 Actions.
 */
export function UtxoAttachForm({
  formAction,
  initialFormData,
  initialAsset,
}: UtxoAttachFormProps): ReactElement {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText ?? false;
  const { pending } = useFormStatus();
  const asset = initialFormData?.asset || initialAsset || "";
  const { data: assetDetails } = useAssetDetails(asset);

  // Focus utxo input on mount
  useEffect(() => {
    const input = document.querySelector("input[name='utxo']") as HTMLInputElement;
    input?.focus();
  }, []);

  const isDivisible = assetDetails?.assetInfo?.divisible ?? true;

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
        <form action={formAction} className="space-y-6">
          <Field>
            <Label className="text-sm font-medium text-gray-700">
              UTXO <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              name="utxo"
              defaultValue={initialFormData?.utxo_value || ""}
              required
              placeholder="Enter UTXO (txid:vout)"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
              disabled={pending}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the UTXO identifier (e.g., txid:vout) to attach the asset to.
            </Description>
          </Field>
          <AssetSelectInput
            selectedAsset={initialFormData?.asset || initialAsset || "XCP"}
            onChange={() => {}} // No-op since formAction handles submission
            label="Asset"
            required
            shouldShowHelpText={shouldShowHelpText}
            description="Select the asset to attach to the UTXO."
          />
          <AmountWithMaxInput
            asset={initialFormData?.asset || initialAsset || "XCP"}
            availableBalance={assetDetails?.availableBalance || "0"}
            value={
              initialFormData?.quantity
                ? isDivisible
                  ? formatAmount({
                      value: initialFormData.quantity / 1e8,
                      maximumFractionDigits: 8,
                      minimumFractionDigits: 8
                    })
                  : initialFormData.quantity.toString()
                : ""
            }
            onChange={() => {}} // No-op since formAction handles submission
            sat_per_vbyte={initialFormData?.sat_per_vbyte || 1}
            setError={() => {}} // No-op since Composer handles errors
            sourceAddress={activeAddress}
            maxAmount={assetDetails?.availableBalance || "0"}
            shouldShowHelpText={shouldShowHelpText}
            label="Quantity"
            name="quantity"
            description={
              isDivisible
                ? "Enter the quantity to attach (up to 8 decimal places)."
                : "Enter a whole number quantity."
            }
            disabled={pending}
          />

          <FeeRateInput showHelpText={shouldShowHelpText} disabled={pending} />
          
          <Button type="submit" color="blue" fullWidth disabled={pending}>
            {pending ? "Submitting..." : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
