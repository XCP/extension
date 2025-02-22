import React, { useState, useRef, useEffect, FormEvent } from "react";
import { Field, Label, Description, Textarea } from "@headlessui/react";
import { Button } from "@/components/button";
import { AddressHeader } from "@/components/headers/address-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { BTCPayOptions } from "@/utils/blockchain/counterparty";

interface BTCPayFormDataInternal {
  order_match_id: string;
  sat_per_vbyte: number;
}

interface BTCPayFormProps {
  onSubmit: (data: BTCPayOptions) => void;
  initialFormData?: BTCPayOptions;
}

export function BTCPayForm({ onSubmit, initialFormData }: BTCPayFormProps) {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText ?? false;

  const [formData, setFormData] = useState<BTCPayFormDataInternal>(() => ({
    order_match_id: initialFormData?.order_match_id || "",
    sat_per_vbyte: initialFormData?.sat_per_vbyte || 1,
  }));
  const [localError, setLocalError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.order_match_id.trim()) {
      setLocalError("Order match ID is required.");
      return;
    }
    if (formData.sat_per_vbyte <= 0) {
      setLocalError("Fee rate must be greater than zero.");
      return;
    }
    setLocalError(null);

    const submissionData: BTCPayOptions = {
      sourceAddress: activeAddress?.address || "",
      order_match_id: formData.order_match_id.trim(),
      sat_per_vbyte: formData.sat_per_vbyte,
    };
    onSubmit(submissionData);
  };

  return (
    <div className="space-y-4">
      {activeAddress && (
        <AddressHeader address={activeAddress.address} walletName={activeWallet?.name} className="mb-4" />
      )}
      {localError && <div className="text-red-500 mb-2">{localError}</div>}
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field>
            <Label htmlFor="order-match-id" className="block text-sm font-medium text-gray-700">
              Order Match ID <span className="text-red-500">*</span>
            </Label>
            <Textarea
              ref={textareaRef}
              id="order-match-id"
              value={formData.order_match_id}
              onChange={(e) => setFormData((prev) => ({ ...prev, order_match_id: e.target.value }))}
              rows={3}
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the ID of the order match you want to pay for.
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
