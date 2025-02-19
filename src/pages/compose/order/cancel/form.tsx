import React, { useState, useRef, useEffect, FormEvent } from "react";
import { Field, Label, Description, Textarea } from "@headlessui/react";
import { Button } from "@/components/button";
import { AddressHeader } from "@/components/headers/address-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useWallet } from "@/contexts/wallet-context";
import { useSettings } from "@/contexts/settings-context";

export interface CancelFormData {
  offer_hash: string;
  sat_per_vbyte: number;
}

const DEFAULT_FORM_DATA: CancelFormData = {
  offer_hash: "",
  sat_per_vbyte: 1,
};

interface CancelFormProps {
  onSubmit: (data: CancelFormData) => void;
  initialHash?: string;
}

export function CancelForm({ onSubmit, initialHash }: CancelFormProps) {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText;
  const [formData, setFormData] = useState<CancelFormData>(() => ({
    offer_hash: initialHash || "",
    sat_per_vbyte: 1,
  }));
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleOfferHashChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, offer_hash: e.target.value }));
  };

  const handleFeeRateChange = (value: number) => {
    setFormData((prev) => ({ ...prev, sat_per_vbyte: value }));
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.offer_hash.trim() || formData.sat_per_vbyte <= 0) return;
    onSubmit(formData);
  };

  return (
    <div className="space-y-4">
      {activeAddress && (
        <AddressHeader
          address={activeAddress.address}
          walletName={activeWallet?.name}
          className="mb-6"
        />
      )}
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
              onChange={handleOfferHashChange}
              rows={3}
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
            <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? "" : "hidden"}`}>
              Enter the hash of the order you want to cancel.
            </Description>
          </Field>

          <FeeRateInput
            value={formData.sat_per_vbyte}
            onChange={handleFeeRateChange}
            showHelpText={shouldShowHelpText}
          />

          <Button
            type="submit"
            color="blue"
            fullWidth
            disabled={!formData.offer_hash.trim() || formData.sat_per_vbyte <= 0}
          >
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
