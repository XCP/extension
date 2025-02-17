import React, { useState, useRef, useEffect, Suspense } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { BalanceHeader } from "@/components/headers/balance-header";
import { AmountWithMaxInput } from "@/components/inputs/amount-with-max-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { isValidBase58Address } from "@/utils/blockchain/bitcoin";
import { useWallet } from "@/contexts/wallet-context";

export interface SendFormData {
  destination: string;
  asset: string;
  quantity: string;
  memo: string;
  feeRateSatPerVByte: number;
}

interface SendFormProps {
  onSubmit: (data: SendFormData) => void;
  initialAsset?: string;
}

export function SendForm({ onSubmit, initialAsset = "XCP" }: SendFormProps) {
  const [formData, setFormData] = useState<SendFormData>({
    destination: "",
    asset: initialAsset,
    quantity: "",
    memo: "",
    feeRateSatPerVByte: 1,
  });
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText;

  const { isLoading, error, data } = useAssetDetails(formData.asset);
  const { assetInfo, availableBalance } = data || {
    assetInfo: null,
    availableBalance: "0",
  };

  // Use the activeAddress from the wallet context.
  const { activeAddress } = useWallet();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.destination || !isValidBase58Address(formData.destination)) {
      setLocalError("Please enter a valid Bitcoin address.");
      return;
    }
    if (!formData.quantity || Number(formData.quantity) <= 0) {
      setLocalError("Please enter a valid quantity greater than zero.");
      return;
    }
    if (formData.feeRateSatPerVByte <= 0) {
      setLocalError("Please enter a valid fee rate greater than zero.");
      return;
    }
    setLocalError(null);
    const quantityNumber = Number(formData.quantity);
    const convertedQuantity = assetInfo?.divisible
      ? Math.round(quantityNumber * 1e8).toString()
      : Math.round(quantityNumber).toString();
    const updatedFormData: SendFormData = {
      ...formData,
      quantity: convertedQuantity,
    };
    onSubmit(updatedFormData);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-4">
      <div className="min-h-[80px]">
        <Suspense fallback={<div>Loading asset details...</div>}>
          {isLoading ? (
            <div className="animate-pulse h-12 bg-gray-200 rounded"></div>
          ) : error ? (
            <div className="text-red-500">{error.message}</div>
          ) : (
            <BalanceHeader
              balance={{
                asset: formData.asset,
                asset_info: assetInfo,
                quantity_normalized: availableBalance,
              }}
              className="mb-4"
            />
          )}
        </Suspense>
      </div>
      {localError && <div className="text-red-500 mb-2">{localError}</div>}
      <form onSubmit={handleSubmit} className="space-y-6">
        <Field>
          <Label className="text-sm font-medium text-gray-700">
            Destination <span className="text-red-500">*</span>
          </Label>
          <div className="relative mt-1 mb-2">
            <Input
              ref={inputRef}
              type="text"
              name="destination"
              value={formData.destination}
              onChange={(e) =>
                setFormData({ ...formData, destination: e.target.value.trim() })
              }
              required
              placeholder="Enter destination address"
              className="block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? "" : "hidden"}`}>
            Enter the destination address where you want to send.
          </Description>
        </Field>

        <AmountWithMaxInput
          asset={formData.asset}
          availableBalance={availableBalance}
          value={formData.quantity}
          onChange={(val: string) => setFormData({ ...formData, quantity: val })}
          feeRateSatPerVByte={formData.feeRateSatPerVByte}
          setError={setLocalError}
          shouldShowHelpText={shouldShowHelpText}
          sourceAddress={activeAddress}
          maxAmount={availableBalance}
          label="Amount"
          name="amount"
          destinationCount={1}
          destination={formData.destination}
          memo={formData.memo}
        />

        {formData.asset !== "BTC" && (
          <Field>
            <Label className="text-sm font-medium text-gray-700">Memo</Label>
            <Input
              type="text"
              value={formData.memo}
              onChange={(e) =>
                setFormData({ ...formData, memo: e.target.value })
              }
              placeholder="Optional memo"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
            <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? "" : "hidden"}`}>
              Optionally include a memo with your transaction.
            </Description>
          </Field>
        )}

        <FeeRateInput
          id="feeRateSatPerVByte"
          value={formData.feeRateSatPerVByte}
          onChange={(value: number) =>
            setFormData({ ...formData, feeRateSatPerVByte: value })
          }
          error={
            formData.feeRateSatPerVByte <= 0
              ? "Please enter a valid fee rate greater than zero."
              : ""
          }
          showLabel={true}
          label="Fee Rate (sat/vB)"
          showHelpText={shouldShowHelpText}
          autoFetch={true}
        />

        <Button type="submit" color="blue" fullWidth>
          Continue
        </Button>
      </form>
    </div>
  );
}
