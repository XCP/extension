import React, { useState, useRef, useEffect } from "react";
import { Field, Label, Description, Input, Select } from "@headlessui/react";
import { FiChevronDown } from "react-icons/fi";
import { Button } from "@/components/button";
import { AddressHeader } from "@/components/headers/address-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { formatAddress } from "@/utils/format";

// Flag constants and options from the old code:
const FLAG_BALANCES = 1;
const FLAG_OWNERSHIP = 2;

const flagOptions = [
  { id: 1, name: "Asset Balances Only", value: FLAG_BALANCES },
  { id: 2, name: "Asset Ownership Only", value: FLAG_OWNERSHIP },
  { id: 3, name: "Asset Balances & Ownership", value: FLAG_BALANCES | FLAG_OWNERSHIP },
];

export interface SweepFormData {
  destination: string;
  flags: number;
  memo: string;
  feeRateSatPerVByte: number;
  allowUnconfirmedInputs?: boolean;
}

interface SweepFormProps {
  onSubmit: (data: SweepFormData) => void;
  initialAddress?: string;
}

export function SweepForm({ onSubmit, initialAddress }: SweepFormProps) {
  const { settings } = useSettings();
  const { activeAddress, activeWallet } = useWallet();
  const sourceAddress = initialAddress || activeAddress?.address;
  const [formData, setFormData] = useState<SweepFormData>({
    destination: "",
    flags: FLAG_BALANCES | FLAG_OWNERSHIP,
    memo: "",
    feeRateSatPerVByte: 0,
    allowUnconfirmedInputs: false,
  });
  const destinationInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    destinationInputRef.current?.focus();
  }, []);

  const handleFlagsChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFormData((prev) => ({ ...prev, flags: Number(e.target.value) }));
  };

  const handleDestinationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, destination: e.target.value }));
  };

  const handleMemoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, memo: e.target.value }));
  };

  const handleFeeRateChange = (value: number) => {
    setFormData((prev) => ({ ...prev, feeRateSatPerVByte: value }));
  };

  // Generate help text for the destination field
  const getDestinationHelpText = (flags: number) => {
    const addressText = sourceAddress
      ? `${formatAddress(sourceAddress)}`
      : "the source address";

    if (flags === FLAG_BALANCES) {
      return `The address to receive all asset balances from ${addressText}.`;
    } else if (flags === FLAG_OWNERSHIP) {
      return `The address to receive all asset ownership from ${addressText}.`;
    } else {
      return `The address to receive all assets and balances from ${addressText}.`;
    }
  };

  const handleSubmitInternal = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit(formData);
  };

  // Replace the hardcoded shouldShowHelpText with settings value
  const shouldShowHelpText = settings?.showHelpText;

  return (
    <div className="space-y-4">
      {sourceAddress && (
        <AddressHeader
          address={sourceAddress}
          walletName={activeWallet?.name}
          className="mb-4"
        />
      )}
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        <form onSubmit={handleSubmitInternal} className="space-y-4">
          {/* Sweep Type */}
          <Field className="relative">
            <Label className="text-sm font-medium text-gray-700 block">
              Sweep Type<span className="text-red-500">*</span>
            </Label>
            <div className="relative mt-1">
              <Select
                value={formData.flags}
                onChange={handleFlagsChange}
                className="w-full p-2 pr-8 rounded-md border bg-gray-50 appearance-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {flagOptions.map((option) => (
                  <option key={option.id} value={option.value}>
                    {option.name}
                  </option>
                ))}
              </Select>
              <FiChevronDown
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400"
                aria-hidden="true"
              />
            </div>
            <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? "" : "hidden"}`}>
              Choose whether to sweep asset balances only, asset ownership only, or both.
            </Description>
          </Field>

          {/* Destination */}
          <Field>
            <Label htmlFor="destination" className="text-sm font-medium text-gray-700 block">
              Destination<span className="text-red-500">*</span>
            </Label>
            <Input
              ref={destinationInputRef}
              id="destination"
              type="text"
              value={formData.destination}
              onChange={handleDestinationChange}
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
            <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? "" : "hidden"}`}>
              {getDestinationHelpText(formData.flags)}
            </Description>
          </Field>

          {/* Memo */}
          <Field>
            <Label htmlFor="memo" className="text-sm font-medium text-gray-700 block">
              Memo
            </Label>
            <Input
              id="memo"
              type="text"
              value={formData.memo}
              onChange={handleMemoChange}
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Optional memo (max 34 bytes)"
            />
            <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? "" : "hidden"}`}>
              If memo is valid hex, it will be treated as binary. Otherwise, it will be UTF-8 encoded.
            </Description>
          </Field>

          {/* Fee Rate */}
          <FeeRateInput
            value={formData.feeRateSatPerVByte}
            onChange={handleFeeRateChange}
            showHelpText={shouldShowHelpText}
          />

          <Button
            type="submit"
            color="blue"
            fullWidth
            disabled={!formData.destination || formData.feeRateSatPerVByte <= 0}
          >
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
