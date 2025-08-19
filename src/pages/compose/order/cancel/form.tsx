"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Textarea } from "@headlessui/react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { AddressHeader } from "@/components/headers/address-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import type { CancelOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

/**
 * Props for the CancelForm component, aligned with Composer's formAction.
 */
interface CancelFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: CancelOptions | null;
  initialHash?: string;
  error?: string | null;
  showHelpText?: boolean;
}

/**
 * Form for canceling an order using React 19 Actions.
 */
export function CancelForm({
  formAction,
  initialFormData,
  initialHash,
  error: composerError,
  showHelpText,
}: CancelFormProps): ReactElement {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = showHelpText ?? settings?.showHelpText ?? false;
  const { pending } = useFormStatus();
  const [error, setError] = useState<{ message: string; } | null>(null);

  // Set composer error when it occurs
  useEffect(() => {
    if (composerError) {
      setError({ message: composerError });
    }
  }, [composerError]);

  // Focus offer_hash textarea on mount
  useEffect(() => {
    const textarea = document.querySelector("textarea[name='offer_hash']") as HTMLTextAreaElement;
    textarea?.focus();
  }, []);

  return (
    <div className="space-y-4">
      {activeAddress && (
        <AddressHeader address={activeAddress.address} walletName={activeWallet?.name} className="mt-1 mb-5" />
      )}
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        <form action={formAction} className="space-y-4">
          <Field>
            <Label htmlFor="offer_hash" className="block text-sm font-medium text-gray-700">
              Offer Hash <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="offer_hash"
              name="offer_hash"
              defaultValue={initialFormData?.offer_hash || initialHash || ""}
              rows={3}
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
              disabled={pending}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the hash of the order you want to cancel.
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
