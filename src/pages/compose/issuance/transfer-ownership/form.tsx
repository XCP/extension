"use client";

import { useEffect } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { AssetHeader } from "@/components/headers/asset-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import type { IssuanceOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

/**
 * Props for the TransferOwnershipForm component, aligned with Composer's formAction.
 */
interface TransferOwnershipFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: IssuanceOptions | null;
  asset: string;
}

/**
 * Form for transferring asset ownership using React 19 Actions.
 */
export function TransferOwnershipForm({
  formAction,
  initialFormData,
  asset,
}: TransferOwnershipFormProps): ReactElement {
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText ?? false;
  const { error: assetError, data: assetDetails } = useAssetDetails(asset);
  const { pending } = useFormStatus();

  // Focus transfer_destination input on mount
  useEffect(() => {
    const input = document.querySelector("input[name='transfer_destination']") as HTMLInputElement;
    input?.focus();
  }, []);

  if (assetError || !assetDetails) {
    return (
      <div className="p-4 text-red-500">
        Unable to load asset details. Please ensure the asset exists and you have the necessary
        permissions.
      </div>
    );
  }
  if (asset === "BTC") return <div className="p-4 text-red-500">Cannot transfer ownership of BTC</div>;

  return (
    <div className="space-y-4">
      <AssetHeader
        assetInfo={{
          asset,
          asset_longname: assetDetails?.assetInfo?.asset_longname ?? null,
          divisible: assetDetails?.assetInfo?.divisible ?? true,
          locked: assetDetails?.assetInfo?.locked ?? false,
          description: assetDetails?.assetInfo?.description ?? "",
          issuer: assetDetails?.assetInfo?.issuer ?? "",
          supply: assetDetails?.assetInfo?.supply ?? "0"
        }}
        className="mb-5"
      />
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="asset" value={asset} />
          <Field>
            <Label htmlFor="transfer_destination" className="block text-sm font-medium text-gray-700">
              Destination <span className="text-red-500">*</span>
            </Label>
            <Input
              id="transfer_destination"
              name="transfer_destination"
              type="text"
              defaultValue={initialFormData?.transfer_destination || ""}
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
              required
              disabled={pending}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the bitcoin address receiving ownership.
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
