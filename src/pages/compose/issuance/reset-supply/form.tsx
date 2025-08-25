"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { CheckboxInput } from "@/components/inputs/checkbox-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import type { IssuanceOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

/**
 * Props for the ResetSupplyForm component, aligned with Composer's formAction.
 */
interface ResetSupplyFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: IssuanceOptions | null;
  asset: string;
  error?: string | null;
  showHelpText?: boolean;
}

/**
 * Form for resetting asset supply using React 19 Actions.
 */
export function ResetSupplyForm({
  formAction,
  initialFormData,
  asset,
  error: composerError,
  showHelpText,
}: ResetSupplyFormProps): ReactElement {
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
    return <div className="p-4 text-red-500">Error loading asset details: {assetError?.message}</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
      <div className="mb-4 p-3 bg-gray-50 rounded-md">
        <h3 className="text-sm font-medium text-gray-700">Asset Details</h3>
        <div className="mt-2 text-sm text-gray-600">
          <p>Current Supply: {assetDetails?.assetInfo?.supply || "0"}</p>
          <p>Divisible: {assetDetails?.assetInfo?.divisible ? "Yes" : "No"}</p>
          <p>Locked: {assetDetails?.assetInfo?.locked ? "Yes" : "No"}</p>
        </div>
      </div>
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
        <p className="text-sm text-yellow-700">
          Warning: Resetting the token supply will destroy all existing tokens. This action cannot be
          undone.
        </p>
      </div>
      {error && (
        <ErrorAlert 
          message={error.message} 
          onClose={() => setError(null)}
        />
      )}
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="asset" value={asset} />
        <input type="hidden" name="quantity" value="0" />
        <CheckboxInput
          name="confirm"
          label={`I understand that resetting the supply of ${asset} will destroy all existing tokens.`}
          disabled={pending}
        />

        <FeeRateInput showHelpText={shouldShowHelpText} disabled={pending} />
        
        <Button type="submit" color="blue" fullWidth disabled={pending}>
          {pending ? "Submitting..." : "Continue"}
        </Button>
      </form>
    </div>
  );
}
