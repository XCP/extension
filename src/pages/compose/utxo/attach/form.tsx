import React, { useState, useRef, useEffect, Suspense } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { BalanceHeader } from "@/components/headers/balance-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";

export interface AttachFormData {
  asset: string;
  quantity: string;
  utxo_value?: string;
  destination_vout?: string;
  feeRateSatPerVByte: number;
}

interface AttachFormProps {
  onSubmit: (data: AttachFormData) => void;
  initialAsset?: string;
}

export function AttachForm({ onSubmit, initialAsset = "" }: AttachFormProps) {
  const [formData, setFormData] = useState<AttachFormData>({
    asset: initialAsset,
    quantity: "",
    utxo_value: "",
    destination_vout: "",
    feeRateSatPerVByte: 1,
  });
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText;

  // Load asset details if asset is provided.
  const { isLoading, error, data } = useAssetDetails(formData.asset);
  const { assetInfo } = data || { assetInfo: null };

  const { activeAddress } = useWallet();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!formData.asset) {
      setLocalError("Please enter an asset.");
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

    // Convert quantity to satoshis if asset is divisible.
    let convertedQuantity = formData.quantity;
    if (assetInfo && assetInfo.divisible) {
      const qty = Number(formData.quantity);
      convertedQuantity = Math.round(qty * 1e8).toString();
    }

    const updatedFormData: AttachFormData = {
      asset: formData.asset,
      quantity: convertedQuantity,
      feeRateSatPerVByte: formData.feeRateSatPerVByte,
      ...(formData.utxo_value && { utxo_value: formData.utxo_value.trim() }),
      ...(formData.destination_vout && { destination_vout: formData.destination_vout.trim() }),
    };

    onSubmit(updatedFormData);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-4">
      {formData.asset && (
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
                  quantity_normalized: "", // Balance not needed for attach
                }}
                className="mb-4"
              />
            )}
          </Suspense>
        </div>
      )}
      {localError && <div className="text-red-500 mb-2">{localError}</div>}
      <form onSubmit={handleSubmit} className="space-y-6">
        <Field>
          <Label className="text-sm font-medium text-gray-700">
            Asset <span className="text-red-500">*</span>
          </Label>
          <div className="relative mt-1 mb-2">
            <Input
              ref={inputRef}
              type="text"
              name="asset"
              value={formData.asset}
              onChange={(e) =>
                setFormData({ ...formData, asset: e.target.value.trim() })
              }
              required
              placeholder="Enter asset name"
              className="block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
            Enter the asset you want to attach.
          </Description>
        </Field>

        <Field>
          <Label className="text-sm font-medium text-gray-700">
            Quantity <span className="text-red-500">*</span>
          </Label>
          <div className="relative mt-1 mb-2">
            <Input
              type="text"
              name="quantity"
              value={formData.quantity}
              onChange={(e) =>
                setFormData({ ...formData, quantity: e.target.value.trim() })
              }
              required
              placeholder="Enter quantity to attach"
              className="block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
            Enter the quantity to attach (in decimal; will be converted to satoshis if divisible).
          </Description>
        </Field>

        <Field>
          <Label className="text-sm font-medium text-gray-700">
            UTXO Value (satoshis)
          </Label>
          <div className="relative mt-1 mb-2">
            <Input
              type="text"
              name="utxo_value"
              value={formData.utxo_value}
              onChange={(e) =>
                setFormData({ ...formData, utxo_value: e.target.value.trim() })
              }
              placeholder="Optional utxo value"
              className="block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
            Optionally specify the UTXO value (in satoshis).
          </Description>
        </Field>

        <Field>
          <Label className="text-sm font-medium text-gray-700">
            Destination Vout
          </Label>
          <div className="relative mt-1 mb-2">
            <Input
              type="text"
              name="destination_vout"
              value={formData.destination_vout}
              onChange={(e) =>
                setFormData({ ...formData, destination_vout: e.target.value.trim() })
              }
              placeholder="Optional destination vout"
              className="block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
            Optionally specify the destination vout.
          </Description>
        </Field>

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
