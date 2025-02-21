import React, { useState, useRef, useEffect, FormEvent } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { AddressHeader } from "@/components/headers/address-header";
import { CheckboxInput } from "@/components/inputs/checkbox-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";

export interface SweepFormData {
  destination: string;
  memo: string;
  includeBtc: boolean;

}

const DEFAULT_FORM_DATA: SweepFormData = {
  destination: "",
  memo: "",
  includeBtc: false,
  feeRateSatPerVByte: 1,
};

interface SweepFormProps {
  onSubmit: (data: SweepFormData) => void;
}

export function SweepForm({ onSubmit }: SweepFormProps) {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText;
  const [formData, setFormData] = useState<SweepFormData>(DEFAULT_FORM_DATA);
  const destinationRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    destinationRef.current?.focus();
  }, []);

  const handleDestinationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, destination: e.target.value.trim() }));
  };

  const handleMemoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, memo: e.target.value.trim() }));
  };

  const handleIncludeBtcChange = (checked: boolean) => {
    setFormData((prev) => ({ ...prev, includeBtc: checked }));
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.destination.trim() || formData.feeRateSatPerVByte <= 0) {
      return; // Validation handled by form fields and FeeRateInput
    }
    onSubmit({
      ...formData,
      flag: formData.includeBtc ? 1 : 0, // Map includeBtc to flag
    });
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
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field>
            <Label className="block text-sm font-medium text-gray-700">
              Destination <span className="text-red-500">*</span>
            </Label>
            <Input
              ref={destinationRef}
              type="text"
              value={formData.destination}
              onChange={handleDestinationChange}
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the address to sweep all assets to.
            </Description>
          </Field>

          <Field>
            <Label className="block text-sm font-medium text-gray-700">Memo</Label>
            <Input
              type="text"
              value={formData.memo}
              onChange={handleMemoChange}
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Optional memo to include with the transaction.
            </Description>
          </Field>

          <CheckboxInput
            checked={formData.includeBtc}
            onChange={handleIncludeBtcChange}
            label="Include BTC"
            aria-label="Toggle include BTC"
          />

          <FeeRateInput
            value={formData.feeRateSatPerVByte}
            onChange={(value) =>
              setFormData((prev) => ({ ...prev, feeRateSatPerVByte: value }))
            }
            error={formData.feeRateSatPerVByte <= 0 ? "Fee rate must be greater than zero." : ""}
            showHelpText={shouldShowHelpText}
          />

          <Button
            type="submit"
            color="blue"
            fullWidth
            disabled={!formData.destination.trim() || formData.feeRateSatPerVByte <= 0}
          >
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
