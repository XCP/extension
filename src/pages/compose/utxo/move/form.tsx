import React, { useState, useRef, useEffect, FormEvent } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { AddressHeader } from "@/components/headers/address-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";

export interface UtxoMoveFormData {
  utxo: string;
  destination: string;

}

interface UtxoMoveFormProps {
  onSubmit: (data: UtxoMoveFormData) => void;
}

export function UtxoMoveForm({ onSubmit }: UtxoMoveFormProps) {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText;

  const [formData, setFormData] = useState<UtxoMoveFormData>({
    utxo: "",
    destination: "",
    feeRateSatPerVByte: 10, // Default to 10 sat/vB
  });
  const [localError, setLocalError] = useState<string | null>(null);

  const utxoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    utxoRef.current?.focus();
  }, []);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (
      !formData.utxo.trim() ||
      !formData.destination.trim() ||
      formData.feeRateSatPerVByte <= 0
    ) {
      setLocalError("Please fill all required fields with valid values.");
      return;
    }
    setLocalError(null);
    onSubmit(formData);
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
              UTXO <span className="text-red-500">*</span>
            </Label>
            <Input
              ref={utxoRef}
              type="text"
              name="utxo"
              value={formData.utxo}
              onChange={(e) => setFormData((prev) => ({ ...prev, utxo: e.target.value.trim() }))}
              required
              placeholder="Enter UTXO (txid:vout)"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the UTXO identifier (e.g., txid:vout) to move.
            </Description>
          </Field>

          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Destination <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              name="destination"
              value={formData.destination}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, destination: e.target.value.trim() }))
              }
              required
              placeholder="Enter destination address"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the address to move the UTXO to.
            </Description>
          </Field>

          <FeeRateInput
            value={formData.feeRateSatPerVByte}
            onChange={(value) => setFormData((prev) => ({ ...prev, feeRateSatPerVByte: value }))}
            error={formData.feeRateSatPerVByte <= 0 ? "Fee rate must be greater than zero." : ""}
            showHelpText={shouldShowHelpText}
          />

          <Button
            type="submit"
            color="blue"
            fullWidth
            disabled={
              !formData.utxo.trim() ||
              !formData.destination.trim() ||
              formData.feeRateSatPerVByte <= 0
            }
          >
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
