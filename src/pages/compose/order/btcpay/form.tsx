import React, { useState, useRef, useEffect, FormEvent } from "react";
import { Field, Label, Description, Textarea } from "@headlessui/react";
import { Button } from "@/components/button";
import { AddressHeader } from "@/components/headers/address-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useWallet } from "@/contexts/wallet-context";

export interface BTCPayFormData {
  order_match_id: string;
 // Renamed from sat_per_vbyte for consistency
}

const DEFAULT_FORM_DATA: BTCPayFormData = {
  order_match_id: "",
  feeRateSatPerVByte: 1,
};

interface BTCPayFormProps {
  onSubmit: (data: BTCPayFormData) => void;
}

export function BTCPayForm({ onSubmit }: BTCPayFormProps) {
  const { activeAddress, activeWallet } = useWallet();
  const [formData, setFormData] = useState<BTCPayFormData>(DEFAULT_FORM_DATA);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleOrderMatchIdChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, order_match_id: e.target.value }));
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.order_match_id.trim() || formData.feeRateSatPerVByte <= 0) return;
    onSubmit(formData);
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
            <Label htmlFor="order-match-id" className="block text-sm font-medium text-gray-700">
              Order Match ID <span className="text-red-500">*</span>
            </Label>
            <Textarea
              ref={textareaRef}
              id="order-match-id"
              value={formData.order_match_id}
              onChange={handleOrderMatchIdChange}
              rows={3}
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
            <Description className="mt-2 text-sm text-gray-500">
              Enter the ID of the order match you want to pay for.
            </Description>
          </Field>

          <FeeRateInput
            value={formData.feeRateSatPerVByte}
            onChange={(value) =>
              setFormData((prev) => ({ ...prev, feeRateSatPerVByte: value }))
            }
            error={formData.feeRateSatPerVByte <= 0 ? "Fee rate must be greater than zero." : ""}
            showHelpText={true}
          />

          <Button
            type="submit"
            color="blue"
            fullWidth
            disabled={!formData.order_match_id.trim() || formData.feeRateSatPerVByte <= 0}
          >
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
