import { Description, Field, Label, Textarea } from "@headlessui/react";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { ComposerForm } from "@/components/composer/composer-form";
import { AddressHeader } from "@/components/ui/headers/address-header";
import { InscriptionUploadInput } from "@/components/ui/inputs/file-upload-input";
import { SettingSwitch } from "@/components/ui/inputs/setting-switch";
import { TextField } from "@/components/ui/inputs/text-field";
import { useComposer } from "@/contexts/composer-context-object";
import { isSegwitFormat } from '@/core/bitcoin/address';
import type { BroadcastOptions } from "@/core/counterparty/compose";
import { encodeInscriptionContent } from '@/core/counterparty/inscriptionEnvelope';

/**
 * Props for the BroadcastForm component, aligned with Composer's formAction.
 */
interface BroadcastFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: BroadcastOptions | null;
}

/**
 * Form for composing a broadcast transaction using React 19 Actions.
 * @param {BroadcastFormProps} props - Component props
 * @returns {ReactElement} Broadcast form UI
 */
export function BroadcastForm({ 
  formAction, 
  initialFormData
}: BroadcastFormProps): ReactElement {
  // Get everything from composer context
  const { activeAddress, activeWallet, settings, showHelpText } = useComposer<BroadcastOptions>();
  const showAdvancedOptions = settings?.enableAdvancedBroadcasts ?? false;

  // Form state
  const [textContent, setTextContent] = useState(initialFormData?.text || "");
  
  // Inscription state
  const [inscribeEnabled, setInscribeEnabled] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  
  // Computed values
  const isSegwitAddress = activeWallet?.addressFormat && isSegwitFormat(activeWallet.addressFormat);
  
  // Sync textContent when initialFormData changes
  useEffect(() => {
    if (initialFormData?.text) {
      setTextContent(initialFormData.text);
    }
  }, [initialFormData?.text]);

  
  // Handlers
  const handleFileChange = (file: File | null) => {
    setFileError(null);
    if (file && file.size > 400 * 1024) {
      setFileError("File size must be less than 400KB");
      return;
    }
    setSelectedFile(file);
  };
  
  /**
   * The content as a compose request must carry it: hex for binary types, the decoded string for
   * textual ones. Core unhexlifies non-text content (`helpers.content_to_bytes`), so sending
   * anything else makes it reject the compose.
   */
  const fileToInscriptionContent = async (file: File): Promise<string> => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return encodeInscriptionContent(bytes, file.type || "application/octet-stream");
  };

  return (
    <ComposerForm
      formAction={async (formData: FormData) => {
          // Ensure defaults for optional fields
          if (!formData.get("value") || formData.get("value") === "") {
            formData.set("value", "0");
          }
          if (!formData.get("fee_fraction") || formData.get("fee_fraction") === "") {
            formData.set("fee_fraction", "0");
          }
          
          // Handle inscription mode. `inscription` is a boolean flag to core — the content itself
          // travels in `text`, hex-encoded unless the MIME type is textual.
          if (inscribeEnabled && selectedFile) {
            try {
              formData.set("text", await fileToInscriptionContent(selectedFile));
              formData.set("inscription", "true");
              formData.set("mime_type", selectedFile.type || "application/octet-stream");
              formData.set("encoding", "taproot");
            } catch (_error) {
              setFileError("Failed to process file");
              return;
            }
          } else {
            // Regular text broadcast
            formData.set("text", textContent);
          }

          // Call the form action and let it handle navigation
          await formAction(formData);
        }}
        header={
          activeAddress && (
            <AddressHeader
              address={activeAddress.address}
              walletName={activeWallet?.name ?? ""}
              className="mt-1 mb-5"
            />
          )
        }
        submitText="Continue"
        submitDisabled={(inscribeEnabled && !selectedFile) || (!inscribeEnabled && !textContent)}
        formClassName="space-y-4"
      >
          {inscribeEnabled ? (
            <InscriptionUploadInput
              required
              selectedFile={selectedFile}
              onFileChange={handleFileChange}
              error={fileError}
              disabled={false}
              maxSizeKB={400}
              helpText="Upload a file to inscribe as the broadcast message. The file content will be stored permanently on-chain. To broadcast text, upload a .txt file."
              showHelpText={showHelpText}
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
                className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 hover:border-gray-400"
                required
                rows={4}
                disabled={false}
                autoFocus={!inscribeEnabled}
              />
              {showHelpText && (
                <Description className="mt-2 text-sm text-gray-500">
                  Enter the message you want to broadcast.
                </Description>
              )}
            </Field>
          )}

          {isSegwitAddress && (
            <SettingSwitch
              label="Inscribe?"
              description="Store message as a Taproot inscription (on-chain)"
              checked={inscribeEnabled}
              onChange={setInscribeEnabled}
              showHelpText={showHelpText}
              disabled={false}
            />
          )}

          {showAdvancedOptions && (
            <>
              <TextField
                label="Value"
                id="value"
                name="value"
                type="text"
                inputMode="numeric"
                pattern="\d*"
                defaultValue={initialFormData?.value || ""}
                placeholder="0"
                showHelpText={showHelpText}
                description="Optional numeric value if publishing data."
              />

              <TextField
                label="Fee Fraction"
                id="fee_fraction"
                name="fee_fraction"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*\.?[0-9]*"
                defaultValue={initialFormData?.fee_fraction || ""}
                placeholder="0"
                showHelpText={showHelpText}
                description="Optional fee fraction for paid broadcasts (e.g., 0.05 for 5%)."
              />
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

    </ComposerForm>
  );
}