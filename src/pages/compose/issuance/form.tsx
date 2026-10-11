import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { ComposerForm } from "@/components/composer/composer-form";
import { type FormValues, formBoolean } from "@/components/composer/form-values";
import { AddressHeader } from "@/components/domain/address/address-header";
import { AssetHeader } from "@/components/domain/asset/asset-header";
import { AssetNameInput } from "@/components/domain/asset/asset-name-input";
import { AmountWithMaxInput } from "@/components/domain/balance/amount-with-max-input";
import { CheckboxInput } from "@/components/ui/inputs/checkbox-input";
import { InscriptionUploadInput } from "@/components/ui/inputs/file-upload-input";
import { SettingSwitch } from "@/components/ui/inputs/setting-switch";
import { TextAreaInput } from "@/components/ui/inputs/textarea-input";
import { useComposer } from "@/contexts/composer-context-object";
import { type IssuanceOptions, MAX_INSCRIPTION_FILE_BYTES } from "@/core/counterparty/compose";
import { canInscribe } from '@/core/counterparty/taprootEncoding';
import { asDisplayUnits } from '@/core/numeric';
import { maxSupplyForDivisibility } from "@/core/validation/amount";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { type InscriptionUploadDraft, useInscriptionUpload } from '@/hooks/useInscriptionUpload';

import { t } from '@/i18n';

/**
 * Maximum file size for inscriptions in KB.
 *
 * Read from the compose layer rather than stated here: the two disagreed, and the form won the
 * argument in the worst way. It advertised 400KB while a compose carried the file in the request
 * URL, where anything past ~15KB was refused by the node's front door — with no CORS headers, so
 * the browser reported it as a failed fetch and the wallet said "Network error. Please check your
 * internet connection." Compose now posts a body when the URL would overflow; this is what that
 * body can actually hold.
 */
const INSCRIPTION_MAX_SIZE_KB = MAX_INSCRIPTION_FILE_BYTES / 1024;

interface IssuanceFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: (FormValues<IssuanceOptions> & InscriptionUploadDraft) | null;
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
  // Context hooks
  const { activeAddress, activeWallet, showHelpText } = useComposer();
  
  // Data fetching hooks
  const { data: parentAssetDetails } = useAssetDetails(initialParentAsset || "");
  
  // Form status
  const { pending } = useFormStatus();
  
  const [assetName, setAssetName] = useState(initialFormData?.asset || (initialParentAsset ? `${initialParentAsset}.` : ""));
  const [isAssetNameValid, setIsAssetNameValid] = useState(false);
  const [amount, setAmount] = useState(initialFormData?.quantity?.toString() || "");
  const [isDivisible, setIsDivisible] = useState(formBoolean(initialFormData?.divisible) ?? false);
  const [isLocked, setIsLocked] = useState(formBoolean(initialFormData?.lock) ?? false);
  const [description, setDescription] = useState(formBoolean(initialFormData?.inscription) ? '' : initialFormData?.description || "");
  const [isInitializing, setIsInitializing] = useState<boolean>(!!initialParentAsset); // Loading state for parent asset
  
  const { enabled: inscribeEnabled, setEnabled: setInscribeEnabled, file: selectedFile,
    error: fileError, onFileChange: handleFileChange, prepareFormData } = useInscriptionUpload(initialFormData, 'description');
  
  // Computed values
  const inscribeAvailable = canInscribe(activeAddress?.address, activeWallet?.type);
  
  const showAsset = initialParentAsset && parentAssetDetails?.assetInfo;
  const showAddress = !showAsset && activeAddress && !isInitializing;
  
  // Calculate maximum amount based on divisibility
  const getMaxAmount = () => maxSupplyForDivisibility(isDivisible);

  
  // Update asset name when initialParentAsset changes
  useEffect(() => {
    if (initialParentAsset && !initialFormData?.asset) {
      setAssetName(`${initialParentAsset}.`);
    }
  }, [initialParentAsset, initialFormData?.asset]);
  
  // Clear initializing state when parent asset details load
  useEffect(() => {
    if (initialParentAsset && parentAssetDetails?.assetInfo) {
      setIsInitializing(false);
    }
  }, [initialParentAsset, parentAssetDetails]);
  
  const processedFormAction = async (formData: FormData) => {
    formData.set('quantity', amount);
    formData.set('divisible', String(isDivisible));
    formData.set('lock', String(isLocked));

    if (inscribeEnabled && !inscribeAvailable) return;
    if (!await prepareFormData(formData)) return;
    if (!inscribeEnabled) formData.set("description", description);
    await formAction(formData);
  };

  return (
    <ComposerForm
      formAction={processedFormAction}
      header={
        <>
          {initialParentAsset && (
            parentAssetDetails?.assetInfo ? (
              <AssetHeader
                assetInfo={{
                  asset: initialParentAsset,
                  asset_longname: parentAssetDetails.assetInfo.asset_longname || null,
                  description: parentAssetDetails.assetInfo.description,
                  issuer: parentAssetDetails.assetInfo.issuer,
                  divisible: parentAssetDetails.assetInfo.divisible ?? false,
                  locked: parentAssetDetails.assetInfo.locked ?? false,
                  supply: parentAssetDetails.assetInfo.supply,
                  supply_normalized: asDisplayUnits(parentAssetDetails.assetInfo.supply_normalized || '0')
                }}
                className="mt-1 mb-5"
              />
            ) : null
          )}
          
          {showAddress && (
            <AddressHeader
              address={activeAddress.address}
              walletName={activeAddress.name}
              className="mt-1 mb-5"
            />
          )}
        </>
      }
      submitDisabled={!isAssetNameValid || (inscribeEnabled && (!selectedFile || !inscribeAvailable))}
    >
          <AssetNameInput
            name="asset"
            value={assetName}
            onChange={setAssetName}
            onValidationChange={(isValid) => setIsAssetNameValid(isValid)}
            isSubasset={!!initialParentAsset}
            parentAsset={initialParentAsset}
            disabled={pending}
            showHelpText={showHelpText}
            showRandomNumeric={!initialParentAsset}
            required
            autoFocus
          />
          <AmountWithMaxInput
            asset={assetName || "NEW_ASSET"}
            availableBalance="0"
            value={amount}
            onChange={setAmount}
            setError={(msg) => {}}
            showHelpText={showHelpText}
            sourceAddress={activeAddress}
            maxAmount={getMaxAmount()}
            label={t('common_amount')}
            name="quantity"
            description={t('issuance_form_the_quantity_of_the_asset')}
            disabled={pending}
            disableMaxButton={false}
            onMaxClick={() => setAmount(getMaxAmount())}
            isDivisible={isDivisible}
          />
          <div className="grid grid-cols-3 gap-4">
            <CheckboxInput
              name="divisible"
              label={t('common_divisible')}
              defaultChecked={isDivisible}
              onChange={setIsDivisible}
              disabled={pending}
            />
            <CheckboxInput
              name="lock"
              label={t('common_locked')}
              defaultChecked={isLocked}
              onChange={(checked) => setIsLocked(checked)}
              disabled={pending}
            />
          </div>
          {inscribeEnabled ? (
            <InscriptionUploadInput
              required
              selectedFile={selectedFile}
              onFileChange={handleFileChange}
              error={fileError}
              disabled={pending}
              maxSizeKB={INSCRIPTION_MAX_SIZE_KB}
              helpText={t('issuance_form_upload_a_file_to_inscribe')}
              showHelpText={showHelpText}
            />
          ) : (
            <TextAreaInput
              value={description}
              onChange={setDescription}
              label={t('common_description')}
              rows={1}
              disabled={pending}
              showHelpText={showHelpText}
              helpText={t('issuance_form_a_textual_description_for_the')}
            />
          )}
          
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

    </ComposerForm>
  );
}
