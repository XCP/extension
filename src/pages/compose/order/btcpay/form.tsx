"use client";

import { useEffect, useState } from "react";
import { Field, Label, Description, Textarea } from "@headlessui/react";
import { ComposeForm } from "@/components/compose-form";
import { AddressHeader } from "@/components/headers/address-header";
import { useComposer } from "@/contexts/composer-context";
import type { BTCPayOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

/**
 * Props for the BTCPayForm component, aligned with Composer's formAction.
 */
interface BTCPayFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: BTCPayOptions | null;
}

/**
 * Form for submitting a BTC payment for an order match using React 19 Actions.
 */
export function BTCPayForm({ 
  formAction, 
  initialFormData,
}: BTCPayFormProps): ReactElement {
  // Context hooks
  const { activeAddress, activeWallet, settings, showHelpText } = useComposer();

  // Focus order_match_id textarea on mount
  useEffect(() => {
    const textarea = document.querySelector("textarea[name='order_match_id']") as HTMLTextAreaElement;
    textarea?.focus();
  }, []);

  return (
    <ComposeForm
      formAction={formAction}
      header={
        activeAddress && (
          <AddressHeader address={activeAddress.address} walletName={activeWallet?.name} className="mt-1 mb-5" />
        )
      }
    >
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
              disabled={false}
            />
            {showHelpText && (
              <Description className="mt-2 text-sm text-gray-500">
                Enter the ID of the order match you want to pay for.
              </Description>
            )}
          </Field>

    </ComposeForm>
  );
}
