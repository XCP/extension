"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Textarea, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { AddressHeader } from "@/components/headers/address-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { InscribeSwitch } from "@/components/inputs/inscribe-switch";
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
export function BroadcastForm({ formAction, initialFormData, error: composerError, showHelpText }: BroadcastFormProps): ReactElement {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = showHelpText ?? settings?.showHelpText ?? false;
  const showAdvancedOptions = settings?.enableAdvancedBroadcasts ?? false;
  const { pending } = useFormStatus();
  
  // Check if active wallet uses taproot addresses
  const isTaprootAddress = activeWallet?.addressType === AddressType.P2TR;
  
  // State for inscription mode - default to true for Taproot addresses
  const [inscribeEnabled, setInscribeEnabled] = useState(isTaprootAddress);
  
  // Error state
  const [error, setError] = useState<{ message: string; } | null>(null);
  
  // Set composer error when it occurs
  useEffect(() => {
    if (composerError) {
      setError({ message: composerError });
    }
  }, [composerError]);

  // Focus textarea on mount
  useEffect(() => {
    const textarea = document.querySelector("textarea[name='text']") as HTMLTextAreaElement;
    textarea?.focus();
  }, []);

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
        <form action={formData => {
          // Ensure defaults for optional fields
          if (!formData.get("value") || formData.get("value") === "") {
            formData.set("value", "0");
          }
          if (!formData.get("fee_fraction") || formData.get("fee_fraction") === "") {
            formData.set("fee_fraction", "0");
          }
          
          // Handle inscription mode
          if (inscribeEnabled) {
            const text = formData.get("text") as string;
            if (text) {
              // Convert text to base64 for inscription
              const base64Text = btoa(text);
              formData.set("inscription", base64Text);
              formData.set("mime_type", "text/plain");
            }
          }
          
          formAction(formData);
        }} className="space-y-4">
          <Field>
            <Label htmlFor="text" className="block text-sm font-medium text-gray-700">
              Message <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="text"
              name="text"
              defaultValue={initialFormData?.text || ""}
              className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 hover:border-gray-400"
              required
              rows={4}
              disabled={pending}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the message you want to broadcast.
            </Description>
          </Field>

          {isTaprootAddress && (
            <InscribeSwitch
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

          <Button type="submit" color="blue" fullWidth disabled={pending}>
            {pending ? "Submitting..." : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
