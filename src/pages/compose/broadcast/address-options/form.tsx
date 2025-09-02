"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label } from "@headlessui/react";
import { ComposeForm } from "@/components/forms/compose-form";
import { AddressHeader } from "@/components/headers/address-header";
import { CheckboxInput } from "@/components/inputs/checkbox-input";
import { useComposer } from "@/contexts/composer-context";
import type { BroadcastOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

const ADDRESS_OPTION_REQUIRE_MEMO = 1;

/**
 * Props for the AddressOptionsForm component, aligned with Composer's formAction.
 */
interface AddressOptionsFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: BroadcastOptions | null;
}

/**
 * Form for composing an address options broadcast transaction using React 19 Actions.
 */
export function AddressOptionsForm({ 
  formAction, 
  initialFormData
}: AddressOptionsFormProps): ReactElement {
  // Get everything from composer context
  const { activeAddress, activeWallet, showHelpText } = useComposer<BroadcastOptions>();
  const { pending } = useFormStatus();
  
  const initialRequireMemo = initialFormData?.text === `options ${ADDRESS_OPTION_REQUIRE_MEMO}`;
  const [isChecked, setIsChecked] = useState(initialRequireMemo || false);

  const handleCheckboxChange = (checked: boolean) => {
    setIsChecked(checked);
  };

  // Custom form action to set the broadcast text based on checkbox state
  const handleFormAction = (formData: FormData) => {
    // Set the text field based on the checkbox state
    if (isChecked) {
      formData.set("text", `options ${ADDRESS_OPTION_REQUIRE_MEMO}`);
    } else {
      // If not checked, we need to ensure there's no text field or set it to empty
      formData.delete("text");
    }
    
    formAction(formData);
  };

  return (
    <ComposeForm
      formAction={handleFormAction}
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
      submitDisabled={!isChecked}
    >
      <Field>
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
          <p className="text-sm text-yellow-700">
            The "Require Memo" option will make this address reject transactions without memos. This setting cannot be reversed.
          </p>
        </div>
        <div className="mb-2">
          <Label className="text-sm font-medium text-gray-700">Options</Label>
        </div>
        <CheckboxInput
          name="requireMemo"
          label="Require Memo for Incoming Transactions"
          disabled={pending}
          checked={isChecked}
          onChange={handleCheckboxChange}
        />
      </Field>
    </ComposeForm>
  );
}
