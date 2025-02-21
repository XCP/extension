import React, { useRef, useEffect, FormEvent, useState } from "react";
import { Field, Label, Description, Textarea, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { AddressHeader } from "@/components/headers/address-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useComposer } from "@/contexts/composer-context";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";

export interface BroadcastFormData {
  text: string;
  value: string;
  feeRateSatPerVByte: number;
}

interface BroadcastFormProps {
  onSubmit: (data: BroadcastFormData) => void;
}

export function BroadcastForm({ onSubmit }: BroadcastFormProps) {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const { formData: existingFormData } = useComposer();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [formData, setFormData] = useState<Omit<BroadcastFormData, 'feeRateSatPerVByte'>>(() => {
    if (
      existingFormData &&
      'text' in existingFormData &&
      'value' in existingFormData
    ) {
      return existingFormData as Omit<BroadcastFormData, 'feeRateSatPerVByte'>;
    }
    return { text: "", value: "" };
  });
  const [feeRate, setFeeRate] = useState<number>(0);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, text: e.target.value }));
  };

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === "" || /^\d*$/.test(value)) {
      setFormData((prev) => ({ ...prev, value }));
    }
  };

  const handleSubmitInternal = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (feeRate <= 0) return;
    onSubmit({
      ...formData,
      value: formData.value || "0",
      feeRateSatPerVByte: feeRate,
    });
  };

  return (
    <div className="space-y-4">
      {activeAddress && (
        <AddressHeader
          address={activeAddress.address}
          walletName={activeWallet?.name ?? ""}
          className="mb-4"
        />
      )}
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        <form onSubmit={handleSubmitInternal} className="space-y-4">
          <Field>
            <Label htmlFor="broadcast-message" className="block text-sm font-medium text-gray-700">
              Message<span className="text-red-500">*</span>
            </Label>
            <Textarea
              ref={textareaRef}
              id="broadcast-message"
              value={formData.text}
              onChange={handleTextChange}
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 hover:border-gray-400"
              required
              rows={4}
            />
            {settings?.showHelpText && (
              <Description className="mt-2 text-sm text-gray-500">
                Enter the message you want to broadcast.
              </Description>
            )}
          </Field>
          <Field>
            <Label htmlFor="broadcast-value" className="block text-sm font-medium text-gray-700">
              Value
            </Label>
            <Input
              id="broadcast-value"
              type="text"
              inputMode="numeric"
              pattern="\d*"
              value={formData.value}
              onChange={handleValueChange}
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 hover:border-gray-400"
              placeholder="0"
            />
            {settings?.showHelpText && (
              <Description className="mt-2 text-sm text-gray-500">
                Optional numeric value if publishing data.
              </Description>
            )}
          </Field>
          <FeeRateInput
            onChange={setFeeRate}
            error={feeRate <= 0 ? "Fee rate must be greater than zero." : ""}
            showHelpText={settings?.showHelpText}
          />
          <Button
            type="submit"
            color="blue"
            fullWidth
            disabled={!formData.text.trim() || feeRate <= 0}
          >
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
