import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { ComposerForm } from "@/components/composer/composer-form";
import { AddressHeader } from "@/components/domain/address/address-header";
import { AssetHeader } from "@/components/domain/asset/asset-header";
import { AssetNameInput } from "@/components/domain/asset/asset-name-input";
import { AmountWithMaxInput } from "@/components/domain/balance/amount-with-max-input";
import { CheckboxInput } from "@/components/ui/inputs/checkbox-input";
import { InscriptionUploadInput } from "@/components/ui/inputs/file-upload-input";
import { SettingSwitch } from "@/components/ui/inputs/setting-switch";
import { TextAreaInput } from "@/components/ui/inputs/textarea-input";
import { useComposer } from "@/contexts/composer-context-object";
import { isSegwitFormat } from '@/core/bitcoin/address';
import { type IssuanceOptions, MAX_INSCRIPTION_FILE_BYTES } from "@/core/counterparty/compose";
import { encodeInscriptionContent } from '@/core/counterparty/inscriptionEnvelope';
import { asDisplayUnits } from '@/core/numeric';
import { maxSupplyForDivisibility } from "@/core/validation/amount";
import { useAssetDetails } from "@/hooks/useAssetDetails";

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

/**
 * Props for the IssuanceForm component, aligned with Composer's formAction.
 */
interface IssuanceFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: IssuanceOptions | null;
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
  const [isDivisible, setIsDivisible] = useState(initialFormData?.divisible ?? false);
  const [isLocked, setIsLocked] = useState(initialFormData?.lock ?? false);
  const [description, setDescription] = useState(initialFormData?.description || "");
  const [isInitializing, setIsInitializing] = useState<boolean>(!!initialParentAsset); // Loading state for parent asset
  
  // Inscription state
  const [inscribeEnabled, setInscribeEnabled] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  
  // Computed values
  const isSegwitAddress = activeWallet?.addressFormat && isSegwitFormat(activeWallet.addressFormat);
  
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
  
  // Handlers
  const handleFileChange = (file: File | null) => {
    setFileError(null);
    if (file && file.size > MAX_INSCRIPTION_FILE_BYTES) {
      setFileError(`File size must be less than ${INSCRIPTION_MAX_SIZE_KB}KB`);
      return;
    }
    setSelectedFile(file);
  };
  


  const processedFormAction = async (formData: FormData) => {
    formData.set('quantity', amount);
    formData.set('divisible', String(isDivisible));
    formData.set('lock', String(isLocked));

    // If inscribing, the content travels in `description` — hex-encoded unless the MIME type is
    // textual — and `inscription` is the boolean flag that selects core's ord envelope path.
    if (inscribeEnabled) {
      if (selectedFile) {
        try {
          const bytes = new Uint8Array(await selectedFile.arrayBuffer());
          const mimeType = selectedFile.type || "application/octet-stream";
          formData.set("description", encodeInscriptionContent(bytes, mimeType));
          formData.set("inscription", "true");
          formData.set("mime_type", mimeType);
          formData.set("encoding", "taproot");
        } catch (_error) {
          setFileError("Failed to process file");
          return;
        }
      }
    } else {
      // Use the text description if not inscribing
      formData.set("description", description);
    }

    formAction(formData);
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
      submitDisabled={!isAssetNameValid || (inscribeEnabled && !selectedFile)}
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
            label="Amount"
            name="quantity"
            description="The quantity of the asset to issue."
            disabled={pending}
            disableMaxButton={false}
            onMaxClick={() => setAmount(getMaxAmount())}
            isDivisible={isDivisible}
          />
          <div className="grid grid-cols-3 gap-4">
            <CheckboxInput
              name="divisible"
              label="Divisible"
              defaultChecked={isDivisible}
              onChange={setIsDivisible}
              disabled={pending}
            />
            <CheckboxInput
              name="lock"
              label="Locked"
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
              helpText="Upload a file to inscribe as the asset's description. The file content will be stored permanently on-chain."
              showHelpText={showHelpText}
            />
          ) : (
            <TextAreaInput
              value={description}
              onChange={setDescription}
              label="Description"
              rows={1}
              disabled={pending}
              showHelpText={showHelpText}
              helpText="A textual description for the asset."
            />
          )}
          
          {isSegwitAddress && (
            <SettingSwitch
              label="Inscribe?"
              description="Store message as a Taproot inscription (on-chain)"
              checked={inscribeEnabled}
              onChange={setInscribeEnabled}
              showHelpText={showHelpText}
              disabled={pending}
            />
          )}

    </ComposerForm>
  );
}
