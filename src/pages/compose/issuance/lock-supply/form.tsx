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
 * Props for the LockSupplyForm component, aligned with Composer's formAction.
 */
interface LockSupplyFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: IssuanceOptions | null;
  asset: string;
  error?: string | null;
  showHelpText?: boolean;
}

/**
 * Form for locking asset supply using React 19 Actions.
 */
export function LockSupplyForm({
  formAction,
  initialFormData,
  asset,
  error: composerError,
  showHelpText,
}: LockSupplyFormProps): ReactElement {
  // Context hooks
  const { settings } = useSettings();
  const shouldShowHelpText = showHelpText ?? settings?.showHelpText ?? false;
  
  // Data fetching hooks
  const { error: assetError, data: assetDetails } = useAssetDetails(asset);
  
  // Form status
  const { pending } = useFormStatus();
  
  // Error state management
  const [error, setError] = useState<{ message: string } | null>(null);

  // Effects - composer error first
  useEffect(() => {
    if (composerError) {
      setError({ message: composerError });
    }
  }, [composerError]);

  // Early returns
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
          Warning: Locking the token supply is an irreversible action. Once locked, you will not be
          able to create additional tokens.
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
          label={`I understand that locking the supply of ${asset} is permanent and cannot be undone.`}
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
