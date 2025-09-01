"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Textarea, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { AddressHeader } from "@/components/headers/address-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { SettingSwitch } from "@/components/inputs/setting-switch";
import { InscriptionUploadInput } from "@/components/inputs/file-upload-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { AddressType } from "@/utils/blockchain/bitcoin";
import type { BroadcastOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

/**
 * Props for the BroadcastForm component, aligned with Composer's formAction.
 */
interface BroadcastFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: BroadcastOptions | null;
  error?: string | null;
  showHelpText?: boolean;
}

/**
 * Form for composing a broadcast transaction using React 19 Actions.
 * @param {BroadcastFormProps} props - Component props
 * @returns {ReactElement} Broadcast form UI
 */
export function BroadcastForm({ 
  formAction, 
  initialFormData, 
  error: composerError, 
  showHelpText 
}: BroadcastFormProps): ReactElement {
  // Context hooks
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = showHelpText ?? settings?.showHelpText ?? false;
  const showAdvancedOptions = settings?.enableAdvancedBroadcasts ?? false;
  
  // Form status
  const { pending } = useFormStatus();
  
  // Error state management
  const [error, setError] = useState<{ message: string } | null>(null);
  
  // Form state
  const [textContent, setTextContent] = useState(initialFormData?.text || "");
  
  // Inscription state
  const [inscribeEnabled, setInscribeEnabled] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  
  // Computed values
  const isSegwitAddress = activeWallet?.addressType && [
    AddressType.P2WPKH,
    AddressType.P2SH_P2WPKH, 
    AddressType.P2TR
  ].includes(activeWallet.addressType);
  
  // Effects - composer error first
  useEffect(() => {
    if (composerError) {
      setError({ message: composerError });
    }
  }, [composerError]);

  // Focus textarea on mount (only if not inscribing)
  useEffect(() => {
    if (!inscribeEnabled) {
      const textarea = document.querySelector("textarea[name='text']") as HTMLTextAreaElement;
      textarea?.focus();
    }
  }, [inscribeEnabled]);
  
  // Handlers
  const handleFileChange = (file: File | null) => {
    setFileError(null);
    if (file && file.size > 400 * 1024) {
      setFileError("File size must be less than 400KB");
      return;
    }
    setSelectedFile(file);
  };
  
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = reader.result as string;
        const base64Data = base64.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = error => reject(error);
    });
  };

  return (
    <div className="space-y-4">
      {activeAddress && (
        <AddressHeader
          address={activeAddress.address}
          walletName={activeWallet?.name ?? ""}
          className="mt-1 mb-5"
        />
      )}
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        {error && (
          <ErrorAlert
            message={error.message}
            onClose={() => setError(null)}
          />
        )}
        <form action={async formData => {
          // Ensure defaults for optional fields
          if (!formData.get("value") || formData.get("value") === "") {
            formData.set("value", "0");
          }
          if (!formData.get("fee_fraction") || formData.get("fee_fraction") === "") {
            formData.set("fee_fraction", "0");
          }
          
          // Handle inscription mode
          if (inscribeEnabled && selectedFile) {
            try {
              // Convert file to base64 for inscription
              const base64Data = await fileToBase64(selectedFile);
              formData.set("inscription", base64Data);
              formData.set("mime_type", selectedFile.type || "application/octet-stream");
              formData.set("encoding", "taproot");
              formData.set("text", `Inscribed ${selectedFile.name}`); // Description for the broadcast
            } catch (error) {
              setFileError("Failed to process file");
              return;
            }
          } else {
            // Regular text broadcast
            formData.set("text", textContent);
          }
          
          formAction(formData);
        }} className="space-y-4">
          {inscribeEnabled ? (
            <InscriptionUploadInput
              required
              selectedFile={selectedFile}
              onFileChange={handleFileChange}
              error={fileError}
              disabled={pending}
              maxSizeKB={400}
              helpText="Upload a file to inscribe as the broadcast message. The file content will be stored permanently on-chain. To broadcast text, upload a .txt file."
              showHelpText={shouldShowHelpText}
            />
          ) : (
            <Field>
              <Label htmlFor="text" className="block text-sm font-medium text-gray-700">
                Message <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="text"
                name="text"
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 hover:border-gray-400"
                required
                rows={4}
                disabled={pending}
              />
              <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
                Enter the message you want to broadcast.
              </Description>
            </Field>
          )}

          {isSegwitAddress && (
            <SettingSwitch
              label="Inscribe?"
              description="Store message as a Taproot inscription (on-chain)"
              checked={inscribeEnabled}
              onChange={setInscribeEnabled}
              showHelpText={shouldShowHelpText}
              disabled={pending}
            />
          )}

          {showAdvancedOptions && (
            <>
              <Field>
                <Label htmlFor="value" className="block text-sm font-medium text-gray-700">
                  Value
                </Label>
                <Input
                  id="value"
                  name="value"
                  type="text"
                  inputMode="numeric"
                  pattern="\d*"
                  defaultValue={initialFormData?.value || ""}
                  className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 hover:border-gray-400"
                  placeholder="0"
                  disabled={pending}
                />
                <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
                  Optional numeric value if publishing data.
                </Description>
              </Field>

              <Field>
                <Label htmlFor="fee_fraction" className="block text-sm font-medium text-gray-700">
                  Fee Fraction
                </Label>
                <Input
                  id="fee_fraction"
                  name="fee_fraction"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*\.?[0-9]*"
                  defaultValue={initialFormData?.fee_fraction || ""}
                  className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 hover:border-gray-400"
                  placeholder="0"
                  disabled={pending}
                />
                <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
                  Optional fee fraction for paid broadcasts (e.g., 0.05 for 5%).
                </Description>
              </Field>
            </>
          )}

          {/* Add hidden inputs for when advanced options are disabled */}
          {!showAdvancedOptions && (
            <>
              <input type="hidden" name="value" value="0" />
              <input type="hidden" name="fee_fraction" value="0" />
            </>
          )}
          
          {/* Hidden input for encoding */}
          {inscribeEnabled && <input type="hidden" name="encoding" value="taproot" />}

          <FeeRateInput showHelpText={shouldShowHelpText} disabled={pending} />

          <Button type="submit" color="blue" fullWidth disabled={pending || (inscribeEnabled && !selectedFile) || (!inscribeEnabled && !textContent)}>
            {pending ? "Submitting..." : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}