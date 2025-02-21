import React, { useState, useRef, useEffect, FormEvent } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { BalanceHeader } from "@/components/headers/balance-header";
import { AmountWithMaxInput } from "@/components/inputs/amount-with-max-input";
import { AssetSelectInput } from "@/components/inputs/asset-select-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";

export interface SendFormData {
  destination: string;
  quantity: string;
  asset: string;
  memo: string;

}

interface SendFormProps {
  onSubmit: (data: SendFormData) => void;
  initialAsset?: string;
}

export function SendForm({ onSubmit, initialAsset }: SendFormProps) {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText;

  const [formData, setFormData] = useState<SendFormData>({
    destination: "",
    quantity: "",
    asset: initialAsset || "BTC",
    memo: "",
    feeRateSatPerVByte: 10, // Updated default to 10 sat/vB
  });
  const [availableBalance, setAvailableBalance] = useState<string>("0");
  const [assetInfo, setAssetInfo] = useState<any>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const destinationRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    destinationRef.current?.focus();
  }, []);

  useEffect(() => {
    const fetchBalance = async () => {
      if (!activeAddress?.address || !formData.asset) return;
      try {
        const { availableBalance, assetInfo } = await import("@/utils/blockchain/counterparty").then(
          (module) => module.fetchAssetDetailsAndBalance(formData.asset, activeAddress.address)
        );
        setAvailableBalance(availableBalance);
        setAssetInfo(assetInfo);
      } catch (err) {
        console.error("Failed to fetch balance:", err);
        setLocalError("Failed to fetch balance.");
      }
    };
    fetchBalance();
  }, [activeAddress?.address, formData.asset]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (
      !formData.destination.trim() ||
      !formData.quantity ||
      Number(formData.quantity) <= 0 ||
      !formData.asset ||
      formData.feeRateSatPerVByte <= 0
    ) {
      setLocalError("Please fill all required fields with valid values.");
      return;
    }
    setLocalError(null);
    onSubmit(formData);
  };

  return (
    <div className="space-y-4">
      {activeAddress && (
        <BalanceHeader
          balance={{
            asset: formData.asset,
            quantity_normalized: availableBalance,
            asset_info: assetInfo,
          }}
          className="mb-4"
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
                setFormData((prev) => ({ ...prev, destination: e.target.value.trim() }))
              }
              required
              placeholder="Enter destination address"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the address to send the asset to.
            </Description>
          </Field>

          <AssetSelectInput
            selectedAsset={formData.asset}
            onChange={(asset) => {
              setFormData((prev) => ({
                ...prev,
                asset,
                quantity: "", // Reset quantity when asset changes
              }));
              setAvailableBalance("0"); // Reset balance until fetched
              setAssetInfo(null);
            }}
            label="Asset"
            required
            shouldShowHelpText={shouldShowHelpText}
            description="Select the asset you want to send."
          />

          <AmountWithMaxInput
            asset={formData.asset}
            availableBalance={availableBalance}
            value={formData.quantity}
            onChange={(value) => setFormData((prev) => ({ ...prev, quantity: value }))}
            feeRateSatPerVByte={formData.feeRateSatPerVByte}
            setError={setLocalError}
            sourceAddress={activeAddress}
            maxAmount={availableBalance}
            shouldShowHelpText={shouldShowHelpText}
            label="Amount"
            name="quantity"
            description={
              assetInfo?.divisible
                ? "Enter the amount to send (up to 8 decimal places)."
                : "Enter a whole number amount."
            }
          />

          <Field>
            <Label className="text-sm font-medium text-gray-700">Memo</Label>
            <Input
              type="text"
              name="memo"
              value={formData.memo}
              onChange={(e) => setFormData((prev) => ({ ...prev, memo: e.target.value.trim() }))}
              placeholder="Optional memo"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Optional memo to include with the transaction.
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
              !formData.destination.trim() ||
              !formData.quantity ||
              Number(formData.quantity) <= 0 ||
              !formData.asset ||
              formData.feeRateSatPerVByte <= 0
            }
          >
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
