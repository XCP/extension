"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Field, Description } from "@headlessui/react";
import { ComposeForm } from "@/components/compose-form";
import { Spinner } from "@/components/spinner";
import { AssetHeader } from "@/components/headers/asset-header";
import { useComposer } from "@/contexts/composer-context";
import { useAssetInfo } from "@/hooks/useAssetInfo";
import type { IssuanceOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

/**
 * Props for the LockDescriptionForm component, aligned with Composer's formAction.
 */
interface LockDescriptionFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: IssuanceOptions | null;
  asset: string;
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
}: LockDescriptionFormProps): ReactElement {
  const { showHelpText } = useComposer();
  const { error: assetError, data: assetInfo, isLoading: assetLoading } = useAssetInfo(asset);
  const { pending } = useFormStatus();

  if (assetLoading) {
    return <Spinner message="Loading asset details..." />;
  }

  if (assetError || !assetInfo) {
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
  const currentDescription = assetInfo?.description || "";
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
    <ComposeForm
      formAction={formAction}
      header={
        <AssetHeader
          assetInfo={{
            asset: asset,
            asset_longname: assetInfo?.asset_longname || null,
            description: assetInfo?.description,
            issuer: assetInfo?.issuer,
            divisible: assetInfo?.divisible ?? false,
            locked: assetInfo?.locked ?? false,
            supply: assetInfo?.supply,
            supply_normalized: assetInfo?.supply_normalized || '0'
          }}
          className="mt-1 mb-5"
        />
      }
      submitText="Lock Description Permanently"
    >
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
          {/* Hidden fields for the issuance parameters */}
          <input type="hidden" name="asset" value={asset} />
          <input type="hidden" name="quantity" value="0" />
          <input type="hidden" name="description" value="LOCK" />
          
      {showHelpText && (
        <Field>
          <Description className="text-sm text-gray-500">
            This action will permanently lock the description for {asset}. 
            The current description "{currentDescription || "(empty)"}" will be the final description forever.
          </Description>
        </Field>
      )}
    </ComposeForm>
  );
}