"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { BalanceHeader } from "@/components/headers/balance-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useWallet } from "@/contexts/wallet-context";
import { useSettings } from "@/contexts/settings-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import type { MoveOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

/**
 * Props for the UtxoMoveForm component, aligned with Composer's formAction.
 */
interface UtxoMoveFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: MoveOptions | null;
  initialUtxo?: string;
  initialAsset?: string;
}

/**
 * Form for moving a UTXO using React 19 Actions.
 */
export function UtxoMoveForm({
  formAction,
  initialFormData,
  initialUtxo,
  initialAsset = "BTC",
}: UtxoMoveFormProps): ReactElement {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText ?? false;
  const { pending } = useFormStatus();
  const { data: assetDetails } = useAssetDetails(initialAsset);

  // Focus destination input on mount
  useEffect(() => {
    const input = document.querySelector("input[name='destination']") as HTMLInputElement;
    input?.focus();
  }, []);

  return (
    <div className="space-y-4">
      {initialAsset && assetDetails && (
        <BalanceHeader
          balance={{
            asset: initialAsset,
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
              Enter the address to move the UTXO to.
            </Description>
          </Field>
          <Field>
            <Label className="text-sm font-medium text-gray-700">
              UTXO <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              name="utxo"
              defaultValue={initialUtxo || initialFormData?.utxo_value || ""}
              required
              disabled={!!initialUtxo}
              placeholder="Enter UTXO (txid:vout)"
              className={`
                mt-1 block w-full p-2 rounded-md border
                ${initialUtxo ? 'bg-gray-100 cursor-not-allowed' : 'bg-gray-50'}
                focus:ring-blue-500 focus:border-blue-500
              `}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the UTXO identifier (e.g., txid:vout) to move.
            </Description>
          </Field>

          <FeeRateInput showHelpText={shouldShowHelpText} disabled={pending} />
          
          <Button type="submit" color="blue" fullWidth disabled={pending}>
            {pending ? "Submitting..." : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
