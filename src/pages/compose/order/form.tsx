"use client";

import axios from "axios";
import { useEffect, useState } from "react";
import { FaCog } from "react-icons/fa";
import { Button } from "@/components/button";
import { AmountWithMaxInput } from "@/components/inputs/amount-with-max-input";
import { AssetSelectInput } from "@/components/inputs/asset-select-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { PriceWithSuggestInput } from "@/components/inputs/price-with-suggest-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import type { OrderOptions } from "@/utils/blockchain/counterparty";
import { toBigNumber } from "@/utils/numeric";
import { formatAmount } from "@/utils/format";
import { BalanceHeader } from "@/components/headers/balance-header";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import type { ReactElement } from "react";
import { useFormStatus } from "react-dom";

interface TradingPairData {
  last_trade_price: string | null;
  name: string;
}

/**
 * Props for the OrderForm component, aligned with Composer's formAction.
 */
interface OrderFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: OrderOptions | null;
  giveAsset: string;
  setError: (error: string | null) => void;
}

/**
 * Form for creating a buy/sell order using React 19 Actions.
 */
export function OrderForm({
  formAction,
  initialFormData,
  giveAsset,
  setError,
}: OrderFormProps): ReactElement {
  const { activeAddress } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText ?? false;
  const { pending } = useFormStatus();

  const [type, setType] = useState<"buy" | "sell">(initialFormData?.give_quantity ? "sell" : "buy");
  const [price, setPrice] = useState<string>("");
  
  const { data: giveAssetDetails } = useAssetDetails(giveAsset);
  const { data: orderAssetDetails } = useAssetDetails(initialFormData?.get_asset || (giveAsset === "XCP" ? "BTC" : "XCP"));
  const { data: getAssetDetails } = useAssetDetails(type === "buy" ? giveAsset : initialFormData?.get_asset || (giveAsset === "XCP" ? "BTC" : "XCP"));

  const [tabLoading, setTabLoading] = useState(false);
  const [isPairFlipped, setIsPairFlipped] = useState(false);
  const [tradingPairData, setTradingPairData] = useState<TradingPairData | null>(null);

  const isGiveAssetDivisible = giveAssetDetails?.isDivisible ?? true;
  const isOrderAssetDivisible = orderAssetDetails?.isDivisible ?? true;
  const isGetAssetDivisible = getAssetDetails?.isDivisible ?? true;
  const availableBalance = giveAssetDetails?.availableBalance ?? "0";
  const orderAssetBalance = orderAssetDetails?.availableBalance ?? "0";

  // Focus amount input on mount
  useEffect(() => {
    if (!tabLoading) {
      const input = document.querySelector("input[name='amount']") as HTMLInputElement;
      input?.focus();
    }
  }, [tabLoading]);

  // Fetch trading pair data
  useEffect(() => {
    const fetchTradingPairData = async () => {
      if (!giveAsset || !initialFormData?.get_asset) return;

      try {
        const give = type === "buy" ? initialFormData?.get_asset : giveAsset;
        const get = type === "buy" ? giveAsset : initialFormData?.get_asset;
        const response = await axios.get(`https://app.xcp.io/api/v1/swap/${give}/${get}`);
        const lastTradePrice = response.data?.data?.trading_pair?.last_trade_price || null;
        const tradingPairName = response.data?.data?.trading_pair?.name || "";
        setTradingPairData({ last_trade_price: lastTradePrice, name: tradingPairName });
      } catch (err) {
        console.error("Failed to fetch trading pair data:", err);
        setTradingPairData(null);
      }
    };

    fetchTradingPairData();
  }, [giveAsset, initialFormData?.get_asset, type]);

  const handleOrderTypeChange = (newType: "buy" | "sell") => {
    setTabLoading(true);
    setType(newType);
    setTimeout(() => setTabLoading(false), 150);
  };

  // Handle price change
  const handlePriceChange = (newPrice: string) => {
    setPrice(newPrice);
  };

  const isBuy = type === "buy";

  return (
    <div className="space-y-4">
      {activeAddress && giveAssetDetails && (
        <BalanceHeader
          balance={{
            asset: giveAsset,
            quantity_normalized: giveAssetDetails.availableBalance,
            asset_info: giveAssetDetails.assetInfo || undefined,
          }}
          className="mt-1 mb-3"
        />
      )}
      <div className="flex justify-between items-center mb-2">
        <div className="flex space-x-4">
          <button
            type="button"
            className={`text-lg font-semibold bg-transparent p-0 cursor-pointer focus:outline-none ${
              type === "buy" ? "underline" : ""
            }`}
            onClick={() => handleOrderTypeChange("buy")}
            disabled={pending}
          >
            Buy
          </button>
          <button
            type="button"
            className={`text-lg font-semibold bg-transparent p-0 cursor-pointer focus:outline-none ${
              type === "sell" ? "underline" : ""
            }`}
            onClick={() => handleOrderTypeChange("sell")}
            disabled={pending}
          >
            Sell
          </button>
        </div>
        <button
          type="button"
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          aria-label="Order Settings"
          disabled={pending}
        >
          <FaCog className="w-5 h-5 text-gray-600" aria-hidden="true" />
        </button>
      </div>
      {tabLoading ? (
        <div className="flex justify-center items-center h-[21rem]">Loading...</div>
      ) : (
        <div className="bg-white rounded-lg shadow-lg p-4">
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="type" value={type} />
            <input type="hidden" name="give_asset" value={isBuy ? (initialFormData?.get_asset || (giveAsset === "XCP" ? "BTC" : "XCP")) : giveAsset} />
            <input type="hidden" name="get_asset" value={isBuy ? giveAsset : (initialFormData?.get_asset || (giveAsset === "XCP" ? "BTC" : "XCP"))} />
            <AmountWithMaxInput
              asset={giveAsset}
              availableBalance={isBuy ? "" : availableBalance}
              value={initialFormData?.give_quantity?.toString() || initialFormData?.get_quantity?.toString() || ""}
              onChange={() => {}} // No-op since formAction handles submission
              sat_per_vbyte={initialFormData?.sat_per_vbyte || 1}
              setError={setError}
              shouldShowHelpText={shouldShowHelpText}
              sourceAddress={activeAddress}
              maxAmount={isBuy ? (price ? formatAmount({
                value: toBigNumber(orderAssetBalance).dividedBy(toBigNumber(price)).toNumber(),
                maximumFractionDigits: isGetAssetDivisible ? 8 : 0,
                minimumFractionDigits: 0
              }) : "") : availableBalance}
              disableMaxButton={!isBuy || !price}
              label="Amount"
              name="amount"
              description={`Amount to ${isBuy ? "buy" : "sell"}. ${isBuy ? (isGetAssetDivisible ? "Enter up to 8 decimal places." : "Enter whole numbers only.") : (isGiveAssetDivisible ? "Enter up to 8 decimal places." : "Enter whole numbers only.")}`}
              disabled={pending}
            />
            <AssetSelectInput
              selectedAsset={initialFormData?.get_asset || (giveAsset === "XCP" ? "BTC" : "XCP")}
              onChange={() => {}} // No-op since formAction handles submission
              label="Quote"
              shouldShowHelpText={shouldShowHelpText}
            />
            <PriceWithSuggestInput
              value={price}
              onChange={handlePriceChange}
              tradingPairData={tradingPairData}
              shouldShowHelpText={shouldShowHelpText}
              label="Price"
              name="price"
              priceDescription={`Price per unit in ${initialFormData?.get_asset || (giveAsset === "XCP" ? "BTC" : "XCP")}`}
              showPairFlip={true}
              isPairFlipped={isPairFlipped}
              setIsPairFlipped={setIsPairFlipped}
            />

            <FeeRateInput showHelpText={shouldShowHelpText} disabled={pending} />
            
            <Button type="submit" color="blue" fullWidth disabled={pending}>
              {pending ? "Submitting..." : "Continue"}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
