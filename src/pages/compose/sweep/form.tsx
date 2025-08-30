// SweepForm.tsx
"use client";

import { useEffect, useState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { 
  Field, 
  Label, 
  Description,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions
} from "@headlessui/react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { AddressHeader } from "@/components/headers/address-header";
import { DestinationInput } from "@/components/inputs/destination-input";
import { MemoInput } from "@/components/inputs/memo-input";
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
  showHelpText?: boolean;
}

export function SweepForm({ formAction, initialFormData, error: composerError, showHelpText }: SweepFormProps): ReactElement {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = showHelpText ?? settings?.showHelpText ?? false;
  const { pending } = useFormStatus();
  const [error, setError] = useState<{ message: string } | null>(null);
  const [destination, setDestination] = useState(initialFormData?.destination || "");
  const [destinationValid, setDestinationValid] = useState(false);
  const [memo, setMemo] = useState(initialFormData?.memo || "");
  const [memoValid, setMemoValid] = useState(true);
  const [selectedSweepType, setSelectedSweepType] = useState(
    sweepTypeOptions.find(opt => opt.value === (initialFormData?.flags || (FLAG_BALANCES | FLAG_OWNERSHIP))) || sweepTypeOptions[2]
  );
  const destinationRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    destinationRef.current?.focus();
  }, []);

  // Set composer error when it occurs
  useEffect(() => {
    if (composerError) {
      setError({ message: composerError });
    }
  }, [composerError]);

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
            <Label className="block text-sm font-medium text-gray-700">
              Sweep Type <span className="text-red-500">*</span>
            </Label>
            <div className="mt-1">
              {/* Hidden input for form submission */}
              <input type="hidden" name="flags" value={selectedSweepType.value} />
              
              <Listbox value={selectedSweepType} onChange={setSelectedSweepType} disabled={pending}>
                <ListboxButton className="w-full p-2 text-left rounded-md border border-gray-300 bg-gray-50 focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed">
                  {selectedSweepType.name}
                </ListboxButton>
                <ListboxOptions className="w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-auto">
                  {sweepTypeOptions.map((option) => (
                    <ListboxOption 
                      key={option.id} 
                      value={option} 
                      className="p-2 cursor-pointer hover:bg-gray-100 data-[selected]:bg-gray-100 data-[selected]:font-medium"
                    >
                      {option.name}
                    </ListboxOption>
                  ))}
                </ListboxOptions>
              </Listbox>
            </div>
            {shouldShowHelpText && (
              <Description className="mt-2 text-sm text-gray-500">
                Choose whether to sweep asset balances only, asset ownership only, or both.
              </Description>
            )}
          </Field>

          <input type="hidden" name="destination" value={destination} />
          <DestinationInput
            ref={destinationRef}
            value={destination}
            onChange={setDestination}
            onValidationChange={setDestinationValid}
            placeholder="Enter destination address for sweep"
            required
            disabled={pending}
            showHelpText={shouldShowHelpText}
            name="destination_display"
            helpText="Enter the address to sweep all assets to."
          />

          <input type="hidden" name="memo" value={memo} />
          <MemoInput
            value={memo}
            onChange={setMemo}
            onValidationChange={setMemoValid}
            disabled={pending}
            showHelpText={shouldShowHelpText}
          />

          <FeeRateInput showHelpText={shouldShowHelpText} disabled={pending} />
          
          <Button type="submit" color="blue" fullWidth disabled={pending || !destinationValid || !memoValid}>
            {pending ? "Submitting..." : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
