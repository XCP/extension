import React, { useState, useRef, useEffect, FormEvent } from "react";
import { Field, Label, Description, Textarea, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { AddressHeader } from "@/components/headers/address-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { BroadcastOptions } from "@/utils/blockchain/counterparty";

interface BroadcastFormDataInternal {
  text: string;
  value: string;
  sat_per_vbyte: number;
}

interface BroadcastFormProps {
  onSubmit: (data: BroadcastOptions) => void;
  initialFormData?: BroadcastOptions;
}

export function BroadcastForm({ onSubmit, initialFormData }: BroadcastFormProps) {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText ?? false;

  const [formData, setFormData] = useState<BroadcastFormDataInternal>(() => ({
    text: initialFormData?.text || "",
    value: initialFormData?.value || "",
    sat_per_vbyte: initialFormData?.sat_per_vbyte || 1,
  }));
  const [localError, setLocalError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.text.trim()) {
      setLocalError("Message is required.");
      return;
    }
    if (formData.sat_per_vbyte <= 0) {
      setLocalError("Fee rate must be greater than zero.");
      return;
    }
    setLocalError(null);

    const submissionData: BroadcastOptions = {
      sourceAddress: activeAddress?.address || "",
      text: formData.text.trim(),
      value: formData.value || "0",
      sat_per_vbyte: formData.sat_per_vbyte,
    };
    onSubmit(submissionData);
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
      {localError && <div className="text-red-500 mb-2">{localError}</div>}
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field>
            <Label htmlFor="broadcast-message" className="block text-sm font-medium text-gray-700">
              Message <span className="text-red-500">*</span>
            </Label>
            <Textarea
              ref={textareaRef}
              id="broadcast-message"
              value={formData.text}
              onChange={(e) => setFormData({ ...formData, text: e.target.value })}
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 hover:border-gray-400"
              required
              rows={4}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the message you want to broadcast.
            </Description>
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
              onChange={(e) => {
                const value = e.target.value;
                if (value === "" || /^\d*$/.test(value)) {
                  setFormData({ ...formData, value });
                }
              }}
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 hover:border-gray-400"
              placeholder="0"
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Optional numeric value if publishing data.
            </Description>
          </Field>
          <FeeRateInput
            id="sat_per_vbyte"
            value={formData.sat_per_vbyte}
            onChange={(value) => setFormData({ ...formData, sat_per_vbyte: value })}
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
