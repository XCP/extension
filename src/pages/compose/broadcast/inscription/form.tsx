"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { AddressHeader } from "@/components/headers/address-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { InscriptionUploadInput } from "@/components/inputs/file-upload-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import type { BroadcastOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

/**
 * Props for the BroadcastInscriptionForm component
 */
interface BroadcastInscriptionFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: BroadcastOptions | null;
  error?: string | null;
  showHelpText?: boolean;
}


/**
 * Form for composing a broadcast inscription transaction
 */
export function BroadcastInscriptionForm({ formAction, initialFormData ,
  error: composerError,
  showHelpText,
}: BroadcastInscriptionFormProps): ReactElement {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = showHelpText ?? settings?.showHelpText ?? false;
  const { pending } = useFormStatus();
  const [error, setError] = useState<{ message: string; } | null>(null);
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  
  // Set composer error when it occurs
  useEffect(() => {
    if (composerError) {
      setError({ message: composerError });
    }
  }, [composerError]);
  
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
        // Remove data URL prefix (e.g., "data:image/png;base64,")
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
          if (!selectedFile) {
            return;
          }
          
          try {
            // Convert file to base64
            const base64Data = await fileToBase64(selectedFile);
            
            // Add inscription data to form
            formData.set("inscription", base64Data);
            formData.set("mime_type", selectedFile.type);
            formData.set("encoding", "taproot");
            formData.set("text", `Inscribed ${selectedFile.name}`); // Description for the broadcast
            
            // Set defaults for optional fields
            formData.set("value", "0");
            formData.set("fee_fraction", "0");
            
            formAction(formData);
          } catch (error) {
            setFileError("Failed to process file");
          }
        }} className="space-y-4">
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <p className="text-sm text-yellow-700">
              This <em>will</em> inscribe your file on Bitcoin. However, XCP Wallet does not track Ordinal inscriptions and may spend inscribed satoshis after their creation.
            </p>
          </div>
          
          <InscriptionUploadInput
            required
            selectedFile={selectedFile}
            onFileChange={handleFileChange}
            error={fileError}
            disabled={pending}
            maxSizeKB={400}
            helpText="Select a file to inscribe on Bitcoin. The file will be permanently stored on-chain."
            showHelpText={shouldShowHelpText}
          />

          <FeeRateInput showHelpText={shouldShowHelpText} disabled={pending} />

          <Button 
            type="submit" 
            color="blue" 
            fullWidth 
            disabled={pending || !selectedFile || !!fileError}
          >
            {pending ? "Submitting..." : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}