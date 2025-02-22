import React, { useState, useRef, useEffect, FormEvent } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { BalanceHeader } from "@/components/headers/balance-header";
import { AmountWithMaxInput } from "@/components/inputs/amount-with-max-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { SendOptions } from "@/utils/blockchain/counterparty";

interface SendFormDataInternal {
  destination: string;
  quantity: string;
  asset: string;
  memo: string;
  sat_per_vbyte: number;
}

interface SendFormProps {
  onSubmit: (data: SendOptions) => void;
  initialAsset?: string;
  initialFormData?: SendOptions;
}

export function SendForm({ onSubmit, initialAsset, initialFormData }: SendFormProps) {
  const { activeAddress } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText;

  const { data: assetDetails, error: assetDetailsError } = useAssetDetails(
    initialFormData?.asset || initialAsset || "BTC"
  );

  const [formData, setFormData] = useState<SendFormDataInternal>(() => {
    const isBTC = (initialFormData?.asset || initialAsset) === "BTC";
    const isDivisible = isBTC || (assetDetails?.assetInfo?.divisible ?? false);
    const initialQuantity = initialFormData?.quantity || 0;
    const quantityStr = initialFormData && isDivisible 
      ? (initialQuantity / 1e8).toFixed(8) 
      : initialQuantity.toString();

    return {
      destination: initialFormData?.destination || "",
      quantity: initialFormData ? quantityStr : "",
      asset: initialFormData?.asset || initialAsset || "BTC",
      memo: initialFormData?.memo || "",
      sat_per_vbyte: initialFormData?.sat_per_vbyte || 1,
    };
  });
  const [localError, setLocalError] = useState<string | null>(null);

  const destinationRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    destinationRef.current?.focus();
  }, []);

  useEffect(() => {
    if (assetDetailsError) {
      setLocalError("Failed to fetch asset details.");
    }
  }, [assetDetailsError]);

  // Update formData.quantity when assetDetails loads, if initialFormData exists
  useEffect(() => {
    if (initialFormData && assetDetails) {
      const isDivisible = assetDetails.assetInfo?.divisible ?? false;
      const quantityNum = initialFormData.quantity;
      const quantityStr = isDivisible 
        ? (quantityNum / 1e8).toFixed(8) 
        : quantityNum.toString();
      setFormData((prev) => ({
        ...prev,
        quantity: quantityStr,
        asset: initialFormData.asset, // Ensure asset matches initialFormData
      }));
    }
  }, [assetDetails, initialFormData]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (
      !formData.destination.trim() ||
      !formData.quantity ||
      Number(formData.quantity) <= 0 ||
      !formData.asset ||
      formData.sat_per_vbyte <= 0
    ) {
      setLocalError("Please fill all required fields with valid values.");
      return;
    }
    setLocalError(null);

    const isBTC = formData.asset === "BTC";
    const isDivisible = isBTC || (assetDetails?.assetInfo?.divisible ?? false);
    const quantityNum = Number(formData.quantity);
    const quantityInt = isDivisible ? Math.floor(quantityNum * 1e8) : Math.floor(quantityNum);

    const convertedData: SendOptions = {
      sourceAddress: activeAddress?.address || "",
      destination: formData.destination.trim(),
      asset: formData.asset,
      quantity: quantityInt,
      memo: formData.memo.trim() || undefined,
      memo_is_hex: false,
      sat_per_vbyte: formData.sat_per_vbyte,
    };
    onSubmit(convertedData);
  };

  return (
    <div className="space-y-4">
      {activeAddress && assetDetails && (
        <BalanceHeader
          balance={{
            asset: formData.asset,
            quantity_normalized: assetDetails.availableBalance,
            asset_info: assetDetails.assetInfo || undefined,
          }}
          className="mb-5"
        />
      )}
      {localError && <div className="text-red-500 mb-2">{localError}</div>}
      <div className="bg-white rounded-lg shadow-lg p-4">
        <form onSubmit={handleSubmit} className="space-y-6">
          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Destination <span className="text-red-500">*</span>
            </Label>
            <Input
              ref={destinationRef}
              type="text"
              name="destination"
              value={formData.destination}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, destination: e.target.value }))
              }
              required
              placeholder="Enter destination address"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the address to send the asset to.
            </Description>
          </Field>

          <AmountWithMaxInput
            asset={formData.asset}
            availableBalance={assetDetails?.availableBalance || "0"}
            value={formData.quantity}
            onChange={(value) => setFormData((prev) => ({ ...prev, quantity: value }))}
            sat_per_vbyte={formData.sat_per_vbyte}
            setError={setLocalError}
            sourceAddress={activeAddress}
            maxAmount={assetDetails?.availableBalance || "0"}
            shouldShowHelpText={shouldShowHelpText}
            label="Amount"
            name="quantity"
            description={
              assetDetails?.assetInfo?.divisible || formData.asset === "BTC"
                ? "Enter the amount to send (up to 8 decimal places)."
                : "Enter a whole number amount."
            }
          />

          {formData.asset !== "BTC" && (
            <Field>
              <Label className="text-sm font-medium text-gray-700">Memo</Label>
              <Input
                type="text"
                name="memo"
                value={formData.memo}
                onChange={(e) => setFormData((prev) => ({ ...prev, memo: e.target.value }))}
                placeholder="Optional memo"
                className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
              />
              <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
                Optional memo to include with the transaction.
              </Description>
            </Field>
          )}

          <FeeRateInput
            value={formData.sat_per_vbyte}
            onChange={(value) => setFormData((prev) => ({ ...prev, sat_per_vbyte: value }))}
            error={formData.sat_per_vbyte <= 0 ? "Fee rate must be greater than zero." : ""}
            showHelpText={shouldShowHelpText}
          />

          <Button
            type="submit"
            color="blue"
            fullWidth
            disabled={
              !formData.destination.trim() ||
              !formData.quantity ||
              Number(formData.quantity) <= 0 ||
              !formData.asset ||
              formData.sat_per_vbyte <= 0
            }
          >
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
