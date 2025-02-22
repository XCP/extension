import React, { useState, useRef, useEffect, FormEvent } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { AddressHeader } from "@/components/headers/address-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { DetachOptions } from "@/utils/blockchain/counterparty";

interface UtxoDetachFormDataInternal {
  destination: string;
  sat_per_vbyte: number;
}

interface UtxoDetachFormProps {
  onSubmit: (data: DetachOptions) => void;
  initialFormData?: DetachOptions;
}

export function UtxoDetachForm({ onSubmit, initialFormData }: UtxoDetachFormProps) {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText ?? false;

  const [formData, setFormData] = useState<UtxoDetachFormDataInternal>(() => ({
    destination: initialFormData?.destination || "",
    sat_per_vbyte: initialFormData?.sat_per_vbyte || 1,
  }));
  const [localError, setLocalError] = useState<string | null>(null);

  const destinationRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    destinationRef.current?.focus();
  }, []);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.destination.trim()) {
      setLocalError("Destination is required.");
      return;
    }
    if (formData.sat_per_vbyte <= 0) {
      setLocalError("Fee rate must be greater than zero.");
      return;
    }
    setLocalError(null);

    const submissionData: DetachOptions = {
      sourceAddress: activeAddress?.address || "",
      destination: formData.destination.trim(),
      sat_per_vbyte: formData.sat_per_vbyte,
    };
    onSubmit(submissionData);
  };

  return (
    <div className="space-y-4">
      {activeAddress && (
        <AddressHeader
          address={activeAddress.address}
          walletName={activeWallet?.name}
          className="mb-4"
        />
      )}
      {localError && <div className="text-red-500 mb-2">{localError}</div>}
      <div className="bg-white rounded-lg shadow-lg p-4">
        <form onSubmit={handleSubmit} className="space-y-6">
          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Destination <span className="text-red-500">*</span>
            </Label>
            <Input
              ref={destinationRef}
              type="text"
              name="destination"
              value={formData.destination}
              onChange={(e) => setFormData((prev) => ({ ...prev, destination: e.target.value.trim() }))}
              required
              placeholder="Enter destination address"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the address to detach the UTXO to.
            </Description>
          </Field>
          <FeeRateInput
            value={formData.sat_per_vbyte}
            onChange={(value) => setFormData((prev) => ({ ...prev, sat_per_vbyte: value }))}
            error={formData.sat_per_vbyte <= 0 ? "Fee rate must be greater than zero." : ""}
            showHelpText={shouldShowHelpText}
          />
          <Button type="submit" color="blue" fullWidth>
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
