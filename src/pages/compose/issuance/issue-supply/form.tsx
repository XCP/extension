import React, { useState, useRef, useEffect, FormEvent } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { useWallet } from "@/contexts/wallet-context";
import { ErrorAlert } from "@/components/error-alert";
import { LoadingSpinner } from "@/components/loading-spinner";
import { toBigNumber } from "@/utils/numeric";

export interface IssueSupplyFormData {
  quantity: string;
  feeRateSatPerVByte: number;
}

interface IssueSupplyFormProps {
  onSubmit: (data: IssueSupplyFormData) => void;
  shouldShowHelpText?: boolean;
  asset: string;
}

export const IssueSupplyForm = ({
  onSubmit,
  shouldShowHelpText = true,
  asset,
}: IssueSupplyFormProps) => {
  const { activeAddress } = useWallet();
  const { data: assetDetails, isLoading, error } = useAssetDetails(asset);

  const [formData, setFormData] = useState<IssueSupplyFormData>({
    quantity: "",
    feeRateSatPerVByte: 0,
  });

  const quantityInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    quantityInputRef.current?.focus();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFeeRateChange = (value: number) => {
    setFormData((prev) => ({ ...prev, feeRateSatPerVByte: value }));
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit(formData);
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error || !assetDetails) {
    return <ErrorAlert message={error?.message || "Failed to load asset details"} />;
  }

  const { isDivisible, assetInfo } = assetDetails;

  return (
    <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
      {/* Asset Info Summary */}
      <div className="mb-4 p-3 bg-gray-50 rounded-md">
        <h3 className="text-sm font-medium text-gray-700">Asset Details</h3>
        <div className="mt-2 text-sm text-gray-600">
          <p>Current Supply: {assetInfo?.supply || "0"}</p>
          <p>Divisible: {isDivisible ? "Yes" : "No"}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Quantity Input */}
        <Field>
          <Label htmlFor="quantity" className="block text-sm font-medium text-gray-700">
            Quantity<span className="text-red-500">*</span>
          </Label>
          <Input
            ref={quantityInputRef}
            id="quantity"
            name="quantity"
            type="text"
            value={formData.quantity}
            onChange={handleInputChange}
            className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
            required
          />
          {shouldShowHelpText && (
            <Description className="mt-2 text-sm text-gray-500">
              {assetInfo && assetInfo.divisible
                ? "Enter the quantity to issue (up to 8 decimal places)."
                : "Enter a whole number quantity."}
            </Description>
          )}
        </Field>

        {/* Fee Rate Input */}
        <FeeRateInput
          value={formData.feeRateSatPerVByte}
          onChange={handleFeeRateChange}
          showHelpText={shouldShowHelpText}
        />

        <Button
          type="submit"
          color="blue"
          fullWidth
          disabled={
            !formData.quantity.trim() ||
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
