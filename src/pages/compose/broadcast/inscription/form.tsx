"use client";

import { useEffect, useState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { AddressHeader } from "@/components/headers/address-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
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
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  
  // Set composer error when it occurs
  useEffect(() => {
    if (composerError) {
      setError({ message: composerError });
    }
  }, [composerError]);
  
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
          
          <Field>
            <Label className="block text-sm font-medium text-gray-700 mb-2">
              Your File <span className="text-red-500">*</span>
            </Label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
              <input
                ref={fileInputRef}
                id="file"
                name="file"
                type="file"
                onChange={handleFileChange}
                className="hidden"
                required
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
              Select a file to inscribe on Bitcoin. The file will be permanently stored on-chain.
            </Description>
          </Field>

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