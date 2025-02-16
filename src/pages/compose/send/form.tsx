import React, { useState, useRef, useEffect, Suspense } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { BalanceHeader } from "@/components/headers/balance-header";
import { useSettings } from "@/contexts/settings-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { isValidBase58Address } from "@/utils/blockchain/bitcoin";

export interface SendFormData {
  destination: string;
  asset: string;
  quantity: string; // This value will be converted to an integer string if the asset is divisible.
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

  // Get asset details which include divisibility and available balance.
  const { isLoading, error, data } = useAssetDetails(formData.asset);
  const { assetInfo, availableBalance } = data || {
    assetInfo: null,
    availableBalance: "0",
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Basic validations
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

    console.log(assetInfo);

    // --- Conversion Logic ---
    // If the asset is divisible, multiply the entered quantity by 1e8.
    // (If your asset requires a different multiplier—like 1e7—adjust accordingly.)
    const quantityNumber = Number(formData.quantity);
    const convertedQuantity = assetInfo?.divisible
      ? Math.round(quantityNumber * 1e8).toString()
      : Math.round(quantityNumber).toString();

    // Create a new form data object with the converted quantity.
    const updatedFormData: SendFormData = {
      ...formData,
      quantity: convertedQuantity,
    };

    onSubmit(updatedFormData);
  };

  const handleMaxAmount = () => {
    setFormData({ ...formData, quantity: availableBalance });
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-4">
      {/* Asset details section wrapped in Suspense */}
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
          <Description
            className={`mt-2 text-sm text-gray-500 ${
              shouldShowHelpText ? "" : "hidden"
            }`}
          >
            Enter the destination address where you want to send.
          </Description>
        </Field>

        <Field>
          <Label className="text-sm font-medium text-gray-700">
            Amount <span className="text-red-500">*</span>
          </Label>
          <div className="relative mt-1">
            <Input
              type="text"
              value={formData.quantity}
              onChange={(e) =>
                setFormData({ ...formData, quantity: e.target.value })
              }
              required
              placeholder="Enter amount"
              className="block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500 pr-24"
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleMaxAmount}
              className="absolute right-1 top-1/2 transform -translate-y-1/2 px-2 py-1 text-sm"
            >
              Max
            </Button>
          </div>
          <Description
            className={`mt-2 text-sm text-gray-500 ${
              shouldShowHelpText ? "" : "hidden"
            }`}
          >
            Available balance: {availableBalance} {formData.asset}
          </Description>
        </Field>

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
            <Description
              className={`mt-2 text-sm text-gray-500 ${
                shouldShowHelpText ? "" : "hidden"
              }`}
            >
              Optionally include a memo with your transaction.
            </Description>
          </Field>
        )}

        <Field>
          <Label className="text-sm font-medium text-gray-700">
            Fee Rate (sat/vB) <span className="text-red-500">*</span>
          </Label>
          <div className="mt-1">
            <Input
              type="number"
              min="1"
              step="0.1"
              value={formData.feeRateSatPerVByte}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  feeRateSatPerVByte: parseFloat(e.target.value) || 0,
                })
              }
              required
              className="block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <Description
            className={`mt-2 text-sm text-gray-500 ${
              shouldShowHelpText ? "" : "hidden"
            }`}
          >
            Higher fees may result in faster confirmation times.
          </Description>
        </Field>

        <Button type="submit" color="blue" fullWidth>
          Continue
        </Button>
      </form>
    </div>
  );
}
