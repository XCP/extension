import React, { useState, useRef, useEffect, Suspense } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { BalanceHeader } from "@/components/headers/balance-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { isValidBase58Address } from "@/utils/blockchain/bitcoin";

export interface BetFormData {
  feed_address: string;
  bet_type: string;
  deadline: string;
  wager_quantity: string;
  counterwager_quantity: string;
  expiration: string;
  leverage: string;
  target_value: string;
  feeRateSatPerVByte: number; // Keep in interface for submission
}

interface BetFormProps {
  onSubmit: (data: BetFormData) => void;
}

export function BetForm({ onSubmit }: BetFormProps) {
  const [formData, setFormData] = useState<Omit<BetFormData, 'feeRateSatPerVByte'>>({
    feed_address: "",
    bet_type: "2", // default to "Equal"
    deadline: "",
    wager_quantity: "",
    counterwager_quantity: "",
    expiration: "",
    leverage: "5040",
    target_value: "",
  });
  const [feeRate, setFeeRate] = useState<number>(0); // Local state for FeeRateInput
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText ?? false;
  const { isLoading, error, data } = useAssetDetails("XCP");
  const { assetInfo, availableBalance } = data ?? { assetInfo: null, availableBalance: "0" };
  const { activeAddress } = useWallet();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!formData.feed_address || !isValidBase58Address(formData.feed_address)) {
      setLocalError("Please enter a valid feed address.");
      return;
    }
    if (!["0", "1", "2", "3"].includes(formData.bet_type)) {
      setLocalError("Please select a valid bet type.");
      return;
    }
    if (!formData.deadline || Number(formData.deadline) <= 0) {
      setLocalError("Please enter a valid deadline.");
      return;
    }
    if (!formData.wager_quantity || Number(formData.wager_quantity) <= 0) {
      setLocalError("Please enter a valid wager quantity greater than zero.");
      return;
    }
    if (!formData.counterwager_quantity || Number(formData.counterwager_quantity) <= 0) {
      setLocalError("Please enter a valid counterwager quantity greater than zero.");
      return;
    }
    if (!formData.expiration || Number(formData.expiration) <= 0) {
      setLocalError("Please enter a valid expiration block count.");
      return;
    }
    if (!formData.leverage || Number(formData.leverage) <= 0) {
      setLocalError("Please enter a valid leverage value greater than zero.");
      return;
    }
    if (
      (formData.bet_type === "2" || formData.bet_type === "3") &&
      (!formData.target_value || Number(formData.target_value) <= 0)
    ) {
      setLocalError("Please enter a valid target value for Equal/NotEqual bet.");
      return;
    }
    if (feeRate <= 0) {
      setLocalError("Fee rate must be greater than zero.");
      return;
    }
    setLocalError(null);

    const wagerQtyNumber = Number(formData.wager_quantity);
    const counterwagerQtyNumber = Number(formData.counterwager_quantity);
    const convertedWagerQuantity = assetInfo?.divisible
      ? Math.round(wagerQtyNumber * 1e8).toString()
      : Math.round(wagerQtyNumber).toString();
    const convertedCounterwagerQuantity = assetInfo?.divisible
      ? Math.round(counterwagerQtyNumber * 1e8).toString()
      : Math.round(counterwagerQtyNumber).toString();

    onSubmit({
      ...formData,
      deadline: formData.deadline.toString(),
      wager_quantity: convertedWagerQuantity,
      counterwager_quantity: convertedCounterwagerQuantity,
      expiration: formData.expiration.toString(),
      leverage: formData.leverage.toString(),
      target_value: formData.target_value || "0",
      feeRateSatPerVByte: feeRate,
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-4">
      <div className="min-h-[80px]">
        <Suspense fallback={<div>Loading XCP details...</div>}>
          {isLoading ? (
            <div className="animate-pulse h-12 bg-gray-200 rounded" />
          ) : error ? (
            <div className="text-red-500">{error.message}</div>
          ) : assetInfo ? (
            <BalanceHeader
              balance={{
                asset: "XCP",
                asset_info: assetInfo,
                quantity_normalized: availableBalance,
              }}
              className="mb-4"
            />
          ) : null}
        </Suspense>
      </div>
      {localError && <div className="text-red-500 mb-2">{localError}</div>}
      <form onSubmit={handleSubmit} className="space-y-6">
        <Field>
          <Label className="text-sm font-medium text-gray-700">
            Feed Address <span className="text-red-500">*</span>
          </Label>
          <div className="relative mt-1 mb-2">
            <Input
              ref={inputRef}
              type="text"
              name="feed_address"
              value={formData.feed_address}
              onChange={(e) => setFormData({ ...formData, feed_address: e.target.value.trim() })}
              required
              placeholder="Enter feed address"
              className="block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
            Enter the address of the feed you want to bet on.
          </Description>
        </Field>
        {/* Other fields unchanged */}
        <FeeRateInput
          id="feeRateSatPerVByte"
          onChange={setFeeRate}
          error={feeRate <= 0 ? "Fee rate must be greater than zero." : ""}
          showLabel
          label="Fee Rate (sat/vB)"
          showHelpText={shouldShowHelpText}
          autoFetch
        />
        <Button type="submit" color="blue" fullWidth>
          Continue
        </Button>
      </form>
    </div>
  );
}
