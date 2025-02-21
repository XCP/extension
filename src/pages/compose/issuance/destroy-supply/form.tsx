import React, { useState, useRef, useEffect, FormEvent } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { BalanceHeader } from "@/components/headers/balance-header";
import { AmountWithMaxInput } from "@/components/inputs/amount-with-max-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useWallet } from "@/contexts/wallet-context";
import { useSettings } from "@/contexts/settings-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";

export interface DestroyFormData {
  asset: string;
  quantity: string;
  memo: string;

}

interface DestroyFormProps {
  onSubmit: (data: DestroyFormData) => void;
  initialAsset: string;
}

export function DestroyForm({ onSubmit, initialAsset }: DestroyFormProps) {
  const { activeAddress } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText;
  const { isLoading, error, data } = useAssetDetails(initialAsset);

  const [formData, setFormData] = useState<DestroyFormData>({
    asset: initialAsset,
    quantity: "",
    memo: "",

  });
  const [localError, setLocalError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  if (isLoading) {
    return <div className="p-4">Loading asset details...</div>;
  }

  if (error || !data) {
    return <div className="p-4 text-red-500">Error loading asset details</div>;
  }

  const handleQuantityChange = (value: string) => {
    setFormData((prev) => ({ ...prev, quantity: value }));
  };

  const handleMemoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, memo: e.target.value }));
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.quantity || Number(formData.quantity) <= 0 || !formData.memo.trim() || formData.feeRateSatPerVByte <= 0) {
      setLocalError("Please fill all required fields with valid values.");
      return;
    }
    setLocalError(null);
    onSubmit(formData);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
      <BalanceHeader
        balance={{
          asset: formData.asset,
          asset_info: data.assetInfo,
          quantity_normalized: data.availableBalance,
        }}
        className="mb-4"
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        <AmountWithMaxInput
          label="Amount"
          name="amount"
          value={formData.quantity}
          onChange={handleQuantityChange}
          asset={formData.asset}
          availableBalance={data.availableBalance}
          feeRateSatPerVByte={formData.feeRateSatPerVByte}
          setError={setLocalError}
          sourceAddress={activeAddress}
          maxAmount={data.availableBalance}
          shouldShowHelpText={shouldShowHelpText}
          disabled={false}
          destination=""
          memo={formData.memo}
        />

        <Field>
          <Label htmlFor="memo" className="block text-sm font-medium text-gray-700">
            Memo<span className="text-red-500">*</span>
          </Label>
          <Input
            id="memo"
            type="text"
            value={formData.memo}
            onChange={handleMemoChange}
            ref={textareaRef}
            className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 hover:border-gray-400"
            required
          />
          <Description className="mt-2 text-sm text-gray-500">
            A memo is required for destroy transactions.
          </Description>
        </Field>

        <FeeRateInput
          value={formData.feeRateSatPerVByte}
          onChange={(value) => setFormData((prev) => ({ ...prev, feeRateSatPerVByte: value }))}
          error={formData.feeRateSatPerVByte <= 0 ? "Fee rate must be greater than zero." : ""}
          showHelpText={shouldShowHelpText}
        />

        {localError && <div className="text-red-500 text-sm">{localError}</div>}

        <Button
          type="submit"
          color="blue"
          fullWidth
          disabled={
            !formData.quantity ||
            Number(formData.quantity) <= 0 ||
            formData.feeRateSatPerVByte <= 0 ||
            !formData.memo.trim()
          }
        >
          Continue
        </Button>
      </form>
    </div>
  );
}
