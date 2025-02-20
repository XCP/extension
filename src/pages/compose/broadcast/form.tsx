import React, { useRef, useEffect, FormEvent, useState } from "react";
import { Field, Label, Description, Textarea, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { AddressHeader } from "@/components/headers/address-header";
import { useWallet } from "@/contexts/wallet-context";
import { useSettings } from "@/contexts/settings-context";
import { useComposer } from "@/contexts/composer-context";

export interface BroadcastFormData {
  text: string;
  feeRateSatPerVByte: number;
  value: string;
}

const DEFAULT_FORM_DATA: BroadcastFormData = {
  text: '',
  feeRateSatPerVByte: 1,
  value: '',
};

interface BroadcastFormProps {
  onSubmit: (data: BroadcastFormData) => void;
}

export function BroadcastForm({
  onSubmit,
}: BroadcastFormProps) {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const { formData: existingFormData } = useComposer();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [formData, setFormData] = useState<BroadcastFormData>(() => {
    if (existingFormData) {
      return existingFormData as BroadcastFormData;
    }
    return DEFAULT_FORM_DATA;
  });

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, text: e.target.value }));
  };

  const handleFeeRateChange = (value: number) => {
    setFormData((prev) => ({ ...prev, feeRateSatPerVByte: value }));
  };

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d*$/.test(value)) {
      setFormData((prev) => ({ ...prev, value }));
    }
  };

  const handleSubmitInternal = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submissionData = {
      ...formData,
      value: formData.value || '0',
      sat_per_vbyte: formData.feeRateSatPerVByte,
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
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        <form onSubmit={handleSubmitInternal} className="space-y-4">
          <Field>
            <Label
              htmlFor="broadcast-message"
              className="block text-sm font-medium text-gray-700"
            >
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
            <Label
              htmlFor="broadcast-value"
              className="block text-sm font-medium text-gray-700"
            >
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
            value={formData.feeRateSatPerVByte}
            onChange={handleFeeRateChange}
            showHelpText={settings?.showHelpText}
          />

          <Button
            type="submit"
            color="blue"
            fullWidth
            disabled={!formData.text.trim() || formData.feeRateSatPerVByte <= 0}
          >
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
