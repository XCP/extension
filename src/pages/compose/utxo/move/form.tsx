import React, { useState, useRef, useEffect, FormEvent } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { AddressHeader } from "@/components/headers/address-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useWallet } from "@/contexts/wallet-context";
import { useSettings } from "@/contexts/settings-context";
import { MoveOptions } from "@/utils/blockchain/counterparty";

interface UtxoMoveFormDataInternal {
  utxo: string;
  destination: string;
  sat_per_vbyte: number;
}

interface UtxoMoveFormProps {
  onSubmit: (data: MoveOptions) => void;
  initialFormData?: MoveOptions;
}

export function UtxoMoveForm({ onSubmit, initialFormData }: UtxoMoveFormProps) {
  const { activeAddress, activeWallet } = useWallet();
  const shouldShowHelpText = useSettings()?.showHelpText ?? false;

  const [formData, setFormData] = useState<UtxoMoveFormDataInternal>(() => ({
    utxo: initialFormData?.utxo_value || "",
    destination: initialFormData?.destination || "",
    sat_per_vbyte: initialFormData?.sat_per_vbyte || 10,
  }));
  const [localError, setLocalError] = useState<string | null>(null);

  const utxoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    utxoRef.current?.focus();
  }, []);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.utxo.trim()) {
      setLocalError("UTXO is required.");
      return;
    }
    if (!formData.destination.trim()) {
      setLocalError("Destination is required.");
      return;
    }
    if (formData.sat_per_vbyte <= 0) {
      setLocalError("Fee rate must be greater than zero.");
      return;
    }
    setLocalError(null);

    const submissionData: MoveOptions = {
      sourceAddress: activeAddress?.address || "",
      destination: formData.destination.trim(),
      utxo_value: formData.utxo.trim(),
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
          className="mb-5"
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
              onChange={(e) => setFormData((prev) => ({ ...prev, destination: e.target.value.trim() }))}
              required
              placeholder="Enter destination address"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the address to move the UTXO to.
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
