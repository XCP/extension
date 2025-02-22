import React, { useState, useRef, useEffect, FormEvent } from "react";
import { Field, Label, Description, Textarea } from "@headlessui/react";
import { Button } from "@/components/button";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { IssuanceOptions } from "@/utils/blockchain/counterparty";

interface UpdateDescriptionFormDataInternal {
  description: string;
  sat_per_vbyte: number;
}

interface UpdateDescriptionFormProps {
  onSubmit: (data: IssuanceOptions) => void;
  initialFormData?: IssuanceOptions;
  asset: string; // Added to match typical form props
}

export function UpdateDescriptionForm({ onSubmit, initialFormData, asset }: UpdateDescriptionFormProps) {
  const { activeAddress } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText ?? false;

  const [formData, setFormData] = useState<UpdateDescriptionFormDataInternal>(() => ({
    description: initialFormData?.description || "",
    sat_per_vbyte: initialFormData?.sat_per_vbyte || 1,
  }));
  const [localError, setLocalError] = useState<string | null>(null);

  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    descriptionRef.current?.focus();
  }, []);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.description.trim()) {
      setLocalError("Description is required.");
      return;
    }
    if (formData.sat_per_vbyte <= 0) {
      setLocalError("Fee rate must be greater than zero.");
      return;
    }
    setLocalError(null);

    const submissionData: IssuanceOptions = {
      sourceAddress: activeAddress?.address || "",
      asset,
      quantity: 0,
      divisible: true, // Default, as this is just updating description
      lock: false,
      reset: false,
      description: formData.description.trim(),
      sat_per_vbyte: formData.sat_per_vbyte,
    };
    onSubmit(submissionData);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
      {localError && <div className="text-red-500 mb-2">{localError}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field>
          <Label htmlFor="description" className="block text-sm font-medium text-gray-700">
            New Description <span className="text-red-500">*</span>
          </Label>
          <Textarea
            ref={descriptionRef}
            id="description"
            name="description"
            value={formData.description}
            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
            rows={3}
            required
          />
          <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
            Enter the new description for the asset.
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
  );
}
