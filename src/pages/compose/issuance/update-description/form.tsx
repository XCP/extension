"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Textarea } from "@headlessui/react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import type { IssuanceOptions } from "@/utils/blockchain/counterparty";
import { AssetHeader } from "@/components/headers/asset-header";
import type { ReactElement } from "react";

/**
 * Props for the UpdateDescriptionForm component, aligned with Composer's formAction.
 */
interface UpdateDescriptionFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: IssuanceOptions | null;
  asset: string;
  error?: string | null;
  showHelpText?: boolean;
}

/**
 * Form for updating asset description using React 19 Actions.
 */
export function UpdateDescriptionForm({
  formAction,
  initialFormData,
  asset,
  error: composerError,
  showHelpText,
}: UpdateDescriptionFormProps): ReactElement {
  const { settings } = useSettings();
  const shouldShowHelpText = showHelpText ?? settings?.showHelpText ?? false;
  const { error: assetError, data: assetDetails } = useAssetDetails(asset);
  const { pending } = useFormStatus();
  const [error, setError] = useState<{ message: string; } | null>(null);

  // Set composer error when it occurs
  useEffect(() => {
    if (composerError) {
      setError({ message: composerError });
    }
  }, [composerError]);

  // Focus description textarea on mount
  useEffect(() => {
    const textarea = document.querySelector("textarea[name='description']") as HTMLTextAreaElement;
    textarea?.focus();
  }, []);

  if (assetError || !assetDetails) {
    return (
      <div className="p-4 text-red-500">
        Unable to load asset details. Please ensure the asset exists and you have the necessary
        permissions.
      </div>
    );
  }
  if (asset === "BTC") return <div className="p-4 text-red-500">Cannot update description of BTC</div>;

  return (
    <div className="space-y-4">
      <AssetHeader
        assetInfo={{
          asset: asset,
          asset_longname: assetDetails?.assetInfo?.asset_longname || null,
          description: assetDetails?.assetInfo?.description,
          issuer: assetDetails?.assetInfo?.issuer,
          divisible: assetDetails?.assetInfo?.divisible ?? false,
          locked: assetDetails?.assetInfo?.locked ?? false,
          supply: assetDetails?.assetInfo?.supply
        }}
        className="mt-1 mb-5"
      />
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        {error && (
          <ErrorAlert 
            message={error.message} 
            onClose={() => setError(null)}
          />
        )}
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="asset" value={asset} />
          <input type="hidden" name="quantity" value="0" />
          <Field>
            <Label htmlFor="description" className="block text-sm font-medium text-gray-700">
              Description <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={initialFormData?.description || ""}
              className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
              rows={3}
              required
              disabled={pending}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter a new description for the asset to use.
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
