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
  target_value?: string;
  feeRateSatPerVByte: number;
}

interface BetFormProps {
  onSubmit: (data: BetFormData) => void;
}

export function BetForm({ onSubmit }: BetFormProps) {
  const [formData, setFormData] = useState<BetFormData>({
    feed_address: "",
    bet_type: "2", // default to "Equal"
    deadline: "",
    wager_quantity: "",
    counterwager_quantity: "",
    expiration: "",
    leverage: "5040",
    target_value: "",
    feeRateSatPerVByte: 1,
  });
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText;

  // For bets we assume XCP is used.
  const { isLoading, error, data } = useAssetDetails("XCP");
  const { assetInfo, availableBalance } = data || {
    assetInfo: null,
    availableBalance: "0",
  };

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
    // For Equal/NotEqual bets, target_value is required.
    if (
      (formData.bet_type === "2" || formData.bet_type === "3") &&
      (!formData.target_value || Number(formData.target_value) <= 0)
    ) {
      setLocalError("Please enter a valid target value for Equal/NotEqual bet.");
      return;
    }
    setLocalError(null);

    // Convert wager and counterwager quantities from decimal to satoshis if divisible.
    const wagerQtyNumber = Number(formData.wager_quantity);
    const counterwagerQtyNumber = Number(formData.counterwager_quantity);
    const convertedWagerQuantity = assetInfo?.divisible
      ? Math.round(wagerQtyNumber * 1e8).toString()
      : Math.round(wagerQtyNumber).toString();
    const convertedCounterwagerQuantity = assetInfo?.divisible
      ? Math.round(counterwagerQtyNumber * 1e8).toString()
      : Math.round(counterwagerQtyNumber).toString();

    const updatedFormData: BetFormData = {
      feed_address: formData.feed_address,
      bet_type: formData.bet_type,
      deadline: formData.deadline.toString(),
      wager_quantity: convertedWagerQuantity,
      counterwager_quantity: convertedCounterwagerQuantity,
      expiration: formData.expiration.toString(),
      leverage: formData.leverage.toString(),
      feeRateSatPerVByte: formData.feeRateSatPerVByte,
      ...( (formData.bet_type === "2" || formData.bet_type === "3") &&
          { target_value: formData.target_value.toString() } ),
    };

    onSubmit(updatedFormData);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-4">
      <div className="min-h-[80px]">
        <Suspense fallback={<div>Loading XCP details...</div>}>
          {isLoading ? (
            <div className="animate-pulse h-12 bg-gray-200 rounded"></div>
          ) : error ? (
            <div className="text-red-500">{error.message}</div>
          ) : (
            <BalanceHeader
              balance={{
                asset: "XCP",
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
            Feed Address <span className="text-red-500">*</span>
          </Label>
          <div className="relative mt-1 mb-2">
            <Input
              ref={inputRef}
              type="text"
              name="feed_address"
              value={formData.feed_address}
              onChange={(e) =>
                setFormData({ ...formData, feed_address: e.target.value.trim() })
              }
              required
              placeholder="Enter feed address"
              className="block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? "" : "hidden"}`}>
            Enter the address of the feed you want to bet on.
          </Description>
        </Field>

        <Field>
          <Label className="text-sm font-medium text-gray-700">
            Bet Type <span className="text-red-500">*</span>
          </Label>
          <div className="relative mt-1 mb-2">
            <select
              name="bet_type"
              value={formData.bet_type}
              onChange={(e) => setFormData({ ...formData, bet_type: e.target.value })}
              required
              className="block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="0">Bullish CFD (deprecated)</option>
              <option value="1">Bearish CFD (deprecated)</option>
              <option value="2">Equal</option>
              <option value="3">NotEqual</option>
            </select>
          </div>
          <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? "" : "hidden"}`}>
            Select the type of bet.
          </Description>
        </Field>

        <Field>
          <Label className="text-sm font-medium text-gray-700">
            Deadline (Unix Timestamp) <span className="text-red-500">*</span>
          </Label>
          <div className="relative mt-1 mb-2">
            <Input
              type="text"
              name="deadline"
              value={formData.deadline}
              onChange={(e) =>
                setFormData({ ...formData, deadline: e.target.value.trim() })
              }
              required
              placeholder="Enter deadline in Unix time (seconds)"
              className="block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? "" : "hidden"}`}>
            Enter the Unix timestamp at which the bet should be settled.
          </Description>
        </Field>

        <Field>
          <Label className="text-sm font-medium text-gray-700">
            Wager Quantity (XCP) <span className="text-red-500">*</span>
          </Label>
          <div className="relative mt-1 mb-2">
            <Input
              type="text"
              name="wager_quantity"
              value={formData.wager_quantity}
              onChange={(e) =>
                setFormData({ ...formData, wager_quantity: e.target.value.trim() })
              }
              required
              placeholder="Enter wager amount"
              className="block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? "" : "hidden"}`}>
            Enter the amount of XCP to wager (in decimal; will be converted to satoshis).
          </Description>
        </Field>

        <Field>
          <Label className="text-sm font-medium text-gray-700">
            Counterwager Quantity (XCP) <span className="text-red-500">*</span>
          </Label>
          <div className="relative mt-1 mb-2">
            <Input
              type="text"
              name="counterwager_quantity"
              value={formData.counterwager_quantity}
              onChange={(e) =>
                setFormData({ ...formData, counterwager_quantity: e.target.value.trim() })
              }
              required
              placeholder="Enter counterwager amount"
              className="block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? "" : "hidden"}`}>
            Enter the minimum counterwager amount for the bet to match.
          </Description>
        </Field>

        <Field>
          <Label className="text-sm font-medium text-gray-700">
            Expiration (Blocks) <span className="text-red-500">*</span>
          </Label>
          <div className="relative mt-1 mb-2">
            <Input
              type="text"
              name="expiration"
              value={formData.expiration}
              onChange={(e) =>
                setFormData({ ...formData, expiration: e.target.value.trim() })
              }
              required
              placeholder="Enter expiration block count"
              className="block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? "" : "hidden"}`}>
            Enter the number of blocks after which the bet expires if unmatched.
          </Description>
        </Field>

        <Field>
          <Label className="text-sm font-medium text-gray-700">
            Leverage <span className="text-red-500">*</span>
          </Label>
          <div className="relative mt-1 mb-2">
            <Input
              type="text"
              name="leverage"
              value={formData.leverage}
              onChange={(e) =>
                setFormData({ ...formData, leverage: e.target.value.trim() })
              }
              required
              placeholder="Enter leverage (default 5040)"
              className="block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? "" : "hidden"}`}>
            Enter the leverage as a fraction of 5040.
          </Description>
        </Field>

        {(formData.bet_type === "2" || formData.bet_type === "3") && (
          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Target Value <span className="text-red-500">*</span>
            </Label>
            <div className="relative mt-1 mb-2">
              <Input
                type="text"
                name="target_value"
                value={formData.target_value}
                onChange={(e) =>
                  setFormData({ ...formData, target_value: e.target.value.trim() })
                }
                required
                placeholder="Enter target value"
                className="block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? "" : "hidden"}`}>
              Enter the target value for Equal/NotEqual bet.
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
