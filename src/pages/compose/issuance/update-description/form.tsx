import { Description, Field, Label, Textarea } from "@headlessui/react";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ComposerForm } from "@/components/composer/composer-form";
import { type FormValues, formBoolean } from "@/components/composer/form-values";
import { AssetHeader } from "@/components/domain/asset/asset-header";
import { InscriptionUploadInput } from "@/components/ui/inputs/file-upload-input";
import { SettingSwitch } from "@/components/ui/inputs/setting-switch";
import { Spinner } from "@/components/ui/spinner";
import { useComposer } from "@/contexts/composer-context-object";
import { type IssuanceOptions, MAX_INSCRIPTION_FILE_BYTES } from "@/core/counterparty/compose";
import { canInscribe } from '@/core/counterparty/taprootEncoding';
import { asDisplayUnits } from '@/core/numeric';
import { useAssetInfo } from "@/hooks/useAssetInfo";
import { type InscriptionUploadDraft, useInscriptionUpload } from '@/hooks/useInscriptionUpload';

import { t } from '@/i18n';

/** Maximum file size for inscriptions in KB; see the compose layer for where it comes from. */
const INSCRIPTION_MAX_SIZE_KB = MAX_INSCRIPTION_FILE_BYTES / 1024;

interface UpdateDescriptionFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: (FormValues<IssuanceOptions> & InscriptionUploadDraft) | null;
  asset: string;
}

/**
 * Form for updating asset description using React 19 Actions.
 */
export function UpdateDescriptionForm({
  formAction,
  initialFormData,
  asset,
}: UpdateDescriptionFormProps): ReactElement {
  const { activeAddress, activeWallet, showHelpText } = useComposer();
  const { error: assetError, data: assetInfo, isLoading: assetLoading } = useAssetInfo(asset);
  const { pending } = useFormStatus();
  const { enabled: inscribeEnabled, setEnabled: setInscribeEnabled, file: selectedFile,
    error: fileError, onFileChange: handleFileChange, prepareFormData } = useInscriptionUpload(initialFormData, 'description');
  const [description, setDescription] = useState(formBoolean(initialFormData?.inscription) ? '' : initialFormData?.description || "");
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  
  // Check if active wallet uses SegWit addresses
  const inscribeAvailable = canInscribe(activeAddress?.address, activeWallet?.type);

  // Focus description textarea on mount. Listing inscribeEnabled would steal focus back every
  // time the user toggles inscribe.
  useEffect(() => {
    if (!inscribeEnabled) {
      descriptionRef.current?.focus();
    }
  }, []);

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
  if (asset === "BTC") return <div className="p-4 text-red-500">{t('update_description_form_cannot_update_description_of_btc')}</div>;

  return (
    <ComposerForm
      formAction={async formData => {
        if (inscribeEnabled && !inscribeAvailable) return;
        if (!await prepareFormData(formData)) return;
        if (!inscribeEnabled) formData.set('description', description);
        await formAction(formData);
      }}
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
      submitDisabled={inscribeEnabled && (!selectedFile || !inscribeAvailable)}
    >
          <input type="hidden" name="asset" value={asset} />
          <input type="hidden" name="quantity" value="0" />
          <input type="hidden" name="divisible" value={String(assetInfo?.divisible ?? false)} />
          
          {/* Only show inscribe switch for SegWit addresses */}
          {inscribeAvailable && (
            <SettingSwitch
              label={t('common_inscribe')}
              description={t('common_store_message_as_a_taproot')}
              checked={inscribeEnabled}
              onChange={setInscribeEnabled}
              showHelpText={showHelpText}
              disabled={pending}
            />
          )}
          
          {inscribeEnabled ? (
            <>
              <InscriptionUploadInput
                selectedFile={selectedFile}
                onFileChange={handleFileChange}
                disabled={pending}
                error={fileError}
                maxSizeKB={INSCRIPTION_MAX_SIZE_KB}
                showHelpText={showHelpText}
              />
            </>
          ) : (
            <Field>
              <Label htmlFor="description" className="block text-sm font-medium text-gray-700">
                
                {t('common_description')} <span className="text-red-500">*</span>
              </Label>
              <Textarea
                ref={descriptionRef}
                id="description"
                name="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
                rows={3}
                required
                disabled={pending}
              />
              {showHelpText && (
                <Description className="mt-2 text-sm text-gray-500">
                  {t('update_description_form_enter_a_new_description_for')}
                </Description>
              )}
            </Field>
          )}

    </ComposerForm>
  );
}
