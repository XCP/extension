import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { TextAreaInput } from "@/components/ui/inputs/textarea-input";
import { ComposerForm } from "@/components/composer/composer-form";
import { CheckboxInput } from "@/components/ui/inputs/checkbox-input";
import { AssetNameInput } from "@/components/ui/inputs/asset-name-input";
import { AmountWithMaxInput } from "@/components/ui/inputs/amount-with-max-input";
import { SettingSwitch } from "@/components/ui/inputs/setting-switch";
import { InscriptionUploadInput } from "@/components/ui/inputs/file-upload-input";
import { AssetHeader } from "@/components/ui/headers/asset-header";
import { AddressHeader } from "@/components/ui/headers/address-header";
import { useComposer } from "@/contexts/composer-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { toBigNumber } from "@/utils/numeric";
import { isSegwitFormat } from '@/utils/blockchain/bitcoin/address';
import type { IssuanceOptions } from "@/utils/blockchain/counterparty/compose";
import type { ReactElement } from "react";

/** Maximum file size for inscriptions in KB */
const INSCRIPTION_MAX_SIZE_KB = 400;

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
  
  // Form state - normalize quantity from satoshis if returning from review
  const getInitialAmount = (): string => {
    if (!initialFormData?.quantity) return "";
    const qty = initialFormData.quantity.toString();
    // If divisible was set and quantity looks like satoshis, convert back
    if (initialFormData?.divisible && Number(qty) >= 100000000) {
      return toBigNumber(qty).dividedBy(100000000).toString();
    }
    return qty;
  };

  const [assetName, setAssetName] = useState(initialFormData?.asset || (initialParentAsset ? `${initialParentAsset}.` : ""));
  const [isAssetNameValid, setIsAssetNameValid] = useState(false);
  const [amount, setAmount] = useState(getInitialAmount());
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
  const MAX_INT_STR = "9223372036854775807";
  const getMaxAmount = () => {
    if (isDivisible) {
      // For divisible assets, the actual max quantity is MAX_INT,
      // but we need to show it in decimal form (divide by 10^8)
      const maxInt = toBigNumber(MAX_INT_STR);
      const divisor = toBigNumber("100000000"); // 10^8
      const maxDivisible = maxInt.dividedBy(divisor);
      return maxDivisible.toFixed();
    } else {
      // For indivisible assets, max is MAX_INT
      return MAX_INT_STR;
    }
  };

  
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
    if (file && file.size > INSCRIPTION_MAX_SIZE_KB * 1024) {
      setFileError(`File size must be less than ${INSCRIPTION_MAX_SIZE_KB}KB`);
      return;
    }
    setSelectedFile(file);
  };
  
  // Convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = reader.result as string;
        // Remove data URL prefix
        const base64Data = base64.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = error => reject(error);
    });
  };

  // Process form to convert quantity to satoshis and set divisible as string
  const processedFormAction = async (formData: FormData) => {
    // Convert quantity to satoshis if divisible
    const quantityInt = isDivisible
      ? toBigNumber(amount).multipliedBy(100000000).toFixed(0)
      : toBigNumber(amount).toFixed(0);

    formData.set('quantity', quantityInt);
    formData.set('divisible', String(isDivisible));
    formData.set('lock', String(isLocked));

    // If inscribing, convert file to base64 and set as description
    if (inscribeEnabled) {
      if (selectedFile) {
        try {
          const base64Data = await fileToBase64(selectedFile);
          formData.set("description", base64Data);
          formData.set("mime_type", selectedFile.type);
          formData.set("encoding", "taproot");
        } catch (error) {
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
                  supply_normalized: parentAssetDetails.assetInfo.supply_normalized || '0'
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
              onChange={(checked) => {
                setIsDivisible(checked);
                // Adjust amount if changing divisibility
                if (amount) {
                  const currentAmount = toBigNumber(amount);
                  const newMax = toBigNumber(getMaxAmount());
                  
                  // If current amount exceeds new max, set to new max
                  if (currentAmount.isGreaterThan(newMax)) {
                    setAmount(newMax.toFixed());
                  }
                  // If switching from indivisible to divisible and amount is large,
                  // convert it (e.g., 100000000 becomes 1.00000000)
                  else if (checked && currentAmount.isGreaterThan("92233720")) {
                    // If the value is suspiciously large for a divisible asset,
                    // assume it was meant as satoshis and convert
                    const converted = currentAmount.dividedBy("100000000");
                    setAmount(converted.toFixed(8));
                  }
                }
              }}
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
