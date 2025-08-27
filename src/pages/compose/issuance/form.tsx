"use client";

import { useEffect, useState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Input, Textarea } from "@headlessui/react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { CheckboxInput } from "@/components/inputs/checkbox-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { AssetNameInput } from "@/components/inputs/asset-name-input";
import { AmountWithMaxInput } from "@/components/inputs/amount-with-max-input";
import { InscribeSwitch } from "@/components/inputs/inscribe-switch";
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: parentAssetDetails } = useAssetDetails(initialParentAsset || "");
  
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
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setFileError(null);
    
    if (!file) {
      setSelectedFile(null);
      return;
    }
    
    // Check file size (max 400KB for practical reasons)
    if (file.size > 400 * 1024) {
      setFileError("File size must be less than 400KB");
      setSelectedFile(null);
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
          if (inscribeEnabled && selectedFile) {
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
            <Field>
              <Label className="block text-sm font-medium text-gray-700 mb-2">
                Inscription File <span className="text-red-500">*</span>
              </Label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                <input
                  ref={fileInputRef}
                  id="inscription-file"
                  name="inscription-file"
                  type="file"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={pending}
                />
                
                {selectedFile ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-center gap-2">
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-sm font-medium text-gray-700">{selectedFile.name}</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Size: {(selectedFile.size / 1024).toFixed(2)} KB
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null);
                        setFileError(null);
                        if (fileInputRef.current) {
                          fileInputRef.current.value = '';
                        }
                      }}
                      className="text-xs text-red-600 hover:text-red-700"
                    >
                      Remove file
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={pending}
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      Choose File
                    </button>
                    <p className="text-xs text-gray-500 mt-2">
                      Max file size: 400KB
                    </p>
                  </>
                )}
              </div>
              
              {fileError && (
                <p className="mt-2 text-sm text-red-600">{fileError}</p>
              )}
              
              <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
                Upload a file to inscribe as the asset's description. The file content will be stored permanently on-chain.
              </Description>
            </Field>
          ) : (
            <Field>
              <Label htmlFor="description" className="block text-sm font-medium text-gray-700">
                Description
              </Label>
              <Textarea
                id="description"
                name="description"
                defaultValue={initialFormData?.description || ""}
                className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
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
