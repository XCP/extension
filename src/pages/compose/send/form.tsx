// src/components/forms/SendForm.tsx
import React, { useState, useRef, useEffect } from "react";
import { FiPlus, FiMinus } from "react-icons/fi";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { BalanceHeader } from "@/components/headers/balance-header";
import { useSettings } from "@/contexts/settings-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { isValidBase58Address } from "@/utils/blockchain/bitcoin";

export interface Destination {
  id: number;
  address: string;
}

export interface SendFormData {
  destinations: Destination[];
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
    destinations: [{ id: 1, address: "" }],
    asset: initialAsset,
    quantity: "",
    memo: "",
    feeRateSatPerVByte: 1,
  });
  const [localError, setLocalError] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Get user settings for help text.
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText;

  // Now use the new useAssetDetails hook which suspends until data is available.
  const { isLoading, error, data } = useAssetDetails(formData.asset);
  const { isDivisible, assetInfo, availableBalance } = data || {
    isDivisible: false,
    assetInfo: null,
    availableBalance: "0"
  };

  const enableMPMA = true;

  // Auto-focus the first destination input on mount (if nothing else is focused)
  useEffect(() => {
    if (document.activeElement === document.body) {
      const timer = setTimeout(() => {
        if (document.activeElement === document.body) {
          firstInputRef.current?.focus();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDestinationChange = (id: number, value: string) => {
    const updatedDestinations = formData.destinations.map((dest) =>
      dest.id === id ? { ...dest, address: value.trim() } : dest
    );
    setFormData({ ...formData, destinations: updatedDestinations });
    if (value && !isValidBase58Address(value)) {
      setLocalError(`Invalid Bitcoin address format: ${value}`);
    } else {
      setLocalError(null);
    }
  };

  const addDestination = () => {
    setFormData({
      ...formData,
      destinations: [
        ...formData.destinations,
        { id: Date.now() + Math.random(), address: "" },
      ],
    });
  };

  const removeDestination = (id: number) => {
    const updated = formData.destinations.filter((dest) => dest.id !== id);
    setFormData({ ...formData, destinations: updated });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    for (const dest of formData.destinations) {
      if (!dest.address || !isValidBase58Address(dest.address)) {
        setLocalError("Please enter a valid Bitcoin address for each destination.");
        return;
      }
    }
    if (!formData.quantity || Number(formData.quantity) <= 0) {
      setLocalError("Please enter a valid quantity greater than zero.");
      return;
    }
    if (formData.feeRateSatPerVByte <= 0) {
      setLocalError("Please enter a valid fee rate greater than zero.");
      return;
    }
    onSubmit(formData);
  };

  const handleMaxAmount = () => {
    // In a real implementation, calculate the max amount considering fees.
    setFormData({ ...formData, quantity: availableBalance });
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-4">
      <div className="min-h-[80px]">
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
      </div>
      {localError && <div className="text-red-500 mb-2">{localError}</div>}
      <form onSubmit={handleSubmit} className="space-y-6">
        <Field>
          <Label className="text-sm font-medium text-gray-700">
            Destination{formData.destinations.length > 1 ? "s" : ""}{" "}
            <span className="text-red-500">*</span>
          </Label>
          {formData.destinations.map((dest, index) => (
            <div key={dest.id} className="relative mt-1 mb-2">
              <Input
                ref={index === 0 ? firstInputRef : undefined}
                type="text"
                value={dest.address}
                onChange={(e) => handleDestinationChange(dest.id, e.target.value)}
                required
                placeholder={
                  index === 0
                    ? "Enter destination address"
                    : `Destination address ${index + 1}`
                }
                className="block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500 pr-16"
              />
              <div className="absolute right-1 top-1/2 transform -translate-y-1/2 flex space-x-1">
                {index === 0 && formData.asset !== "BTC" && enableMPMA ? (
                  <Button variant="icon" onClick={addDestination} aria-label="Add destination">
                    <FiPlus className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    variant="icon"
                    onClick={() => removeDestination(dest.id)}
                    aria-label="Remove destination"
                  >
                    <FiMinus className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? "" : "hidden"}`}>
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
              onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
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
          <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? "" : "hidden"}`}>
            Available balance: {availableBalance} {formData.asset}
          </Description>
        </Field>

        {formData.asset !== "BTC" && (
          <Field>
            <Label className="text-sm font-medium text-gray-700">Memo</Label>
            <Input
              type="text"
              value={formData.memo}
              onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
              placeholder="Optional memo"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
            <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? "" : "hidden"}`}>
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
                setFormData({ ...formData, feeRateSatPerVByte: parseFloat(e.target.value) || 0 })
              }
              required
              className="block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? "" : "hidden"}`}>
            Higher fees may result in faster confirmation times.
          </Description>
          <div className={`mt-1 ${shouldShowHelpText ? "" : "hidden"}`}>
            <span className="mr-2">Suggested rates:</span>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setFormData({ ...formData, feeRateSatPerVByte: 1 })}
              className="mr-2"
            >
              Low (1)
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setFormData({ ...formData, feeRateSatPerVByte: 5 })}
              className="mr-2"
            >
              Medium (5)
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setFormData({ ...formData, feeRateSatPerVByte: 10 })}
            >
              High (10)
            </Button>
          </div>
        </Field>

        <Button type="submit" color="blue" fullWidth>
          Continue
        </Button>
      </form>
    </div>
  );
}
