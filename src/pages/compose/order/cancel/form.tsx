import React, { useState, useRef, useEffect, FormEvent } from "react";
import { Field, Label, Description, Textarea } from "@headlessui/react";
import { Button } from "@/components/button";
import { AddressHeader } from "@/components/headers/address-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";

export interface CancelFormData {
  offer_hash: string;

}

const DEFAULT_FORM_DATA: CancelFormData = {
  offer_hash: "",
  feeRateSatPerVByte: 1,
};

interface CancelFormProps {
  onSubmit: (data: CancelFormData) => void;
  initialHash?: string;
}

export function CancelForm({ onSubmit, initialHash }: CancelFormProps) {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText;
  const [formData, setFormData] = useState<CancelFormData>({
    offer_hash: initialHash || "",

  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleOfferHashChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, offer_hash: e.target.value }));
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.offer_hash.trim() || formData.feeRateSatPerVByte <= 0) return;
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
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the hash of the order you want to cancel.
            </Description>
          </Field>

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
            disabled={!formData.offer_hash.trim() || formData.feeRateSatPerVByte <= 0}
          >
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
