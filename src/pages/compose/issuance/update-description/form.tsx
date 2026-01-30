import { useEffect, useState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Textarea } from "@headlessui/react";
import { ComposerForm } from "@/components/composer/composer-form";
import { Spinner } from "@/components/ui/spinner";
import { SettingSwitch } from "@/components/ui/inputs/setting-switch";
import { InscriptionUploadInput } from "@/components/ui/inputs/file-upload-input";
import { useComposer } from "@/contexts/composer-context";
import { useAssetInfo } from "@/hooks/useAssetInfo";
import { isSegwitFormat } from '@/utils/blockchain/bitcoin/address';
import type { IssuanceOptions } from "@/utils/blockchain/counterparty/compose";
import { AssetHeader } from "@/components/ui/headers/asset-header";
import type { ReactElement } from "react";

/**
 * Props for the UpdateDescriptionForm component, aligned with Composer's formAction.
 */
interface UpdateDescriptionFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: IssuanceOptions | null;
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
  const { activeWallet, showHelpText } = useComposer();
  const { error: assetError, data: assetInfo, isLoading: assetLoading } = useAssetInfo(asset);
  const { pending } = useFormStatus();
  const [inscribeEnabled, setInscribeEnabled] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [description, setDescription] = useState(initialFormData?.description || "");
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  
  // Check if active wallet uses SegWit addresses
  const isSegwitAddress = activeWallet?.addressFormat && isSegwitFormat(activeWallet.addressFormat);

  // Handle file selection
  const handleFileChange = (file: File | null) => {
    setFileError(null);
    if (file && file.size > 400 * 1024) {
      setFileError("File size must be less than 400KB");
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
    if (file) {
      // When a file is selected, set description to the file name
      setDescription(file.name);
    }
  };


  // Focus description textarea on mount
  useEffect(() => {
    if (!inscribeEnabled) {
      descriptionRef.current?.focus();
    }
  }, []);

  if (assetLoading) {
    return <Spinner message="Loading asset details…" />;
  }

  if (assetError || !assetInfo) {
    return (
      <div className="p-4 text-red-500">
        Unable to load asset details. Please ensure the asset exists and you have the necessary
        permissions.
      </div>
    );
  }
  if (asset === "BTC") return <div className="p-4 text-red-500">Cannot update description of BTC</div>;

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
      submitDisabled={inscribeEnabled && !selectedFile}
    >
          <input type="hidden" name="asset" value={asset} />
          <input type="hidden" name="quantity" value="0" />
          <input type="hidden" name="divisible" value={String(assetInfo?.divisible ?? false)} />
          
          {/* Only show inscribe switch for SegWit addresses */}
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
          
          {inscribeEnabled ? (
            <>
              <InscriptionUploadInput
                selectedFile={selectedFile}
                onFileChange={handleFileChange}
                disabled={pending}
                error={fileError}
                showHelpText={showHelpText}
              />
              {selectedFile && (
                <input type="hidden" name="description" value={description} />
              )}
            </>
          ) : (
            <Field>
              <Label htmlFor="description" className="block text-sm font-medium text-gray-700">
                Description <span className="text-red-500">*</span>
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
                  Enter a new description for the asset to use.
                </Description>
              )}
            </Field>
          )}

    </ComposerForm>
  );
}
