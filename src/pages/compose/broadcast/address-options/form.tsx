"use client";

import { useFormStatus } from "react-dom";
import { Field } from "@headlessui/react";
import { Button } from "@/components/button";
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
}

/**
 * Form for composing an address options broadcast transaction using React 19 Actions.
 */
export function AddressOptionsForm({ formAction, initialFormData }: AddressOptionsFormProps): ReactElement {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText ?? false;
  const { pending } = useFormStatus();

  const initialRequireMemo = initialFormData?.text === `options ${ADDRESS_OPTION_REQUIRE_MEMO}`;

  return (
    <div className="space-y-4">
      {activeAddress && (
        <AddressHeader
          address={activeAddress.address}
          walletName={activeWallet?.name ?? ""}
          className="mb-6"
        />
      )}
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        <form action={formAction} className="space-y-4">
          <Field>
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
              <p className="text-sm text-yellow-700">
                The "Require Memo" option will make this address reject transactions without memos. This setting cannot be reversed.
              </p>
            </div>
            <CheckboxInput
              name="requireMemo"
              label="Require Memo for Incoming Transactions"
              disabled={pending}
            />
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
