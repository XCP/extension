"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Textarea, Input, Switch } from "@headlessui/react";
import { Button } from "@/components/button";
import { AddressHeader } from "@/components/headers/address-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { AddressType } from "@/utils/blockchain/bitcoin/address";
import type { BroadcastOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

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
export function BroadcastForm({ formAction, initialFormData }: BroadcastFormProps): ReactElement {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText ?? false;
  const showAdvancedOptions = settings?.enableAdvancedBroadcasts ?? false;
  const { pending } = useFormStatus();
  
  // Check if active address is taproot
  const isTaprootAddress = activeAddress?.addressType === AddressType.P2TR;
  
  // State for inscription mode
  const [inscribeEnabled, setInscribeEnabled] = useState(false);

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
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 hover:border-gray-400"
              required
              rows={4}
              disabled={pending}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the message you want to broadcast.
            </Description>
          </Field>

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
                  className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 hover:border-gray-400"
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
                  className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 hover:border-gray-400"
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

          {isTaprootAddress && (
            <Field>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Label className="text-sm font-medium text-gray-700">
                    Inscribe
                  </Label>
                  <Description className={shouldShowHelpText ? "text-sm text-gray-500" : "hidden"}>
                    Store message as a Taproot inscription (on-chain)
                  </Description>
                </div>
                <Switch
                  checked={inscribeEnabled}
                  onChange={setInscribeEnabled}
                  className={`${
                    inscribeEnabled ? 'bg-blue-600' : 'bg-gray-200'
                  } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
                  disabled={pending}
                >
                  <span
                    className={`${
                      inscribeEnabled ? 'translate-x-6' : 'translate-x-1'
                    } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                  />
                </Switch>
              </div>
            </Field>
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
