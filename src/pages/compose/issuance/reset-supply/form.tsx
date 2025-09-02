"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { ComposeForm } from "@/components/forms/compose-form";
import { CheckboxInput } from "@/components/inputs/checkbox-input";
import { useComposer } from "@/contexts/composer-context";
import { useAssetInfo } from "@/hooks/useAssetInfo";
import type { IssuanceOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

/**
 * Props for the ResetSupplyForm component, aligned with Composer's formAction.
 */
interface ResetSupplyFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: IssuanceOptions | null;
  asset: string;
}

/**
 * Form for resetting asset supply using React 19 Actions.
 */
export function ResetSupplyForm({
  formAction,
  initialFormData,
  asset,
}: ResetSupplyFormProps): ReactElement {
  // Context hooks
  const { showHelpText } = useComposer();
  
  // Data fetching hooks
  const { error: assetError, data: assetInfo } = useAssetInfo(asset);
  
  // Form status
  const { pending } = useFormStatus();

  // Early returns
  if (assetError || !assetInfo) {
    return <div className="p-4 text-red-500">Error loading asset details: {assetError?.message}</div>;
  }

  return (
    <ComposeForm
      formAction={formAction}
    >
      <div className="mb-4 p-3 bg-gray-50 rounded-md">
        <h3 className="text-sm font-medium text-gray-700">Asset Details</h3>
        <div className="mt-2 text-sm text-gray-600">
          <p>Current Supply: {assetInfo?.supply || "0"}</p>
          <p>Divisible: {assetInfo?.divisible ? "Yes" : "No"}</p>
          <p>Locked: {assetInfo?.locked ? "Yes" : "No"}</p>
        </div>
      </div>
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
        <p className="text-sm text-yellow-700">
          Warning: Resetting the token supply will destroy all existing tokens. This action cannot be
          undone.
        </p>
      </div>
        <input type="hidden" name="asset" value={asset} />
        <input type="hidden" name="quantity" value="0" />
        <CheckboxInput
          name="confirm"
          label={`I understand that resetting the supply of ${asset} will destroy all existing tokens.`}
          disabled={pending}
        />

    </ComposeForm>
  );
}
