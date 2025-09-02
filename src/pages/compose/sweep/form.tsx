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
import { ComposeForm } from "@/components/compose-form";
import { AddressHeader } from "@/components/headers/address-header";
import { DestinationInput } from "@/components/inputs/destination-input";
import { MemoInput } from "@/components/inputs/memo-input";
import { useComposer } from "@/contexts/composer-context";
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
}

export function SweepForm({ 
  formAction, 
  initialFormData
}: SweepFormProps): ReactElement {
  // Get everything from composer context
  const { activeAddress, activeWallet, showHelpText } = useComposer<SweepOptions>();
  
  // Use form status for pending state
  const { pending } = useFormStatus();
  
  // Form state
  const [destination, setDestination] = useState(initialFormData?.destination || "");
  const [destinationValid, setDestinationValid] = useState(false);
  const [memo, setMemo] = useState(initialFormData?.memo || "");
  const [memoValid, setMemoValid] = useState(true);
  const [selectedSweepType, setSelectedSweepType] = useState(
    sweepTypeOptions.find(opt => opt.value === (initialFormData?.flags || (FLAG_BALANCES | FLAG_OWNERSHIP))) || sweepTypeOptions[2]
  );
  
  // Refs
  const destinationRef = useRef<HTMLInputElement>(null);

  // Focus destination input on mount
  useEffect(() => {
    destinationRef.current?.focus();
  }, []);

  return (
    <ComposeForm
      formAction={formAction}
      header={
        activeAddress && (
          <AddressHeader 
            address={activeAddress.address} 
            walletName={activeWallet?.name} 
            className="mt-1 mb-5" 
          />
        )
      }
      submitText="Sweep"
      submitDisabled={!destinationValid || !memoValid}
    >
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
        {showHelpText && (
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
        showHelpText={showHelpText}
        name="destination_display"
        helpText="Enter the address to sweep all assets to."
      />

      <input type="hidden" name="memo" value={memo} />
      <MemoInput
        value={memo}
        onChange={setMemo}
        onValidationChange={setMemoValid}
        disabled={pending}
        showHelpText={showHelpText}
      />
    </ComposeForm>
  );
}