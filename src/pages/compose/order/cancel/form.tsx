"use client";

import { useEffect, useState } from "react";
import { Field, Label, Description, Textarea } from "@headlessui/react";
import { ComposeForm } from "@/components/forms/compose-form";
import { AddressHeader } from "@/components/headers/address-header";
import { useComposer } from "@/contexts/composer-context";
import type { CancelOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

/**
 * Props for the CancelForm component, aligned with Composer's formAction.
 */
interface CancelFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: CancelOptions | null;
  initialHash?: string;
}

/**
 * Form for canceling an order using React 19 Actions.
 */
export function CancelForm({
  formAction,
  initialFormData,
  initialHash,
}: CancelFormProps): ReactElement {
  // Context hooks
  const { activeAddress, activeWallet, settings, showHelpText } = useComposer();

  // Focus offer_hash textarea on mount
  useEffect(() => {
    const textarea = document.querySelector("textarea[name='offer_hash']") as HTMLTextAreaElement;
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
            <Label htmlFor="offer_hash" className="block text-sm font-medium text-gray-700">
              Order Hash <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="offer_hash"
              name="offer_hash"
              defaultValue={initialHash || initialFormData?.offer_hash || ""}
              rows={3}
              className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
              disabled={false}
            />
            {showHelpText && (
              <Description className="mt-2 text-sm text-gray-500">
                Enter the hash of the order you want to cancel.
              </Description>
            )}
          </Field>

    </ComposeForm>
  );
}
