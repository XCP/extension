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

// Supported MIME types for inscriptions
const SUPPORTED_MIME_TYPES = [
  'image/png',
  'image/jpeg', 
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'text/plain',
  'text/html',
  'application/json',
  'application/pdf',
];

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
  
  // Handle file selection
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setFileError(null);
    
    if (!file) {
      setSelectedFile(null);
      return;
    }
    
    // Check file size (max 400KB for now)
    if (file.size > 400 * 1024) {
      setFileError("File size must be less than 400KB");
      setSelectedFile(null);
      return;
    }
    
    // Check MIME type
    if (!SUPPORTED_MIME_TYPES.includes(file.type)) {
      setFileError(`Unsupported file type. Supported types: ${SUPPORTED_MIME_TYPES.join(', ')}`);
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
              This will inscribe your file on Bitcoin. However, XCP Wallet does not track Ordinal inscriptions and may spend inscribed satoshis after their creation.
            </p>
          </div>
          
          <Field>
            <Label className="block text-sm font-medium text-gray-700">
              Your File <span className="text-red-500">*</span>
            </Label>
            <div className="mt-1">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                id="file"
                name="file"
                type="file"
                accept={SUPPORTED_MIME_TYPES.join(',')}
                onChange={handleFileChange}
                className="sr-only"
                required
                disabled={pending}
              />
              
              {/* Custom file upload button */}
              <label
                htmlFor="file"
                className={`
                  flex items-center justify-center w-full px-4 py-2 
                  text-sm font-medium rounded-md cursor-pointer
                  transition-colors duration-200
                  ${pending 
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                  }
                  focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500
                `}
              >
                {selectedFile ? (
                  <span className="truncate">{selectedFile.name}</span>
                ) : (
                  <span>Choose file to inscribe</span>
                )}
              </label>
            </div>
            
            {/* File info and errors */}
            {selectedFile && !fileError && (
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-xs text-gray-600">
                  Size: {(selectedFile.size / 1024).toFixed(2)} KB
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                    }
                  }}
                  className="text-blue-600 hover:text-blue-800"
                  disabled={pending}
                >
                  Change
                </button>
              </div>
            )}
            
            {fileError && (
              <p className="mt-2 text-sm text-red-600">{fileError}</p>
            )}
            
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Select an image, text, or other media file to inscribe on Bitcoin. Maximum size: 400KB.
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