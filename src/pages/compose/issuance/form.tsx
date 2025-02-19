import React, { useState, useEffect, FormEvent } from "react";
import { Field, Label, Description, Input, Textarea } from "@headlessui/react";
import { Button } from "@/components/button";
import { CheckboxInput } from "@/components/inputs/checkbox-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";

export interface IssuanceFormData {
  asset: string;
  quantity: string;
  divisible: boolean;
  lock: boolean;
  description: string;
  feeRateSatPerVByte: number;
}

const DEFAULT_FORM_DATA: IssuanceFormData = {
  asset: "",
  quantity: "",
  divisible: true,
  lock: false,
  description: "",
  feeRateSatPerVByte: 0,
};

interface IssuanceFormProps {
  onSubmit: (data: IssuanceFormData) => void;
}

export const IssuanceForm = ({ onSubmit }: IssuanceFormProps) => {
  const [formData, setFormData] = useState<IssuanceFormData>(DEFAULT_FORM_DATA);

  // Focus the asset input on mount
  useEffect(() => {
    const assetInput = document.getElementById("asset");
    assetInput?.focus();
  }, []);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFeeRateChange = (value: number) => {
    setFormData((prev) => ({ ...prev, feeRateSatPerVByte: value }));
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
      <form
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          onSubmit(formData);
        }}
        className="space-y-4"
      >
        {/* Asset Name */}
        <Field>
          <Label htmlFor="asset" className="block text-sm font-medium text-gray-700">
            Asset Name<span className="text-red-500">*</span>
          </Label>
          <Input
            id="asset"
            name="asset"
            type="text"
            value={formData.asset}
            onChange={handleInputChange}
            className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
            required
          />
          <Description className="mt-2 text-sm text-gray-500">
            The name of the asset to issue. This can also be a subasset or numeric asset name.
          </Description>
        </Field>

        {/* Quantity */}
        <Field>
          <Label htmlFor="quantity" className="block text-sm font-medium text-gray-700">
            Amount<span className="text-red-500">*</span>
          </Label>
          <Input
            id="quantity"
            name="quantity"
            type="number"
            value={formData.quantity}
            onChange={handleInputChange}
            className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
            required
          />
          <Description className="mt-2 text-sm text-gray-500">
            The quantity of the asset to issue.
          </Description>
        </Field>

        {/* Divisible & Locked */}
        <div className="grid grid-cols-2 gap-4">
          <CheckboxInput
            checked={formData.divisible}
            onChange={(checked) => setFormData((prev) => ({ ...prev, divisible: checked }))}
            label="Divisible"
            aria-label="Toggle asset divisibility"
          />
          <CheckboxInput
            checked={formData.lock}
            onChange={(checked) => setFormData((prev) => ({ ...prev, lock: checked }))}
            label="Locked"
            aria-label="Toggle supply lock"
          />
        </div>

        {/* Description */}
        <Field>
          <Label htmlFor="description" className="block text-sm font-medium text-gray-700">
            Description
          </Label>
          <Textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
            rows={2}
          />
          <Description className="mt-2 text-sm text-gray-500">
            A textual description for the asset.
          </Description>
        </Field>

        {/* Fee Rate */}
        <FeeRateInput
          value={formData.feeRateSatPerVByte}
          onChange={handleFeeRateChange}
          showHelpText={true}
        />

        <Button
          type="submit"
          color="blue"
          fullWidth
          disabled={
            !formData.asset.trim() ||
            !formData.quantity ||
            Number(formData.quantity) <= 0 ||
            formData.feeRateSatPerVByte <= 0
          }
        >
          Continue
        </Button>
      </form>
    </div>
  );
};
