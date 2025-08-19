"use client";

import { useFormStatus } from "react-dom";
import { useState, useEffect } from "react";
import { Field, Label } from "@headlessui/react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { AddressHeader } from "@/components/headers/address-header";
import { CheckboxInput } from "@/components/inputs/checkbox-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import type { BroadcastOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

const ADDRESS_OPTION_REQUIRE_MEMO = 1;

/**
 * Props for the AddressOptionsForm component, aligned with Composer's formAction.
 */
interface AddressOptionsFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: BroadcastOptions | null;
  error?: string | null;
  showHelpText?: boolean;
}

/**
 * Form for composing an address options broadcast transaction using React 19 Actions.
 */
export function AddressOptionsForm({ formAction, initialFormData ,
  error: composerError,
  showHelpText,
}: AddressOptionsFormProps): ReactElement {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = showHelpText ?? settings?.showHelpText ?? false;
  const { pending } = useFormStatus();
  const [error, setError] = useState<{ message: string; } | null>(null);
  
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
      // Depending on the API requirements, you might need to handle this differently
      formData.delete("text");
    }
    
    formAction(formData);
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
        <form action={handleFormAction} className="space-y-4">
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
          
          <FeeRateInput 
            showHelpText={shouldShowHelpText} 
            disabled={pending} 
          />

          <Button 
            type="submit" 
            color="blue" 
            fullWidth 
            disabled={pending || !isChecked}
          >
            {pending ? "Submitting..." : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
