
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label } from "@headlessui/react";
import { ComposerForm } from "@/components/composer-form";
import { Spinner } from "@/components/spinner";
import { AssetHeader } from "@/components/headers/asset-header";
import { CheckboxInput } from "@/components/inputs/checkbox-input";
import { useComposer } from "@/contexts/composer-context";
import { useAssetInfo } from "@/hooks/useAssetInfo";
import type { IssuanceOptions } from "@/utils/blockchain/counterparty/compose";
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
  const {} = useComposer();
  const { error: assetError, data: assetInfo, isLoading: assetLoading } = useAssetInfo(asset);
  const { pending } = useFormStatus();
  const [isChecked, setIsChecked] = useState(false);

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

  const handleCheckboxChange = (checked: boolean) => {
    setIsChecked(checked);
  };

  return (
    <ComposerForm
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
      submitText="Continue"
      submitDisabled={!isChecked}
    >
      <Field>
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
          <p className="text-sm text-yellow-700">
            Locking the description is permanent and irreversible. Once locked, you will never be able to change the asset description again.
          </p>
          {currentDescription && (
            <div className="mt-3 pt-3 border-t border-yellow-200">
              <p className="text-xs text-yellow-600">Current description:</p>
              <p className="text-sm font-medium text-yellow-700 mt-1">{currentDescription}</p>
            </div>
          )}
        </div>
        
        <div className="mb-2">
          <Label className="text-sm font-medium text-gray-700">Confirmation</Label>
        </div>
        
        <CheckboxInput
          name="confirm"
          label={`I understand that locking the description for ${asset} is permanent and cannot be undone`}
          disabled={pending}
          checked={isChecked}
          onChange={handleCheckboxChange}
        />
        
        {/* Hidden fields for the issuance parameters */}
        <input type="hidden" name="asset" value={asset} />
        <input type="hidden" name="quantity" value="0" />
        <input type="hidden" name="description" value="LOCK" />
      </Field>
    </ComposerForm>
  );
}