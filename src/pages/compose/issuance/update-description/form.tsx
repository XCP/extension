import React, { useEffect, useRef, FormEvent } from "react";
import { Field, Label, Description, Textarea } from "@headlessui/react";
import { Button } from "@/components/button";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";

export interface UpdateDescriptionFormData {
  description: string;

}

interface UpdateDescriptionFormProps {
  formData: UpdateDescriptionFormData;
  setFormData: React.Dispatch<React.SetStateAction<UpdateDescriptionFormData>>;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  shouldShowHelpText: boolean;
}

export const UpdateDescriptionForm = ({
  formData,
  setFormData,
  handleSubmit,
  shouldShowHelpText,
}: UpdateDescriptionFormProps) => {
  useEffect(() => {
    if (!formData.feeRateSatPerVByte) {
      setFormData((prev) => ({ ...prev, feeRateSatPerVByte: 1 }));
    }
  }, [formData.feeRateSatPerVByte, setFormData]);

  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    descriptionRef.current?.focus();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field>
          <Label htmlFor="description" className="block text-sm font-medium text-gray-700">
            New Description<span className="text-red-500">*</span>
          </Label>
          <Textarea
            ref={descriptionRef}
            id="description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
            rows={3}
            required
          />
          {shouldShowHelpText && (
            <Description className="mt-2 text-sm text-gray-500">
              Enter the new description for the asset.
            </Description>
          )}
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
          disabled={!formData.description.trim() || formData.feeRateSatPerVByte <= 0}
        >
          Continue
        </Button>
      </form>
    </div>
  );
};
