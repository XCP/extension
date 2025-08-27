"use client";

import { useEffect, useState } from "react";
import { Field, Label, Description, Textarea } from "@headlessui/react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { AddressHeader } from "@/components/headers/address-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import type { BTCPayOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";
import { useFormStatus } from "react-dom";

/**
 * Props for the BTCPayForm component, aligned with Composer's formAction.
 */
interface BTCPayFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: BTCPayOptions | null;
  error?: string | null;
  showHelpText?: boolean;
}

/**
 * Form for submitting a BTC payment for an order match using React 19 Actions.
 */
export function BTCPayForm({ formAction, initialFormData ,
  error: composerError,
  showHelpText,
}: BTCPayFormProps): ReactElement {
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

  // Focus order_match_id textarea on mount
  useEffect(() => {
    const textarea = document.querySelector("textarea[name='order_match_id']") as HTMLTextAreaElement;
    textarea?.focus();
  }, []);

  return (
    <div className="space-y-4">
      {activeAddress && (
        <AddressHeader address={activeAddress.address} walletName={activeWallet?.name} className="mt-1 mb-5" />
      )}
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        {error && (
          <ErrorAlert
            message={error.message}
            onClose={() => setError(null)}
          />
        )}
        <form action={formAction} className="space-y-4">
          <Field>
            <Label htmlFor="order_match_id" className="block text-sm font-medium text-gray-700">
              Order Match ID <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="order_match_id"
              name="order_match_id"
              defaultValue={initialFormData?.order_match_id || ""}
              rows={3}
              className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
              disabled={pending}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the ID of the order match you want to pay for.
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
