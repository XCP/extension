import React, { useState, useRef, useEffect, FormEvent } from "react";
import { Field, Label, Description, Textarea } from "@headlessui/react";
import { Button } from "@/components/button";
import { AddressHeader } from "@/components/headers/address-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { CancelOptions } from "@/utils/blockchain/counterparty";

interface CancelFormDataInternal {
  offer_hash: string;
  sat_per_vbyte: number;
}

interface CancelFormProps {
  onSubmit: (data: CancelOptions) => void;
  initialFormData?: CancelOptions;
  initialHash?: string;
}

export function CancelForm({ onSubmit, initialFormData, initialHash }: CancelFormProps) {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText ?? false;

  const [formData, setFormData] = useState<CancelFormDataInternal>(() => ({
    offer_hash: initialFormData?.offer_hash || initialHash || "",
    sat_per_vbyte: initialFormData?.sat_per_vbyte || 1,
  }));
  const [localError, setLocalError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.offer_hash.trim()) {
      setLocalError("Offer hash is required.");
      return;
    }
    if (formData.sat_per_vbyte <= 0) {
      setLocalError("Fee rate must be greater than zero.");
      return;
    }
    setLocalError(null);

    const submissionData: CancelOptions = {
      sourceAddress: activeAddress?.address || "",
      offer_hash: formData.offer_hash.trim(),
      sat_per_vbyte: formData.sat_per_vbyte,
    };
    onSubmit(submissionData);
  };

  return (
    <div className="space-y-4">
      {activeAddress && (
        <AddressHeader address={activeAddress.address} walletName={activeWallet?.name} className="mb-6" />
      )}
      {localError && <div className="text-red-500 mb-2">{localError}</div>}
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field>
            <Label htmlFor="offer-hash" className="block text-sm font-medium text-gray-700">
              Offer Hash <span className="text-red-500">*</span>
            </Label>
            <Textarea
              ref={textareaRef}
              id="offer-hash"
              value={formData.offer_hash}
              onChange={(e) => setFormData((prev) => ({ ...prev, offer_hash: e.target.value }))}
              rows={3}
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the hash of the order you want to cancel.
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
