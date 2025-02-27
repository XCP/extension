"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { BalanceHeader } from "@/components/headers/balance-header";
import { useSettings } from "@/contexts/settings-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { useWallet } from "@/contexts/wallet-context";
import type { DestroyOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

/**
 * Props for the DestroySupplyForm component, aligned with Composer's formAction.
 */
interface DestroySupplyFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: DestroyOptions | null;
  initialAsset?: string;
}

/**
 * Form for destroying asset supply using React 19 Actions.
 */
export function DestroySupplyForm({
  formAction,
  initialFormData,
  initialAsset,
}: DestroySupplyFormProps): ReactElement {
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText ?? false;
  const { pending } = useFormStatus();
  const { activeAddress } = useWallet();
  const asset = initialFormData?.asset || initialAsset || "";
  const { data: assetDetails } = useAssetDetails(asset);

  // Focus asset input on mount
  useEffect(() => {
    const input = document.getElementById("asset") as HTMLInputElement;
    input?.focus();
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
      
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        <form action={formAction} className="space-y-4">
          <Field>
            <Label htmlFor="asset" className="block text-sm font-medium text-gray-700">
              Asset Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="asset"
              name="asset"
              type="text"
              defaultValue={initialFormData?.asset || initialAsset || ""}
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
              required
              placeholder="Enter asset name"
              disabled={pending || !!initialAsset}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              The name of the asset to destroy supply from.
            </Description>
          </Field>

          <Field>
            <Label htmlFor="quantity" className="block text-sm font-medium text-gray-700">
              Amount <span className="text-red-500">*</span>
            </Label>
            <Input
              id="quantity"
              name="quantity"
              type="text"
              defaultValue={initialFormData?.quantity?.toString() || ""}
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
              required
              disabled={pending}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              The quantity of the asset to destroy.
            </Description>
          </Field>

          <Field>
            <Label htmlFor="tag" className="block text-sm font-medium text-gray-700">
              Tag
            </Label>
            <Input
              id="tag"
              name="tag"
              type="text"
              defaultValue={initialFormData?.tag || ""}
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
              disabled={pending}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Optional tag to attach to this destroy action.
            </Description>
          </Field>

          <FeeRateInput showHelpText={shouldShowHelpText} disabled={pending} />
          
          <Button type="submit" color="red" fullWidth disabled={pending}>
            {pending ? "Submitting..." : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
