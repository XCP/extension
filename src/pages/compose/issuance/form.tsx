"use client";

import { useEffect } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Input, Textarea } from "@headlessui/react";
import { Button } from "@/components/button";
import { CheckboxInput } from "@/components/inputs/checkbox-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { formatAmount } from "@/utils/format";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { AssetHeader } from "@/components/headers/asset-header";
import { AddressHeader } from "@/components/headers/address-header";
import { useWallet } from "@/contexts/wallet-context";
import type { IssuanceOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

/**
 * Props for the IssuanceForm component, aligned with Composer's formAction.
 */
interface IssuanceFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: IssuanceOptions | null;
  initialParentAsset?: string;
}

/**
 * Form for issuing a new asset using React 19 Actions.
 */
export function IssuanceForm({
  formAction,
  initialFormData,
  initialParentAsset,
}: IssuanceFormProps): ReactElement {
  const { settings } = useSettings();
  const { activeAddress } = useWallet();
  const shouldShowHelpText = settings?.showHelpText ?? false;
  const { pending } = useFormStatus();
  const { data: parentAssetDetails } = useAssetDetails(initialParentAsset || "");

  // Focus asset input on mount
  useEffect(() => {
    const input = document.getElementById("asset") as HTMLInputElement;
    input?.focus();
  }, []);

  const showAsset = initialParentAsset && parentAssetDetails?.assetInfo;
  const showAddress = !showAsset && activeAddress;

  return (
    <div className="space-y-4">
      {showAsset && parentAssetDetails?.assetInfo && (
        <AssetHeader
          assetInfo={{
            asset: initialParentAsset,
            asset_longname: parentAssetDetails.assetInfo.asset_longname || null,
            description: parentAssetDetails.assetInfo.description,
            issuer: parentAssetDetails.assetInfo.issuer,
            divisible: parentAssetDetails.assetInfo.divisible ?? false,
            locked: parentAssetDetails.assetInfo.locked ?? false,
            supply: parentAssetDetails.assetInfo.supply
          }}
          className="mt-1 mb-5"
        />
      )}
      
      {showAddress && (
        <AddressHeader
          address={activeAddress.address}
          walletName={activeAddress.label || activeAddress.walletName}
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
              defaultValue={initialFormData?.asset || (initialParentAsset ? `${initialParentAsset}.` : "")}
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
              required
              placeholder={initialParentAsset ? `${initialParentAsset}.SUBASSET` : "Enter asset name"}
              disabled={pending}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              {initialParentAsset
                ? `Enter a subasset name after "${initialParentAsset}." to create a subasset`
                : "The name of the asset to issue."}
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
              defaultValue={
                initialFormData?.quantity
                  ? initialFormData.divisible
                    ? formatAmount({
                        value: initialFormData.quantity / 1e8,
                        maximumFractionDigits: 8,
                        minimumFractionDigits: 8
                      })
                    : initialFormData.quantity.toString()
                  : ""
              }
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
              required
              disabled={pending}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              The quantity of the asset to issue {initialFormData?.divisible ?? true ? "(up to 8 decimal places)" : "(whole numbers only)"}.
            </Description>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <CheckboxInput
              name="divisible"
              label="Divisible"
              defaultChecked={initialFormData?.divisible ?? true}
              disabled={pending}
            />
            <CheckboxInput
              name="lock"
              label="Locked"
              defaultChecked={initialFormData?.lock || false}
              disabled={pending}
            />
          </div>
          <Field>
            <Label htmlFor="description" className="block text-sm font-medium text-gray-700">
              Description
            </Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={initialFormData?.description || ""}
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
              rows={2}
              disabled={pending}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              A textual description for the asset.
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
