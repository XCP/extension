"use client";

import { useEffect } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Textarea, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { AddressHeader } from "@/components/headers/address-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
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
 */
export function BroadcastForm({ formAction, initialFormData }: BroadcastFormProps): ReactElement {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText ?? false;
  const { pending } = useFormStatus();

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
          className="mb-4"
        />
      )}
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        <form action={formAction} className="space-y-4">
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

          <FeeRateInput showHelpText={shouldShowHelpText} disabled={pending} />
          
          <Button type="submit" color="blue" fullWidth disabled={pending}>
            {pending ? "Submitting..." : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
