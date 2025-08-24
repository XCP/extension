"use client";

import axios from "axios";
import { useEffect, useState } from "react";
import { FaCog } from "react-icons/fa";
import { OrderSettings } from "@/pages/settings/order-settings";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
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
import { HeaderSkeleton } from "@/components/skeleton";
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
  error?: string | null;
  showHelpText?: boolean;
}

/**
 * Form for creating a buy/sell order using React 19 Actions.
 */
export function OrderForm({
  formAction,
  initialFormData,
  giveAsset,
  error: composerError,
  showHelpText,
}: OrderFormProps): ReactElement {
  const { activeAddress } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = showHelpText ?? settings?.showHelpText ?? false;
  const { pending } = useFormStatus();

  const [activeTab, setActiveTab] = useState<"buy" | "sell" | "settings">(initialFormData?.give_quantity ? "sell" : "buy");
  const [previousTab, setPreviousTab] = useState<"buy" | "sell">(initialFormData?.give_quantity ? "sell" : "buy");
  const [price, setPrice] = useState<string>("");
  const [amount, setAmount] = useState<string>(initialFormData?.give_quantity?.toString() || initialFormData?.get_quantity?.toString() || "");
  const [error, setError] = useState<{ message: string; } | null>(null);
  const [customExpiration, setCustomExpiration] = useState<number | undefined>(undefined);
  const [customFeeRequired, setCustomFeeRequired] = useState<number>(0);
  const [quoteAsset, setQuoteAsset] = useState<string>(initialFormData?.get_asset || (giveAsset === "XCP" ? "BTC" : "XCP"));
  
  // Set composer error when it occurs
  useEffect(() => {
    if (composerError) {
      setError({ message: composerError });
    }
  }, [composerError]);
  
  const { data: giveAssetDetails } = useAssetDetails(giveAsset);
  const { data: orderAssetDetails } = useAssetDetails(quoteAsset);
  const { data: getAssetDetails } = useAssetDetails(activeTab === "buy" ? giveAsset : quoteAsset);

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
      if (!giveAsset || !quoteAsset) return;

      try {
        const give = activeTab === "buy" ? quoteAsset : giveAsset;
        const get = activeTab === "buy" ? giveAsset : quoteAsset;
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
  }, [giveAsset, quoteAsset, activeTab]);

  const handleTabChange = (newTab: "buy" | "sell" | "settings") => {
    if (newTab !== "settings") {
      setTabLoading(true);
      setTimeout(() => setTabLoading(false), 150);
      setPreviousTab(newTab); // Remember the last buy/sell tab
      setAmount(""); // Reset amount when switching between buy/sell
    }
    setActiveTab(newTab);
  };

  // Handle price change
  const handlePriceChange = (newPrice: string) => {
    setPrice(newPrice);
  };

  const isBuy = activeTab === "buy";

  return (
    <div className="space-y-4">
      {activeAddress ? (
        giveAssetDetails ? (
          <BalanceHeader
            balance={{
              asset: giveAsset,
              quantity_normalized: giveAssetDetails.availableBalance,
              asset_info: giveAssetDetails.assetInfo || undefined,
            }}
            className="mt-1 mb-3"
          />
        ) : (
          <HeaderSkeleton className="mt-1 mb-3" variant="balance" />
        )
      ) : null}
      <div className="flex justify-between items-center mb-2">
        <div className="flex space-x-4">
          <button
            type="button"
            className={`text-lg font-semibold bg-transparent p-0 cursor-pointer focus:outline-none ${
              activeTab === "buy" || (activeTab === "settings" && previousTab === "buy") ? "underline" : ""
            }`}
            onClick={() => handleTabChange("buy")}
            disabled={pending}
          >
            Buy
          </button>
          <button
            type="button"
            className={`text-lg font-semibold bg-transparent p-0 cursor-pointer focus:outline-none ${
              activeTab === "sell" || (activeTab === "settings" && previousTab === "sell") ? "underline" : ""
            }`}
            onClick={() => handleTabChange("sell")}
            disabled={pending}
          >
            Sell
          </button>
        </div>
        <button
          type="button"
          className={`p-2 hover:bg-gray-100 rounded-full transition-colors ${
            activeTab === "settings" ? "bg-gray-100" : ""
          }`}
          onClick={() => activeTab === "settings" ? handleTabChange(previousTab) : handleTabChange("settings")}
          disabled={pending}
          aria-label="Order Settings"
        >
          <FaCog className="w-4 h-4 text-gray-600" aria-hidden="true" />
        </button>
      </div>
      {tabLoading ? (
        <div className="flex justify-center items-center h-[21rem]">Loading...</div>
      ) : activeTab === "settings" ? (
        <OrderSettings 
          customExpiration={customExpiration}
          onExpirationChange={setCustomExpiration}
          customFeeRequired={customFeeRequired}
          onFeeRequiredChange={setCustomFeeRequired}
          isBuyingBTC={previousTab === "buy" && giveAsset === "BTC"}
        />
      ) : (
        <div className="bg-white rounded-lg shadow-lg p-4">
          {error && (
            <ErrorAlert
              message={error.message}
              onClose={() => setError(null)}
            />
          )}
          <form action={(formData) => {
            // Calculate give_quantity and get_quantity based on amount, price, and order type
            const amountValue = parseFloat(amount) || 0;
            const priceValue = parseFloat(price) || 0;
            
            if (amountValue > 0 && priceValue > 0) {
              if (isBuy) {
                // Buying: give quote asset, get base asset
                const giveQty = amountValue * priceValue;
                formData.set('give_quantity', (giveQty * 1e8).toFixed(0)); // Convert to satoshis
                formData.set('get_quantity', (amountValue * 1e8).toFixed(0)); // Convert to satoshis
              } else {
                // Selling: give base asset, get quote asset  
                const getQty = amountValue * priceValue;
                formData.set('give_quantity', (amountValue * 1e8).toFixed(0)); // Convert to satoshis
                formData.set('get_quantity', (getQty * 1e8).toFixed(0)); // Convert to satoshis
              }
            }
            
            formAction(formData);
          }} className="space-y-4">
            <input type="hidden" name="type" value={activeTab} />
            <input type="hidden" name="give_asset" value={isBuy ? quoteAsset : giveAsset} />
            <input type="hidden" name="get_asset" value={isBuy ? giveAsset : quoteAsset} />
            <input type="hidden" name="expiration" value={customExpiration || settings?.defaultOrderExpiration || 8064} />
            {isBuy && giveAsset === "BTC" && (
              <input type="hidden" name="fee_required" value={customFeeRequired} />
            )}
            <AmountWithMaxInput
              asset={giveAsset}
              availableBalance={isBuy ? "" : availableBalance}
              value={amount}
              onChange={setAmount}
              sat_per_vbyte={initialFormData?.sat_per_vbyte || 0.1}
              setError={(message) => message ? setError({ message }) : setError(null)}
              shouldShowHelpText={shouldShowHelpText}
              sourceAddress={activeAddress}
              maxAmount={isBuy ? (price ? formatAmount({
                value: toBigNumber(orderAssetBalance).dividedBy(toBigNumber(price)).toNumber(),
                maximumFractionDigits: isGetAssetDivisible ? 8 : 0,
                minimumFractionDigits: 0
              }) : "") : availableBalance}
              disableMaxButton={isBuy && !price}
              label="Amount"
              name="amount"
              description={`Amount to ${isBuy ? "buy" : "sell"}. ${isBuy ? (isGetAssetDivisible ? "Enter up to 8 decimal places." : "Enter whole numbers only.") : (isGiveAssetDivisible ? "Enter up to 8 decimal places." : "Enter whole numbers only.")}`}
              disabled={pending}
            />
            <input type="hidden" name="quote_asset" value={quoteAsset} />
            <AssetSelectInput
              selectedAsset={quoteAsset}
              onChange={setQuoteAsset}
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
              priceDescription={`Price per unit in ${quoteAsset}`}
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
