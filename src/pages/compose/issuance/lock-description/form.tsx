import { Field, Label } from "@headlessui/react";
import type { ReactElement } from "react";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { ComposerForm } from "@/components/composer/composer-form";
import { AssetHeader } from "@/components/domain/asset/asset-header";
import { CheckboxInput } from "@/components/ui/inputs/checkbox-input";
import { Spinner } from "@/components/ui/spinner";
import { useComposer } from "@/contexts/composer-context-object";
import type { IssuanceOptions } from "@/core/counterparty/compose";
import { asDisplayUnits } from '@/core/numeric';
import { useAssetInfo } from "@/hooks/useAssetInfo";

import { t } from '@/i18n';

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
 *
 * The transaction is an issuance whose description is the sentinel "LOCK_DESCRIPTION", which
 * `issuance.parse` matches to set `description_locked` while leaving the stored description
 * untouched. Note that "LOCK" is a *different* sentinel handled in the same branch: it sets
 * `lock`, permanently freezing the supply. The two are one `elif` apart and neither is reversible,
 * so this string is not a label — it is the instruction.
 */
export function LockDescriptionForm({
  formAction,
  initialFormData,
  asset,
}: LockDescriptionFormProps): ReactElement {
  useComposer();
  const { error: assetError, data: assetInfo, isLoading: assetLoading } = useAssetInfo(asset);
  const { pending } = useFormStatus();
  const [isChecked, setIsChecked] = useState(false);

  if (assetLoading) {
    return <Spinner message={t('common_loading_asset_details')} />;
  }

  if (assetError || !assetInfo) {
    return (
      <div className="p-4 text-red-500">
        {t('common_unable_to_load_asset_details')}
      </div>
    );
  }
  
  if (asset === "BTC") {
    return <div className="p-4 text-red-500">{t('lock_description_form_cannot_lock_description_of_btc')}</div>;
  }

  // The description being frozen here, shown so the user can see what they are freezing.
  const currentDescription = assetInfo?.description || "";
  // Whether the description is locked is its own field. Comparing the description text to "LOCK"
  // asked whether the sentinel had been stored as the description, which core never does: it
  // rewrites the description back to the previous one and records the lock in a flag.
  const isAlreadyLocked = assetInfo?.description_locked ?? false;

  if (isAlreadyLocked) {
    return (
      <div className="p-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
          <p className="text-yellow-800">
            {t('lock_description_form_the_description_for_this_asset')}
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
            supply_normalized: asDisplayUnits(assetInfo?.supply_normalized || '0')
          }}
          className="mt-1 mb-5"
        />
      }
      submitText={t('common_continue')}
      submitDisabled={!isChecked}
    >
      <Field>
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
          <p className="text-sm text-yellow-700">
            {t('lock_description_form_locking_the_description_is_permanent')}
          </p>
          {currentDescription && (
            <div className="mt-3 pt-3 border-t border-yellow-200">
              <p className="text-xs text-yellow-600">{t('lock_description_form_current_description')}</p>
              <p className="text-sm font-medium text-yellow-700 mt-1">{currentDescription}</p>
            </div>
          )}
        </div>
        
        <div className="mb-2">
          <Label className="text-sm font-medium text-gray-700">{t('common_confirmation')}</Label>
        </div>
        
        <CheckboxInput
          name="confirm"
          label={t('common_i_understand_this_cannot_be')}
          disabled={pending}
          checked={isChecked}
          onChange={handleCheckboxChange}
        />
        
        {/* Hidden fields for the issuance parameters */}
        <input type="hidden" name="asset" value={asset} />
        <input type="hidden" name="quantity" value="0" />
        <input type="hidden" name="description" value="LOCK_DESCRIPTION" />
        <input type="hidden" name="divisible" value={String(assetInfo?.divisible ?? false)} />
      </Field>
    </ComposerForm>
  );
}