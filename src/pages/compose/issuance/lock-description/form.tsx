"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import type { IssuanceOptions } from "@/utils/blockchain/counterparty";
import { AssetHeader } from "@/components/headers/asset-header";
import { Field, Description } from "@headlessui/react";
import type { ReactElement } from "react";

/**
 * Props for the LockDescriptionForm component, aligned with Composer's formAction.
 */
interface LockDescriptionFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: IssuanceOptions | null;
  asset: string;
  error?: string | null;
  showHelpText?: boolean;
}

/**
 * Form for locking asset description using React 19 Actions.
 * This form creates an issuance transaction with description="LOCK" 
 * which permanently prevents future description changes.
 */
export function LockDescriptionForm({
  formAction,
  initialFormData,
  asset,
  error: composerError,
  showHelpText,
}: LockDescriptionFormProps): ReactElement {
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

  if (assetError || !assetDetails) {
    return (
      <div className="p-4 text-red-500">
        Unable to load asset details. Please ensure the asset exists and you have the necessary
        permissions.
      </div>
    );
  }
  
  if (asset === "BTC") {
    return <div className="p-4 text-red-500">Cannot lock description of BTC</div>;
  }

  // Check if description is already locked
  const currentDescription = assetDetails?.assetInfo?.description || "";
  const isAlreadyLocked = currentDescription === "LOCK";

  if (isAlreadyLocked) {
    return (
      <div className="p-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
          <p className="text-yellow-800">
            The description for this asset is already locked and cannot be changed.
          </p>
        </div>
      </div>
    );
  }

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
        {/* Warning message */}
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-amber-800 mb-2">⚠️ Warning</h3>
          <p className="text-sm text-amber-700">
            Locking the description is <strong>permanent and irreversible</strong>. 
            Once locked, you will never be able to change the asset description again.
          </p>
          {currentDescription && (
            <div className="mt-3 pt-3 border-t border-amber-200">
              <p className="text-xs text-amber-600">Current description:</p>
              <p className="text-sm font-medium text-amber-800 mt-1">{currentDescription}</p>
            </div>
          )}
        </div>

        {error && (
          <ErrorAlert 
            message={error.message} 
            onClose={() => setError(null)}
          />
        )}
        
        <form action={formAction} className="space-y-4">
          {/* Hidden fields for the issuance parameters */}
          <input type="hidden" name="asset" value={asset} />
          <input type="hidden" name="quantity" value="0" />
          <input type="hidden" name="description" value="LOCK" />
          
          {shouldShowHelpText && (
            <Field>
              <Description className="text-sm text-gray-500">
                This action will permanently lock the description for {asset}. 
                The current description "{currentDescription || "(empty)"}" will be the final description forever.
              </Description>
            </Field>
          )}

          <FeeRateInput showHelpText={shouldShowHelpText} disabled={pending} />
          
          <Button 
            type="submit" 
            color="red" 
            fullWidth 
            disabled={pending}
          >
            {pending ? "Locking Description..." : "Lock Description Permanently"}
          </Button>
        </form>
      </div>
    </div>
  );
}