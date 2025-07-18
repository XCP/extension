// SweepForm.tsx
"use client";

import { useEffect } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Input, Select } from "@headlessui/react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { AddressHeader } from "@/components/headers/address-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import type { SweepOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

// Define sweep type options
const FLAG_BALANCES = 1;
const FLAG_OWNERSHIP = 2;

const sweepTypeOptions = [
  { id: 1, name: "Asset Balances Only", value: FLAG_BALANCES },
  { id: 2, name: "Asset Ownership Only", value: FLAG_OWNERSHIP },
  { id: 3, name: "Asset Balances & Ownership", value: FLAG_BALANCES | FLAG_OWNERSHIP },
];

interface SweepFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: SweepOptions | null;
  error?: string | null; // Add error prop
}

export function SweepForm({ formAction, initialFormData, error }: SweepFormProps): ReactElement {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText ?? false;
  const { pending } = useFormStatus();

  useEffect(() => {
    const input = document.querySelector("input[name='destination']") as HTMLInputElement;
    input?.focus();
  }, []);

  return (
    <div className="space-y-4">
      {activeAddress && (
        <AddressHeader address={activeAddress.address} walletName={activeWallet?.name} className="mt-1 mb-5" />
      )}
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        {error && <ErrorAlert message={error} />}
        <form action={formAction} className="space-y-4">
          <Field>
            <Label className="block text-sm font-medium text-gray-700">
              Sweep Type <span className="text-red-500">*</span>
            </Label>
            <Select
              name="flags"
              defaultValue={initialFormData?.flags || FLAG_BALANCES | FLAG_OWNERSHIP}
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={pending}
            >
              {sweepTypeOptions.map((option) => (
                <option key={option.id} value={option.value}>
                  {option.name}
                </option>
              ))}
            </Select>
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Choose whether to sweep asset balances only, asset ownership only, or both.
            </Description>
          </Field>

          <Field>
            <Label className="block text-sm font-medium text-gray-700">
              Destination <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              name="destination"
              defaultValue={initialFormData?.destination || ""}
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
              disabled={pending}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the address to sweep all assets to.
            </Description>
          </Field>

          <Field>
            <Label className="block text-sm font-medium text-gray-700">Memo</Label>
            <Input
              type="text"
              name="memo"
              defaultValue={initialFormData?.memo || ""}
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={pending}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Optional memo to include with the transaction.
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
