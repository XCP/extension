"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Input, Textarea } from "@headlessui/react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { CheckboxInput } from "@/components/inputs/checkbox-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { AssetNameInput } from "@/components/inputs/asset-name-input";
import { AmountWithMaxInput } from "@/components/inputs/amount-with-max-input";
import { InscribeSwitch } from "@/components/inputs/inscribe-switch";
import { InscriptionUploadInput } from "@/components/inputs/file-upload-input";
import { useSettings } from "@/contexts/settings-context";
import { formatAmount } from "@/utils/format";
import { toBigNumber } from "@/utils/numeric";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { AssetHeader } from "@/components/headers/asset-header";
import { AddressHeader } from "@/components/headers/address-header";
import { HeaderSkeleton } from "@/components/skeleton";
import { useWallet } from "@/contexts/wallet-context";
import { AddressType } from "@/utils/blockchain/bitcoin";
import type { IssuanceOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

/**
 * Props for the IssuanceForm component, aligned with Composer's formAction.
 */
interface IssuanceFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: IssuanceOptions | null;
  initialParentAsset?: string;
  error?: string | null;
  showHelpText?: boolean;
}

/**
 * Form for issuing a new asset using React 19 Actions.
 */
export function IssuanceForm({
  formAction,
  initialFormData,
  initialParentAsset,
  error: composerError,
  showHelpText,
}: IssuanceFormProps): ReactElement {
  const { settings } = useSettings();
  const { activeAddress, activeWallet } = useWallet();
  const shouldShowHelpText = showHelpText ?? settings?.showHelpText ?? false;
  const { pending } = useFormStatus();
  const [error, setError] = useState<{ message: string; } | null>(null);
  const [assetName, setAssetName] = useState(initialFormData?.asset || (initialParentAsset ? `${initialParentAsset}.` : ""));
  const [isAssetNameValid, setIsAssetNameValid] = useState(false);
  const [amount, setAmount] = useState(initialFormData?.quantity?.toString() || "");
  const [isDivisible, setIsDivisible] = useState(initialFormData?.divisible ?? false);
  const [inscribeEnabled, setInscribeEnabled] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [description, setDescription] = useState(initialFormData?.description || "");
  const { data: parentAssetDetails } = useAssetDetails(initialParentAsset || "");
  
  // Update asset name when initialParentAsset changes (navigation from different asset)
  useEffect(() => {
    if (initialParentAsset && !initialFormData?.asset) {
      setAssetName(`${initialParentAsset}.`);
    }
  }, [initialParentAsset, initialFormData?.asset]);
  
  // Check if active wallet uses SegWit addresses
  const isSegwitAddress = activeWallet?.addressType && [
    AddressType.P2WPKH,
    AddressType.P2SH_P2WPKH,
    AddressType.P2TR
  ].includes(activeWallet.addressType);
  
  // Calculate maximum amount based on divisibility
  // MAX_INT in Counterparty is 2^63 - 1
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

  // Set composer error when it occurs
  useEffect(() => {
    if (composerError) {
      setError({ message: composerError });
    }
  }, [composerError]);

  const showAsset = initialParentAsset && parentAssetDetails?.assetInfo;
  const showAddress = !showAsset && activeAddress;
  
  // Handle file selection
  const handleFileChange = (file: File | null) => {
    setFileError(null);
    if (file && file.size > 400 * 1024) {
      setFileError("File size must be less than 400KB");
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

  return (
    <div className="space-y-4">
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
              supply: parentAssetDetails.assetInfo.supply
            }}
            className="mt-1 mb-5"
          />
        ) : (
          <HeaderSkeleton className="mt-1 mb-5" variant="asset" />
        )
      )}
      
      {showAddress && (
        <AddressHeader
          address={activeAddress.address}
          walletName={activeAddress.name}
          className="mt-1 mb-5"
        />
      )}
      
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        {(error || composerError) && (
          <ErrorAlert 
            message={error?.message || composerError || ""} 
            onClose={() => setError(null)}
          />
        )}
        <form action={async formData => {
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
        }} className="space-y-4">
          <AssetNameInput
            name="asset"
            value={assetName}
            onChange={setAssetName}
            onValidationChange={(isValid) => setIsAssetNameValid(isValid)}
            isSubasset={!!initialParentAsset}
            parentAsset={initialParentAsset}
            disabled={pending}
            showHelpText={shouldShowHelpText}
            required
            autoFocus
          />
          <AmountWithMaxInput
            asset={assetName || "NEW_ASSET"}
            availableBalance="0"
            value={amount}
            onChange={setAmount}
            sat_per_vbyte={0}
            setError={(msg) => setError(msg ? { message: msg } : null)}
            shouldShowHelpText={shouldShowHelpText}
            sourceAddress={activeAddress}
            maxAmount={getMaxAmount()}
            label="Amount"
            name="quantity"
            description={`The quantity of the asset to issue ${isDivisible ? "(up to 8 decimal places)" : "(whole numbers only)"}.`}
            disabled={pending}
            disableMaxButton={false}
            onMaxClick={() => setAmount(getMaxAmount())}
          />
          <div className="grid grid-cols-2 gap-4">
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
              defaultChecked={initialFormData?.lock ?? false}
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
              maxSizeKB={400}
              helpText="Upload a file to inscribe as the asset's description. The file content will be stored permanently on-chain."
              showHelpText={shouldShowHelpText}
            />
          ) : (
            <Field>
              <Label htmlFor="description" className="block text-sm font-medium text-gray-700">
                Description
              </Label>
              <Textarea
                id="description"
                name="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:ring-2 focus:border-blue-500 focus:ring-blue-500"
                rows={4}
                disabled={pending}
              />
              <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
                A textual description for the asset.
              </Description>
            </Field>
          )}
          
          {isSegwitAddress && (
            <InscribeSwitch
              checked={inscribeEnabled}
              onChange={setInscribeEnabled}
              showHelpText={shouldShowHelpText}
              disabled={pending}
            />
          )}

          <FeeRateInput showHelpText={shouldShowHelpText} disabled={pending} />
          <Button type="submit" color="blue" fullWidth disabled={pending || !isAssetNameValid || (inscribeEnabled && !selectedFile)}>
            {pending ? "Submitting..." : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
