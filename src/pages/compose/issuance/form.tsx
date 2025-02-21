import React, { useState, useEffect, FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Field, Label, Description, Input, Textarea } from "@headlessui/react";
import { Button } from "@/components/button";
import { CheckboxInput } from "@/components/inputs/checkbox-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";

export interface IssuanceFormData {
  asset: string;
  quantity: string;
  divisible: boolean;
  lock: boolean;
  description: string;

}

const DEFAULT_FORM_DATA: IssuanceFormData = {
  asset: "",
  quantity: "",
  divisible: true,
  lock: false,
  description: "",
  feeRateSatPerVByte: 1,
};

interface IssuanceFormProps {
  onSubmit: (data: IssuanceFormData) => void;
  initialParentAsset?: string;
}

export const IssuanceForm = ({ onSubmit, initialParentAsset }: IssuanceFormProps) => {
  const [searchParams] = useSearchParams();
  const parentAsset = searchParams.get("parent");

  const [formData, setFormData] = useState<IssuanceFormData>({
    ...DEFAULT_FORM_DATA,
    asset: initialParentAsset ? `${initialParentAsset}.` : "",
  });
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText;

  useEffect(() => {
    const assetInput = document.getElementById("asset");
    assetInput?.focus();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.asset.trim() || !formData.quantity || Number(formData.quantity) <= 0 || formData.feeRateSatPerVByte <= 0) {
      return; // Validation handled by form fields and FeeRateInput
    }
    onSubmit(formData);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
      <form onSubmit={handleSubmit} className="space-y-4">
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
            placeholder={initialParentAsset ? `${initialParentAsset}.SUBASSET` : "Enter asset name"}
          />
          <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
            {initialParentAsset
              ? `Enter a subasset name after "${initialParentAsset}." to create a subasset`
              : "The name of the asset to issue. This can also be a subasset or numeric asset name."}
          </Description>
        </Field>

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
            min="0"
          />
          <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
            The quantity of the asset to issue.
          </Description>
        </Field>

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
          <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
            A textual description for the asset.
          </Description>
        </Field>

        <FeeRateInput
          value={formData.feeRateSatPerVByte}
          onChange={(value) => setFormData((prev) => ({ ...prev, feeRateSatPerVByte: value }))}
          error={formData.feeRateSatPerVByte <= 0 ? "Fee rate must be greater than zero." : ""}
          showHelpText={shouldShowHelpText}
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
